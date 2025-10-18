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

export interface SegmentReport {
  segmentIndex: number;
  veoText: string;
  userText: string;
  textSimilarity: number;
  veoTiming: { start: number; end: number; duration: number };
  userTiming: { start: number; end: number; duration: number };
  timeStretchRatio: number;
  appliedRatio: number; // Clamped ratio actually used
  adjustment: "stretched" | "compressed" | "unchanged";
  speedChange: string; // e.g., "25% slower", "15% faster"
  severity: "critical" | "major" | "minor" | "perfect";
}

export interface AlignmentReport {
  summary: {
    totalSegments: number;
    avgTimeStretchRatio: number;
    alignmentQuality: "excellent" | "good" | "acceptable" | "poor";
    overallTiming: "too_fast" | "too_slow" | "perfect";
    criticalIssues: number;
    majorIssues: number;
    minorIssues: number;
  };
  segments: SegmentReport[];
  recommendations: string[];
  topProblemSegments: {
    segmentIndex: number;
    text: string;
    issue: string;
    recommendation: string;
  }[];
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

    for (const word of set1) {
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

  /**
   * Generate comprehensive alignment report with actionable recommendations
   */
  generateAlignmentReport(alignments: AlignmentResult[]): AlignmentReport {
    if (alignments.length === 0) {
      return {
        summary: {
          totalSegments: 0,
          avgTimeStretchRatio: 1.0,
          alignmentQuality: "excellent",
          overallTiming: "perfect",
          criticalIssues: 0,
          majorIssues: 0,
          minorIssues: 0,
        },
        segments: [],
        recommendations: ["No segments to analyze"],
        topProblemSegments: [],
      };
    }

    // Analyze each segment
    const segments: SegmentReport[] = alignments.map((alignment, index) => {
      const ratio = alignment.timeStretchRatio;
      const appliedRatio = this.calculateSafeRatio(ratio);
      const textSimilarity = this.calculateTextSimilarity(
        alignment.veoSegment.text,
        alignment.userSegment.text
      );

      // Calculate severity based on TIMING/PACE issues the user should fix
      // Focus: How much does the user need to adjust their delivery speed?
      let severity: "critical" | "major" | "minor" | "perfect";
      
      const timingDeviation = Math.abs(ratio - 1.0);
      
      if (timingDeviation < 0.05) {
        // Within 5% - perfect timing
        severity = "perfect";
      } else if (timingDeviation < 0.15) {
        // 5-15% off - minor adjustment recommended
        severity = "minor";
      } else if (timingDeviation < 0.30) {
        // 15-30% off - significant adjustment needed
        severity = "major";
      } else {
        // >30% off - critical, needs re-recording with better timing
        severity = "critical";
      }

      // Calculate speed change description
      let speedChange: string;
      let adjustment: "stretched" | "compressed" | "unchanged";
      
      if (ratio > 1.05) {
        const pct = Math.round((ratio - 1.0) * 100);
        speedChange = `${pct}% slower`;
        adjustment = "stretched";
      } else if (ratio < 0.95) {
        const pct = Math.round((1.0 - ratio) * 100);
        speedChange = `${pct}% faster`;
        adjustment = "compressed";
      } else {
        speedChange = "perfect match";
        adjustment = "unchanged";
      }

      return {
        segmentIndex: index,
        veoText: alignment.veoSegment.text,
        userText: alignment.userSegment.text,
        textSimilarity,
        veoTiming: {
          start: alignment.veoSegment.start,
          end: alignment.veoSegment.end,
          duration: alignment.veoSegment.duration,
        },
        userTiming: {
          start: alignment.userSegment.start,
          end: alignment.userSegment.end,
          duration: alignment.userSegment.duration,
        },
        timeStretchRatio: ratio,
        appliedRatio,
        adjustment,
        speedChange,
        severity,
      };
    });

    // Calculate summary statistics
    const ratios = alignments.map(a => a.timeStretchRatio);
    const avgRatio = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
    
    const criticalIssues = segments.filter(s => s.severity === "critical").length;
    const majorIssues = segments.filter(s => s.severity === "major").length;
    const minorIssues = segments.filter(s => s.severity === "minor").length;

    // Determine overall quality based on severity distribution AND average ratio
    // More lenient thresholds since time-stretching can handle significant adjustments
    let alignmentQuality: "excellent" | "good" | "acceptable" | "poor";
    
    // Calculate severity percentage
    const criticalPct = criticalIssues / segments.length;
    const majorPct = majorIssues / segments.length;
    
    // Primary check: average ratio (overall timing accuracy)
    const avgDeviation = Math.abs(avgRatio - 1.0);
    
    if (avgDeviation < 0.20 && criticalPct < 0.5) {
      // Avg within 20% and less than half segments are critical
      if (avgDeviation < 0.10 && criticalIssues === 0) {
        alignmentQuality = "excellent"; // <10% avg, no critical issues
      } else if (avgDeviation < 0.15 && criticalPct < 0.3) {
        alignmentQuality = "good"; // <15% avg, few critical issues
      } else {
        alignmentQuality = "acceptable"; // <20% avg, acceptable
      }
    } else if (avgDeviation < 0.40 && criticalPct < 0.7) {
      // Avg within 40% and less than 70% segments are critical
      alignmentQuality = "acceptable"; // Time-stretching can handle this
    } else {
      alignmentQuality = "poor"; // >40% average deviation or most segments critical
    }

    // Determine overall timing
    let overallTiming: "too_fast" | "too_slow" | "perfect";
    if (avgRatio > 1.1) {
      overallTiming = "too_slow";
    } else if (avgRatio < 0.9) {
      overallTiming = "too_fast";
    } else {
      overallTiming = "perfect";
    }

    // Generate recommendations - Focus on TIMING/PACE adjustments
    const recommendations: string[] = [];
    
    if (criticalIssues === 0 && majorIssues === 0 && minorIssues === 0) {
      recommendations.push("✅ Perfect timing! Your pace matches VEO's delivery almost exactly. No adjustments needed.");
    } else if (criticalIssues === 0 && majorIssues === 0) {
      recommendations.push("✅ Great timing! Only minor pace differences (all under 15%). Your delivery works well.");
    } else {
      if (criticalIssues > 0) {
        recommendations.push(`🚨 ${criticalIssues} segment${criticalIssues > 1 ? 's have' : ' has'} significant timing issues (>30% off). Re-record these with pace much closer to VEO's delivery.`);
      }
      
      if (majorIssues > 0) {
        recommendations.push(`⚠️ ${majorIssues} segment${majorIssues > 1 ? 's need' : ' needs'} pace adjustment (15-30% off). See details below for specific timing guidance.`);
      }
      
      recommendations.push("💡 Review the 'Top Issues to Fix' section below for specific timing adjustments needed for each segment.");
    }

    // Identify top problem segments - Focus on TIMING/PACE adjustments
    const problemSegments = segments
      .filter(s => s.severity === "critical" || s.severity === "major")
      .sort((a, b) => Math.abs(b.timeStretchRatio - 1.0) - Math.abs(a.timeStretchRatio - 1.0))
      .slice(0, 5)
      .map(seg => {
        let issue: string;
        let recommendation: string;

        const timeDiff = seg.userTiming.duration - seg.veoTiming.duration;
        const percentOff = Math.round(Math.abs(seg.timeStretchRatio - 1.0) * 100);
        const secondsOff = Math.abs(timeDiff).toFixed(1);

        if (seg.timeStretchRatio > 1.0) {
          // User was slower than VEO
          issue = `You're ${percentOff}% slower than VEO`;
          recommendation = `Speed up your delivery by ${percentOff}%, shaving ${secondsOff} second${secondsOff === '1.0' ? '' : 's'} off`;
        } else {
          // User was faster than VEO
          issue = `You're ${percentOff}% faster than VEO`;
          recommendation = `Slow down your delivery by ${percentOff}%, adding ${secondsOff} second${secondsOff === '1.0' ? '' : 's'}`;
        }

        return {
          segmentIndex: seg.segmentIndex,
          text: seg.veoText,
          issue,
          recommendation,
        };
      });

    return {
      summary: {
        totalSegments: segments.length,
        avgTimeStretchRatio: avgRatio,
        alignmentQuality,
        overallTiming,
        criticalIssues,
        majorIssues,
        minorIssues,
      },
      segments,
      recommendations,
      topProblemSegments: problemSegments,
    };
  }

  /**
   * Analyze alignment quality and provide feedback (legacy method for compatibility)
   */
  analyzeAlignment(alignments: AlignmentResult[]): {
    avgRatio: number;
    minRatio: number;
    maxRatio: number;
    outOfRangeCount: number;
    quality: "excellent" | "good" | "acceptable" | "poor";
  } {
    const report = this.generateAlignmentReport(alignments);
    const ratios = alignments.map(a => a.timeStretchRatio);
    
    return {
      avgRatio: report.summary.avgTimeStretchRatio,
      minRatio: Math.min(...ratios),
      maxRatio: Math.max(...ratios),
      outOfRangeCount: report.summary.criticalIssues + report.summary.majorIssues,
      quality: report.summary.alignmentQuality,
    };
  }
}
