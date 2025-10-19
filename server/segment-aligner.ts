import { ReplicateService } from "./replicate";

export interface TimeSegment {
  text: string;
  start: number;
  end: number;
  duration: number;
  type: "speech" | "pause";
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
      
      // Add speech segment
      segments.push({
        text: segment.text,
        start: segment.start,
        end: segment.end,
        duration: segment.end - segment.start,
        type: "speech"
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

}
