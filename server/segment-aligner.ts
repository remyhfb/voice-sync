import { ReplicateService } from "./replicate";

export interface TimeSegment {
  text: string;
  start: number;
  end: number;
  duration: number;
  type: "speech" | "pause";
  words?: Array<{
    word: string;
    start: number;
    end: number;
  }>;
}

export interface AlignmentResult {
  veoSegment: TimeSegment;
  userSegment: TimeSegment;
  timeStretchRatio: number; // user_duration / veo_duration
  method: "stretch" | "compress" | "keep"; // What to do with video segment
}


export class SegmentAligner {
  private replicate: ReplicateService;

  constructor() {
    this.replicate = new ReplicateService();
  }

  /**
   * Transcribe audio and extract word-level segments with pauses
   */
  async extractSegments(audioPath: string): Promise<TimeSegment[]> {
    const transcriptData = await this.replicate.transcribeWithTimestamps(audioPath);
    const segments: TimeSegment[] = [];

    // Add initial pause if speech doesn't start at 0
    if (transcriptData.segments.length > 0 && transcriptData.segments[0].start > 0.05) {
      segments.push({
        text: "[silence]",
        start: 0,
        end: transcriptData.segments[0].start,
        duration: transcriptData.segments[0].start,
        type: "pause"
      });
    }

    // Add speech segments and pauses between them
    for (let i = 0; i < transcriptData.segments.length; i++) {
      const segment = transcriptData.segments[i];
      
      // Add speech segment with word-level timestamps
      segments.push({
        text: segment.text,
        start: segment.start,
        end: segment.end,
        duration: segment.end - segment.start,
        type: "speech",
        words: segment.words // Preserve word-level timestamps
      });

      // Add pause after this segment if there's a next segment
      if (i < transcriptData.segments.length - 1) {
        const nextSegment = transcriptData.segments[i + 1];
        const pauseDuration = nextSegment.start - segment.end;
        
        if (pauseDuration > 0.05) { // Only add pause if > 50ms
          segments.push({
            text: "[pause]",
            start: segment.end,
            end: nextSegment.start,
            duration: pauseDuration,
            type: "pause"
          });
        }
      }
    }

    return segments;
  }

  /**
   * Align VEO video segments with user audio segments using text similarity
   * Ensures all VEO segments are processed (no truncation)
   */
  async alignSegments(
    veoSegments: TimeSegment[],
    userSegments: TimeSegment[]
  ): Promise<AlignmentResult[]> {
    const alignments: AlignmentResult[] = [];

    // Separate speech and pause segments
    const veoSpeech = veoSegments.filter(s => s.type === "speech");
    const userSpeech = userSegments.filter(s => s.type === "speech");

    // Align speech segments using text similarity (word matching)
    const speechAlignments = this.alignSpeechSegments(veoSpeech, userSpeech);

    // Reconstruct full alignment including pauses
    let veoIndex = 0;
    let alignmentIndex = 0;

    for (const veoSeg of veoSegments) {
      if (veoSeg.type === "pause") {
        // For pauses, find corresponding user pause or use a default ratio
        const userPause = userSegments.find((u, i) => 
          i > alignmentIndex - 1 && 
          i < alignmentIndex + 1 && 
          u.type === "pause"
        );

        const ratio = userPause 
          ? userPause.duration / veoSeg.duration
          : 1.0; // Default: keep pause duration

        alignments.push({
          veoSegment: veoSeg,
          userSegment: userPause || veoSeg, // Use VEO pause if no user pause
          timeStretchRatio: ratio,
          method: ratio >= 0.9 && ratio <= 1.1 ? "keep" : ratio > 1.1 ? "stretch" : "compress"
        });
      } else {
        // For speech, use aligned result
        if (alignmentIndex < speechAlignments.length) {
          alignments.push(speechAlignments[alignmentIndex]);
          alignmentIndex++;
        } else {
          // If user has fewer speech segments, pad with 1:1 ratio
          console.warn(`[Aligner] No user segment for VEO speech: "${veoSeg.text}"`);
          alignments.push({
            veoSegment: veoSeg,
            userSegment: veoSeg,
            timeStretchRatio: 1.0,
            method: "keep"
          });
        }
      }
      veoIndex++;
    }

    return alignments;
  }

