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

export interface PhraseComparison {
  phraseIndex: number;
  veoPhrase: PhraseTiming;
  userPhrase: PhraseTiming;
  timeDelta: number; // user duration - veo duration
  percentDifference: number; // (timeDelta / veo duration) * 100
  status: "too_fast" | "too_slow" | "perfect";
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
      
      // End phrase on: punctuation, long pause (>0.5s), or last word
      const endsWithPunctuation = /[.!?,;:]$/.test(word.word);
      const hasLongPause = nextWord && (nextWord.start - word.end) > 0.5;
      
      if (endsWithPunctuation || hasLongPause || isLastWord) {
        // Create phrase from accumulated words
        const phraseText = currentPhraseWords.map(w => w.word).join(' ');
        const startTime = currentPhraseWords[0].start;
        const endTime = currentPhraseWords[currentPhraseWords.length - 1].end;
        
        phrases.push({
          text: phraseText,
          words: [...currentPhraseWords],
          totalDuration: endTime - startTime,
          startTime,
          endTime
        });

        currentPhraseWords = [];
      }
    }

    return phrases;
  }

  /**
   * Align VEO phrases with user phrases using text similarity
   * Simple word-based matching to find corresponding phrases
   */
  alignPhrases(veoPhrases: PhraseTiming[], userPhrases: PhraseTiming[]): PhraseComparison[] {
    const comparisons: PhraseComparison[] = [];
    
    // Simple sequential alignment - assumes same order
    const minLength = Math.min(veoPhrases.length, userPhrases.length);
    
    for (let i = 0; i < minLength; i++) {
      const veoPhrase = veoPhrases[i];
      const userPhrase = userPhrases[i];
      
      const timeDelta = userPhrase.totalDuration - veoPhrase.totalDuration;
      const percentDifference = (timeDelta / veoPhrase.totalDuration) * 100;
      
      let status: "too_fast" | "too_slow" | "perfect";
      if (Math.abs(percentDifference) <= 5) {
        status = "perfect";
      } else if (percentDifference < 0) {
        status = "too_fast";
      } else {
        status = "too_slow";
      }
      
      comparisons.push({
        phraseIndex: i,
        veoPhrase,
        userPhrase,
        timeDelta,
        percentDifference,
        status
      });
    }

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
    const tempFilePath = path.join('/tmp', `pacing_${Date.now()}_${path.basename(objectPath)}`);
    
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

      // Step 3: Align and compare phrases
      const comparisons = this.alignPhrases(veoPhrases, userPhrases);

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
