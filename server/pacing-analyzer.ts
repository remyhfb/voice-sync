import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { ObjectStorageService } from "./objectStorage";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY_PACING });

export interface WordTiming {
  word: string;
  start: number;
  end: number;
}

export interface PhraseTiming {
  text: string;
  words: WordTiming[];
  totalDuration: number;
  startTime: number;
  endTime: number;
}

export interface WordAlignment {
  veoWordIndex: number;
  userWordIndex: number;
  veoWord: WordTiming;
  userWord: WordTiming;
  confidence: number; // 0-1 score
}

export interface PhraseComparison {
  phraseIndex: number;
  veoPhrase: PhraseTiming;
  userPhrase: PhraseTiming;
  timeDelta: number; // user duration - veo duration
  percentDifference: number; // (timeDelta / veo duration) * 100
  status: "too_fast" | "too_slow" | "perfect";
  confidence: number; // 0-1 score based on word alignment
}

export interface PacingAnalysisReport {
  summary: {
    totalPhrases: number;
    avgTimeDelta: number;
    avgPercentDifference: number;
    tooFastCount: number;
    tooSlowCount: number;
    perfectCount: number;
  };
  phraseComparisons: PhraseComparison[];
  recommendations: string[];
}

export class PacingAnalyzer {
  /**
   * Transcribe audio file and extract word-level timestamps using OpenAI Whisper
   * Using verbose_json format for word-level timestamps
   */
  async transcribeWithWordTimestamps(audioPath: string): Promise<WordTiming[]> {
    console.log(`[PacingAnalyzer] Transcribing audio: ${audioPath}`);
    
    const audioReadStream = fs.createReadStream(audioPath);

    // Use verbose_json response format to get word-level timestamps
    const transcription = await openai.audio.transcriptions.create({
      file: audioReadStream,
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["word"]
    });

    // Extract word timings from the response
    const words: WordTiming[] = [];
    
    if (transcription.words && Array.isArray(transcription.words)) {
      for (const wordData of transcription.words) {
        words.push({
          word: wordData.word,
          start: wordData.start,
          end: wordData.end
        });
      }
    }

    console.log(`[PacingAnalyzer] Extracted ${words.length} words with timestamps`);
    return words;
  }

  /**
   * Group words into phrases/sentences based on natural speech patterns
   * Uses punctuation and pause detection
   */
  groupWordsIntoPhrases(words: WordTiming[]): PhraseTiming[] {
    if (words.length === 0) return [];

    const phrases: PhraseTiming[] = [];
    let currentPhraseWords: WordTiming[] = [];

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      currentPhraseWords.push(word);

      // Check if this is the end of a phrase
      const isLastWord = i === words.length - 1;
      const nextWord = i < words.length - 1 ? words[i + 1] : null;
      
      // End phrase on: punctuation, pause (>0.25s), or last word
      const endsWithPunctuation = /[.!?,;:]$/.test(word.word);
      const hasPause = nextWord && (nextWord.start - word.end) > 0.25;
      
      // Log pause detection for debugging
      if (nextWord && (nextWord.start - word.end) > 0.2) {
        console.log(`[PacingAnalyzer] Pause detected: ${word.word} -> ${nextWord.word} (${((nextWord.start - word.end) * 1000).toFixed(0)}ms)`);
      }
      
      if (endsWithPunctuation || hasPause || isLastWord) {
        // Create phrase from accumulated words
        const phraseText = currentPhraseWords.map(w => w.word).join(' ');
        const startTime = currentPhraseWords[0].start;
        const endTime = currentPhraseWords[currentPhraseWords.length - 1].end;
        
        const totalDuration = endTime - startTime;
        
        phrases.push({
          text: phraseText,
          words: [...currentPhraseWords],
          totalDuration,
          startTime,
          endTime
        });

        console.log(`[PacingAnalyzer] Phrase: "${phraseText}" (${totalDuration.toFixed(2)}s from ${startTime.toFixed(2)}s to ${endTime.toFixed(2)}s)`);
        currentPhraseWords = [];
      }
    }