  /**
   * Align speech segments using text word-level similarity
   */
  private alignSpeechSegments(
    veoSpeech: TimeSegment[],
    userSpeech: TimeSegment[]
  ): AlignmentResult[] {
    const alignments: AlignmentResult[] = [];

    // For each VEO speech segment, find best matching user segment
    let userIndex = 0;

    for (const veoSeg of veoSpeech) {
      if (userIndex >= userSpeech.length) {
        // No more user segments - keep VEO timing
        console.warn(`[Aligner] Ran out of user segments at VEO: "${veoSeg.text}"`);
        alignments.push({
          veoSegment: veoSeg,
          userSegment: veoSeg,
          timeStretchRatio: 1.0,
          method: "keep"
        });
        continue;
      }

      const userSeg = userSpeech[userIndex];
      const similarity = this.calculateTextSimilarity(veoSeg.text, userSeg.text);

      // If similarity is very low, might be misaligned - try next user segment
      if (similarity < 0.3 && userIndex < userSpeech.length - 1) {
        const nextUserSeg = userSpeech[userIndex + 1];
        const nextSimilarity = this.calculateTextSimilarity(veoSeg.text, nextUserSeg.text);
        
        if (nextSimilarity > similarity) {
          console.log(`[Aligner] Skipping user segment (better match ahead): "${userSeg.text}"`);
          userIndex++;
        }
      }

      const finalUserSeg = userSpeech[userIndex];
      const ratio = finalUserSeg.duration / veoSeg.duration;

      let method: "stretch" | "compress" | "keep";
      if (ratio >= 0.9 && ratio <= 1.1) {
        method = "keep";
      } else if (ratio > 1.1) {
        method = "stretch";
      } else {
        method = "compress";
      }

      alignments.push({
        veoSegment: veoSeg,
        userSegment: finalUserSeg,
        timeStretchRatio: ratio,
        method
      });

      userIndex++;
    }

    return alignments;
  }

