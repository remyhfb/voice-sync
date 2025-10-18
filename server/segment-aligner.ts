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
   * Align VEO video segments with user audio segments
   * Calculates time-stretch ratios to match user's timing
   */
  async alignSegments(
    veoSegments: TimeSegment[],
    userSegments: TimeSegment[]
  ): Promise<AlignmentResult[]> {
    const alignments: AlignmentResult[] = [];

    // Simple alignment: match by index (assumes user tried to match VEO timing)
    // More sophisticated: use text similarity or DTW (Dynamic Time Warping)
    const minLength = Math.min(veoSegments.length, userSegments.length);

    for (let i = 0; i < minLength; i++) {
      const veoSeg = veoSegments[i];
      const userSeg = userSegments[i];
      
      const ratio = userSeg.duration / veoSeg.duration;
      
      let method: "stretch" | "compress" | "keep";
      
      if (ratio >= 0.9 && ratio <= 1.1) {
        // Within 10% - keep as is
        method = "keep";
      } else if (ratio > 1.1) {
        // User is slower - stretch video to match
        method = "stretch";
      } else {
        // User is faster - compress video to match
        method = "compress";
      }

      alignments.push({
        veoSegment: veoSeg,
        userSegment: userSeg,
        timeStretchRatio: ratio,
        method
      });
    }

    return alignments;
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
   * Analyze alignment quality and provide feedback
   */
  analyzeAlignment(alignments: AlignmentResult[]): {
    avgRatio: number;
    minRatio: number;
    maxRatio: number;
    outOfRangeCount: number;
    quality: "excellent" | "good" | "acceptable" | "poor";
  } {
    if (alignments.length === 0) {
      return {
        avgRatio: 1.0,
        minRatio: 1.0,
        maxRatio: 1.0,
        outOfRangeCount: 0,
        quality: "excellent"
      };
    }

    const ratios = alignments.map(a => a.timeStretchRatio);
    const avgRatio = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
    const minRatio = Math.min(...ratios);
    const maxRatio = Math.max(...ratios);
    const outOfRangeCount = ratios.filter(r => r < 0.8 || r > 1.2).length;

    let quality: "excellent" | "good" | "acceptable" | "poor";
    
    if (avgRatio >= 0.95 && avgRatio <= 1.05 && outOfRangeCount === 0) {
      quality = "excellent"; // Within 5%, all segments good
    } else if (avgRatio >= 0.9 && avgRatio <= 1.1 && outOfRangeCount < alignments.length * 0.2) {
      quality = "good"; // Within 10%, <20% segments need adjustment
    } else if (avgRatio >= 0.8 && avgRatio <= 1.2 && outOfRangeCount < alignments.length * 0.5) {
      quality = "acceptable"; // Within 20%, <50% segments need adjustment
    } else {
      quality = "poor"; // Too many segments out of range
    }

    return {
      avgRatio,
      minRatio,
      maxRatio,
      outOfRangeCount,
      quality
    };
  }
}