    return phrases;
  }

  /**
   * Calculate Levenshtein distance (edit distance) between two strings
   * Used for text similarity matching
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1].toLowerCase() === str2[j - 1].toLowerCase()) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]) + 1;
        }
      }
    }

    return dp[m][n];
  }

  /**
   * Align VEO and user words using dynamic programming
   * Matches words based on text similarity and preserves chronological order
   */
  private alignWords(veoWords: WordTiming[], userWords: WordTiming[]): WordAlignment[] {
    const alignments: WordAlignment[] = [];
    
    // Normalize words for comparison
    const normalizeWord = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    let veoIdx = 0;
    let userIdx = 0;
    
    while (veoIdx < veoWords.length && userIdx < userWords.length) {
      const veoWord = veoWords[veoIdx];
      const userWord = userWords[userIdx];
      
      const veoNorm = normalizeWord(veoWord.word);
      const userNorm = normalizeWord(userWord.word);
      
      // Calculate similarity (0-1, higher is better)
      const maxLen = Math.max(veoNorm.length, userNorm.length);
      const distance = this.levenshteinDistance(veoNorm, userNorm);
      const similarity = maxLen > 0 ? 1 - (distance / maxLen) : 1;
      
      // If words match well (>70% similarity), align them
      if (similarity > 0.7) {
        alignments.push({
          veoWordIndex: veoIdx,
          userWordIndex: userIdx,
          veoWord,
          userWord,
          confidence: similarity
        });
        veoIdx++;
        userIdx++;
      } else {
        // Check if next word in either sequence matches better
        const veoNextMatch = userIdx + 1 < userWords.length ? 
          1 - (this.levenshteinDistance(veoNorm, normalizeWord(userWords[userIdx + 1].word)) / maxLen) : 0;
        const userNextMatch = veoIdx + 1 < veoWords.length ?
          1 - (this.levenshteinDistance(normalizeWord(veoWords[veoIdx + 1].word), userNorm) / maxLen) : 0;
        
        if (veoNextMatch > userNextMatch && veoNextMatch > 0.7) {
          // Skip current user word
          userIdx++;
        } else if (userNextMatch > 0.7) {
          // Skip current VEO word
          veoIdx++;
        } else {
          // Low confidence match, but still align to preserve order
          alignments.push({
            veoWordIndex: veoIdx,
            userWordIndex: userIdx,
            veoWord,
            userWord,
            confidence: similarity
          });
          veoIdx++;
          userIdx++;
        }
      }
    }
    
    return alignments;
  }

  /**
   * Align VEO phrases with user phrases using word-level alignment
   * VEO phrase boundaries are the source of truth
   */
  alignPhrases(veoWords: WordTiming[], userWords: WordTiming[], veoPhrases: PhraseTiming[], userPhrases: PhraseTiming[]): PhraseComparison[] {
    // First, align words to handle segmentation differences
    const wordAlignments = this.alignWords(veoWords, userWords);
    
    console.log(`[PacingAnalyzer] Aligned ${wordAlignments.length} words with avg confidence ${(wordAlignments.reduce((sum, a) => sum + a.confidence, 0) / wordAlignments.length).toFixed(2)}`);
    
    const comparisons: PhraseComparison[] = [];
    
    // Create a map of VEO word start time -> global word index for fast lookup
    const veoWordIndexMap = new Map<number, number>();
    veoWords.forEach((word, idx) => {
      veoWordIndexMap.set(word.start, idx);
    });
    
    // For each VEO phrase (source of truth), find corresponding user words
    for (let i = 0; i < veoPhrases.length; i++) {
      const veoPhrase = veoPhrases[i];
      
      console.log(`[PacingAnalyzer] Processing VEO phrase ${i + 1}/${veoPhrases.length}: "${veoPhrase.text}"`);
      
      // Find global word indices for this VEO phrase
      const veoWordIndices: number[] = [];
      for (let j = 0; j < veoPhrase.words.length; j++) {
        const wordStart = veoPhrase.words[j].start;
        const globalIdx = veoWordIndexMap.get(wordStart);
        if (globalIdx !== undefined) {
          veoWordIndices.push(globalIdx);
        }
      }
      
      console.log(`[PacingAnalyzer]   VEO phrase has ${veoPhrase.words.length} words, mapped to global indices: ${veoWordIndices.join(', ')}`);
      
      // Find aligned user word indices
      const alignedUserIndices = wordAlignments
        .filter(a => veoWordIndices.includes(a.veoWordIndex))
        .map(a => a.userWordIndex)
        .sort((a, b) => a - b); // Sort to ensure chronological order
      
      console.log(`[PacingAnalyzer]   Aligned to ${alignedUserIndices.length} user words at indices: ${alignedUserIndices.join(', ')}`);
      
      if (alignedUserIndices.length === 0) {
        console.log(`[PacingAnalyzer]   WARNING: No user words aligned for VEO phrase "${veoPhrase.text}", skipping`);
        continue;
      }
      
      // Build user phrase from aligned words (use all words in the span)
      const minUserIdx = Math.min(...alignedUserIndices);
      const maxUserIdx = Math.max(...alignedUserIndices);
      const userAlignedWords = userWords.slice(minUserIdx, maxUserIdx + 1);
      const userPhraseText = userAlignedWords.map(w => w.word).join(' ');
      const userStartTime = userAlignedWords[0].start;
      const userEndTime = userAlignedWords[userAlignedWords.length - 1].end;
      const userDuration = userEndTime - userStartTime;
      
      console.log(`[PacingAnalyzer]   User phrase: "${userPhraseText}" (${userDuration.toFixed(2)}s)`);
      
      // Calculate confidence based on word alignment quality
      const relevantAlignments = wordAlignments.filter(a => veoWordIndices.includes(a.veoWordIndex));
      const avgConfidence = relevantAlignments.length > 0 ?
        relevantAlignments.reduce((sum, a) => sum + a.confidence, 0) / relevantAlignments.length : 0;
      
      const timeDelta = userDuration - veoPhrase.totalDuration;
      const percentDifference = (timeDelta / veoPhrase.totalDuration) * 100;
      
      let status: "too_fast" | "too_slow" | "perfect";
      if (Math.abs(percentDifference) <= 5) {
        status = "perfect";
      } else if (percentDifference < 0) {
        status = "too_fast";
      } else {
        status = "too_slow";
      }
      
      console.log(`[PacingAnalyzer]   Delta: ${timeDelta.toFixed(2)}s (${percentDifference.toFixed(1)}%) - ${status}`);
      
      comparisons.push({
        phraseIndex: i,
        veoPhrase,
        userPhrase: {
          text: userPhraseText,
          words: userAlignedWords,
          totalDuration: userDuration,
          startTime: userStartTime,
          endTime: userEndTime
        },
        timeDelta,
        percentDifference,
        status,
        confidence: avgConfidence
      });
    }

    console.log(`[PacingAnalyzer] Created ${comparisons.length} phrase comparisons from ${veoPhrases.length} VEO phrases`);
    return comparisons;
  }

  /**
   * Generate comprehensive pacing analysis report
   */
  generateReport(comparisons: PhraseComparison[]): PacingAnalysisReport {
    if (comparisons.length === 0) {
      return {
        summary: {
          totalPhrases: 0,
          avgTimeDelta: 0,
          avgPercentDifference: 0,
          tooFastCount: 0,
          tooSlowCount: 0,
          perfectCount: 0
        },
        phraseComparisons: [],
        recommendations: ["No phrases to analyze"]
      };
    }

    // Calculate summary statistics
    const totalPhrases = comparisons.length;
    const avgTimeDelta = comparisons.reduce((sum, c) => sum + c.timeDelta, 0) / totalPhrases;
    const avgPercentDifference = comparisons.reduce((sum, c) => sum + c.percentDifference, 0) / totalPhrases;
    
    const tooFastCount = comparisons.filter(c => c.status === "too_fast").length;
    const tooSlowCount = comparisons.filter(c => c.status === "too_slow").length;
    const perfectCount = comparisons.filter(c => c.status === "perfect").length;

    // Generate recommendations
    const recommendations: string[] = [];
    
    if (Math.abs(avgPercentDifference) <= 5) {
      recommendations.push("✅ Overall pacing matches the VEO video very well!");
    } else if (avgPercentDifference > 20) {
      recommendations.push(`⚠️ You're speaking ${Math.round(avgPercentDifference)}% slower on average. Try to speed up your delivery.`);
    } else if (avgPercentDifference < -20) {
      recommendations.push(`⚠️ You're speaking ${Math.round(Math.abs(avgPercentDifference))}% faster on average. Try to slow down your delivery.`);
    }

    if (tooFastCount > totalPhrases * 0.3) {
      recommendations.push(`🏃 ${tooFastCount} phrases are too fast (${Math.round(tooFastCount / totalPhrases * 100)}%). Focus on taking more time with these lines.`);
    }

    if (tooSlowCount > totalPhrases * 0.3) {
      recommendations.push(`🐌 ${tooSlowCount} phrases are too slow (${Math.round(tooSlowCount / totalPhrases * 100)}%). Try to pick up the pace on these lines.`);
    }

    return {
      summary: {
        totalPhrases,
        avgTimeDelta,
        avgPercentDifference,
        tooFastCount,
        tooSlowCount,
        perfectCount
      },
      phraseComparisons: comparisons,
      recommendations
    };
  }

  /**
   * Download audio file from object storage to temporary location
   */
  private async downloadAudioFile(objectPath: string, objectStorageService: ObjectStorageService): Promise<string> {
    console.log(`[PacingAnalyzer] Downloading ${objectPath} to temporary location`);
    
    const file = await objectStorageService.getObjectEntityFile(objectPath);
    const tempFilePath = path.join('/tmp', `pacing_${Date.now()}_${path.basename(objectPath)}.mp3`);
    
    // Download file to temporary location
    await new Promise<void>((resolve, reject) => {
      const writeStream = fs.createWriteStream(tempFilePath);
      file.createReadStream()
        .on('error', reject)
        .pipe(writeStream)
        .on('finish', resolve)
        .on('error', reject);
    });
    
    console.log(`[PacingAnalyzer] Downloaded to ${tempFilePath}`);
    return tempFilePath;
  }

  /**
   * Main analysis function - orchestrates the entire pacing analysis
   */
  async analyzePacing(
    veoAudioPath: string, 
    userAudioPath: string,
    objectStorageService: ObjectStorageService
  ): Promise<PacingAnalysisReport> {
    console.log(`[PacingAnalyzer] Starting pacing analysis`);
    console.log(`[PacingAnalyzer] VEO audio: ${veoAudioPath}`);
    console.log(`[PacingAnalyzer] User audio: ${userAudioPath}`);

    let localVeoPath: string | null = null;
    let localUserPath: string | null = null;

    try {
      // Download audio files from object storage to temporary locations
      [localVeoPath, localUserPath] = await Promise.all([
        this.downloadAudioFile(veoAudioPath, objectStorageService),
        this.downloadAudioFile(userAudioPath, objectStorageService)
      ]);

      // Step 1: Transcribe both audio files with word-level timestamps
      const [veoWords, userWords] = await Promise.all([
        this.transcribeWithWordTimestamps(localVeoPath),
        this.transcribeWithWordTimestamps(localUserPath)
      ]);

      console.log(`[PacingAnalyzer] VEO: ${veoWords.length} words, User: ${userWords.length} words`);

      // Step 2: Group words into phrases
      const veoPhrases = this.groupWordsIntoPhrases(veoWords);
      const userPhrases = this.groupWordsIntoPhrases(userWords);

      console.log(`[PacingAnalyzer] VEO: ${veoPhrases.length} phrases, User: ${userPhrases.length} phrases`);

      // Step 3: Align and compare phrases using word-level alignment
      const comparisons = this.alignPhrases(veoWords, userWords, veoPhrases, userPhrases);

      // Step 4: Generate report
      const report = this.generateReport(comparisons);

      console.log(`[PacingAnalyzer] Analysis complete. Avg difference: ${report.summary.avgPercentDifference.toFixed(1)}%`);

      return report;
    } finally {
      // Clean up temporary files
      if (localVeoPath) {
        try {
          await fs.promises.unlink(localVeoPath);
          console.log(`[PacingAnalyzer] Cleaned up ${localVeoPath}`);
        } catch (err) {
          console.error(`[PacingAnalyzer] Failed to clean up ${localVeoPath}:`, err);
        }
      }
      if (localUserPath) {
        try {
          await fs.promises.unlink(localUserPath);
          console.log(`[PacingAnalyzer] Cleaned up ${localUserPath}`);
        } catch (err) {
          console.error(`[PacingAnalyzer] Failed to clean up ${localUserPath}:`, err);
        }
      }
    }
  }
}