  /**
   * Calculate text similarity between two segments (0.0 to 1.0)
   * Uses simple word overlap metric
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = text1.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    const words2 = text2.toLowerCase().split(/\s+/).filter(w => w.length > 0);

    if (words1.length === 0 || words2.length === 0) return 0;

    // Count overlapping words
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    let overlap = 0;

    for (const word of Array.from(set1)) {
      if (set2.has(word)) overlap++;
    }

    // Jaccard similarity: intersection / union
    const union = set1.size + set2.size - overlap;
    return overlap / union;
  }

  /**
   * Calculate speech-only duration from word-level timestamps
   * Excludes leading/trailing pauses by using only actual word timestamps
   * Returns the duration from first real word to last real word
   */
  private calculateSpeechOnlyDuration(segment: TimeSegment): number {
    // If no words available, fall back to raw duration
    if (!segment.words || segment.words.length === 0) {
      console.warn(`[Aligner] No word timestamps for segment: "${segment.text.substring(0, 50)}..."`);
      return segment.duration;
    }

    // Filter out silence tokens (empty text, punctuation-only)
    const realWords = segment.words.filter(w => {
      const normalized = w.word.trim().replace(/[.,!?;:'"]/g, '');
      return normalized.length > 0;
    });

    if (realWords.length === 0) {
      // No real words found, return 0 duration
      console.warn(`[Aligner] No real words found in segment: "${segment.text.substring(0, 50)}..."`);
      return 0;
    }

    // Calculate duration from first word start to last word end
    const firstWord = realWords[0];
    const lastWord = realWords[realWords.length - 1];
    const speechDuration = lastWord.end - firstWord.start;

    return Math.max(0, speechDuration);
  }

  /**
   * Calculate optimal time-stretch ratio with safety limits
   * Clamps to 0.5-2.0x range (FFmpeg safe limits)
   */
  calculateSafeRatio(ratio: number): number {
    // Clamp to FFmpeg safe limits (0.5-2.0x)
    if (ratio < 0.5) {
      console.warn(`[Aligner] Ratio ${ratio} too low, clamping to 0.5x`);
      return 0.5;
    }
    if (ratio > 2.0) {
      console.warn(`[Aligner] Ratio ${ratio} too high, clamping to 2.0x`);
      return 2.0;
    }
    return ratio;
  }

  /**
   * Classify pacing based on speech-only duration ratio
   * Ratio = user speech duration / VEO speech duration
   */
  private classifyPacing(ratio: number): {
    label: "perfect" | "slightly_fast" | "fast" | "critically_fast" | "slightly_slow" | "slow" | "critically_slow";
    guidance: string;
  } {
    if (ratio >= 0.97 && ratio <= 1.03) {
      return {
        label: "perfect",
        guidance: "Perfect pacing! Your timing matches the video perfectly."
      };
    } else if (ratio >= 0.90 && ratio < 0.97) {
      const pct = Math.round((1 - ratio) * 100);
      return {
        label: "slightly_fast",
        guidance: `${pct}% faster than video. Try slowing down slightly for this segment.`
      };
    } else if (ratio >= 0.75 && ratio < 0.90) {
      const pct = Math.round((1 - ratio) * 100);
      return {
        label: "fast",
        guidance: `${pct}% faster than video. Slow down noticeably for this segment.`
      };
    } else if (ratio < 0.75) {
      const pct = Math.round((1 - ratio) * 100);
      return {
        label: "critically_fast",
        guidance: `${pct}% faster than video. CRITICAL: Take your time with this segment, speak much slower.`
      };
    } else if (ratio > 1.03 && ratio <= 1.10) {
      const pct = Math.round((ratio - 1) * 100);
      return {
        label: "slightly_slow",
        guidance: `${pct}% slower than video. Try speeding up slightly for this segment.`
      };
    } else if (ratio > 1.10 && ratio <= 1.25) {
      const pct = Math.round((ratio - 1) * 100);
      return {
        label: "slow",
        guidance: `${pct}% slower than video. Speed up noticeably for this segment.`
      };
    } else {
      const pct = Math.round((ratio - 1) * 100);
      return {
        label: "critically_slow",
        guidance: `${pct}% slower than video. CRITICAL: Pick up the pace significantly for this segment.`
      };
    }
  }

  /**
   * Generate pacing report based on speech-only duration comparisons
   * CRITICAL: Only measures actual speech, excludes all pauses/silences
   */
  generatePacingReport(alignments: AlignmentResult[]): {
    summary: {
      overallRatio: number;
      totalSegments: number;
      segmentsNeedingAdjustment: number;
      averageDeviation: number;
      overallPacing: "perfect" | "slightly_fast" | "fast" | "critically_fast" | "slightly_slow" | "slow" | "critically_slow";
    };
    segments: Array<{
      segmentIndex: number;
      veoText: string;
      userText: string;
      veoSpeechDuration: number;
      userSpeechDuration: number;
      pacingRatio: number;
      pacingLabel: "perfect" | "slightly_fast" | "fast" | "critically_fast" | "slightly_slow" | "slow" | "critically_slow";
      guidance: string;
      wordCount: number;
    }>;
  } {
    // Filter to speech-only segments
    const speechAlignments = alignments.filter(a => a.veoSegment.type === "speech");

    if (speechAlignments.length === 0) {
      return {
        summary: {
          overallRatio: 1.0,
          totalSegments: 0,
          segmentsNeedingAdjustment: 0,
          averageDeviation: 0,
          overallPacing: "perfect"
        },
        segments: []
      };
    }

    // Calculate speech-only durations and pacing for each segment
    const segments = speechAlignments.map((alignment, index) => {
      const veoSpeechDuration = this.calculateSpeechOnlyDuration(alignment.veoSegment);
      const userSpeechDuration = this.calculateSpeechOnlyDuration(alignment.userSegment);

      // Calculate pacing ratio (avoid division by zero)
      const pacingRatio = veoSpeechDuration > 0 
        ? userSpeechDuration / veoSpeechDuration 
        : 1.0;

      const pacing = this.classifyPacing(pacingRatio);

      // Count words in user segment
      const wordCount = alignment.userSegment.words?.length || 0;

      return {
        segmentIndex: index,
        veoText: alignment.veoSegment.text,
        userText: alignment.userSegment.text,
        veoSpeechDuration,
        userSpeechDuration,
        pacingRatio,
        pacingLabel: pacing.label,
        guidance: pacing.guidance,
        wordCount
      };
    });

    // Calculate summary statistics
    const totalRatio = segments.reduce((sum, s) => sum + s.pacingRatio, 0);
    const overallRatio = totalRatio / segments.length;
    
    const segmentsNeedingAdjustment = segments.filter(s => s.pacingLabel !== "perfect").length;
    
    const deviations = segments.map(s => Math.abs(s.pacingRatio - 1.0));
    const averageDeviation = deviations.reduce((sum, d) => sum + d, 0) / deviations.length;

    const overallPacing = this.classifyPacing(overallRatio);

    console.log(`[Aligner] Pacing Report: ${segments.length} segments, overall ratio: ${overallRatio.toFixed(2)}, ${segmentsNeedingAdjustment} need adjustment`);

    return {
      summary: {
        overallRatio,
        totalSegments: segments.length,
        segmentsNeedingAdjustment,
        averageDeviation,
        overallPacing: overallPacing.label
      },
      segments
    };
  }

}
