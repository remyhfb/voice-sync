import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  AlertCircle, 
  AlertTriangle, 
  CheckCircle2, 
  TrendingDown, 
  TrendingUp, 
  Info,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface AlignmentReportProps {
  report: {
    summary: {
      totalSegments: number;
      avgTimeStretchRatio: number;
      alignmentQuality: "excellent" | "good" | "acceptable" | "poor";
      overallTiming: "too_fast" | "too_slow" | "perfect";
      criticalIssues: number;
      majorIssues: number;
      minorIssues: number;
    };
    segments: Array<{
      segmentIndex: number;
      veoText: string;
      userText: string;
      textSimilarity: number;
      veoTiming: { start: number; end: number; duration: number };
      userTiming: { start: number; end: number; duration: number };
      timeStretchRatio: number;
      appliedRatio: number;
      adjustment: "stretched" | "compressed" | "unchanged";
      speedChange: string;
      severity: "critical" | "major" | "minor" | "perfect";
    }>;
    recommendations: string[];
    topProblemSegments: Array<{
      segmentIndex: number;
      text: string;
      issue: string;
      recommendation: string;
    }>;
  };
}

export function AlignmentReport({ report }: AlignmentReportProps) {
  const [showAllSegments, setShowAllSegments] = useState(false);

  const getQualityColor = (quality: string) => {
    switch (quality) {
      case "excellent":
        return "text-chart-2";
      case "good":
        return "text-chart-1";
      case "acceptable":
        return "text-chart-3";
      case "poor":
        return "text-destructive";
      default:
        return "text-muted-foreground";
    }
  };

  const getQualityBadge = (quality: string) => {
    switch (quality) {
      case "excellent":
        return <Badge className="bg-chart-2/10 text-chart-2 hover:bg-chart-2/20" data-testid="badge-quality-excellent">Excellent</Badge>;
      case "good":
        return <Badge className="bg-chart-1/10 text-chart-1 hover:bg-chart-1/20" data-testid="badge-quality-good">Good</Badge>;
      case "acceptable":
        return <Badge className="bg-chart-3/10 text-chart-3 hover:bg-chart-3/20" data-testid="badge-quality-acceptable">Acceptable</Badge>;
      case "poor":
        return <Badge variant="destructive" data-testid="badge-quality-poor">Poor</Badge>;
      default:
        return null;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "perfect":
        return <Badge variant="secondary" className="bg-chart-2/10 text-chart-2 text-xs" data-testid="badge-severity-perfect">Perfect</Badge>;
      case "minor":
        return <Badge variant="secondary" className="bg-muted text-muted-foreground text-xs" data-testid="badge-severity-minor">Minor</Badge>;
      case "major":
        return <Badge variant="secondary" className="bg-chart-3/10 text-chart-3 text-xs" data-testid="badge-severity-major">Major</Badge>;
      case "critical":
        return <Badge variant="destructive" className="text-xs" data-testid="badge-severity-critical">Critical</Badge>;
      default:
        return null;
    }
  };

  const getTimingIcon = (timing: string) => {
    switch (timing) {
      case "too_slow":
        return <TrendingDown className="h-5 w-5 text-chart-3" />;
      case "too_fast":
        return <TrendingUp className="h-5 w-5 text-chart-3" />;
      case "perfect":
        return <CheckCircle2 className="h-5 w-5 text-chart-2" />;
      default:
        return <Info className="h-5 w-5" />;
    }
  };

  const formatTime = (seconds: number) => {
    return `${seconds.toFixed(2)}s`;
  };

  const perfectSegments = report.summary.totalSegments - 
    report.summary.criticalIssues - 
    report.summary.majorIssues - 
    report.summary.minorIssues;

  const qualityPercentage = report.summary.totalSegments > 0 
    ? (perfectSegments / report.summary.totalSegments) * 100 
    : 100;

  return (
    <div className="space-y-4" data-testid="container-alignment-report">
      <Card>
        <CardHeader className="gap-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-xl">Alignment Report</CardTitle>
            {getQualityBadge(report.summary.alignmentQuality)}
          </div>
          <CardDescription>
            Analysis of timing adjustments made to match your voice performance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Total Segments</p>
              <p className="text-2xl font-bold font-mono" data-testid="text-total-segments">{report.summary.totalSegments}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Avg Speed Ratio</p>
              <p className="text-2xl font-bold font-mono" data-testid="text-avg-ratio">
                {report.summary.avgTimeStretchRatio.toFixed(2)}x
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Perfect Segments</p>
              <p className="text-2xl font-bold font-mono text-chart-2" data-testid="text-perfect-segments">
                {perfectSegments}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Overall Timing</p>
              <div className="flex items-center gap-2">
                {getTimingIcon(report.summary.overallTiming)}
                <p className="text-sm font-semibold capitalize" data-testid="text-overall-timing">
                  {report.summary.overallTiming.replace("_", " ")}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Alignment Quality</span>
              <span className={`font-semibold ${getQualityColor(report.summary.alignmentQuality)}`}>
                {qualityPercentage.toFixed(0)}%
              </span>
            </div>
            <Progress value={qualityPercentage} className="h-2" data-testid="progress-quality" />
            <div className="flex gap-4 text-xs text-muted-foreground">
              {report.summary.criticalIssues > 0 && (
                <span data-testid="text-critical-issues">
                  {report.summary.criticalIssues} critical
                </span>
              )}
              {report.summary.majorIssues > 0 && (
                <span data-testid="text-major-issues">
                  {report.summary.majorIssues} major
                </span>
              )}
              {report.summary.minorIssues > 0 && (
                <span data-testid="text-minor-issues">
                  {report.summary.minorIssues} minor
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {report.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Info className="h-5 w-5" />
              Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {report.recommendations.map((rec, idx) => (
              <Alert key={idx} data-testid={`alert-recommendation-${idx}`}>
                <AlertDescription className="text-sm">{rec}</AlertDescription>
              </Alert>
            ))}
          </CardContent>
        </Card>
      )}

      {report.topProblemSegments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-chart-3" />
              Top Issues to Fix
            </CardTitle>
            <CardDescription>
              Focus on these segments to improve alignment quality
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {report.topProblemSegments.map((problem, idx) => (
              <div key={idx} className="border-l-4 border-chart-3 pl-4 space-y-2" data-testid={`container-problem-${idx}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium flex-1" data-testid="text-problem-text">
                    "{problem.text}"
                  </p>
                  <Badge variant="outline" className="text-xs" data-testid="text-segment-index">
                    Segment #{problem.segmentIndex + 1}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-destructive flex items-center gap-2" data-testid="text-problem-issue">
                    <AlertCircle className="h-4 w-4" />
                    {problem.issue}
                  </p>
                  <p className="text-sm text-muted-foreground" data-testid="text-problem-recommendation">
                    💡 {problem.recommendation}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg">All Segments</CardTitle>
              <CardDescription>
                Detailed breakdown of each segment adjustment
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAllSegments(!showAllSegments)}
              data-testid="button-toggle-segments"
            >
              {showAllSegments ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-1" />
                  Hide
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-1" />
                  Show All
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        {showAllSegments && (
          <CardContent className="space-y-3">
            {report.segments.map((seg) => (
              <div
                key={seg.segmentIndex}
                className="border rounded-md p-4 space-y-3"
                data-testid={`container-segment-${seg.segmentIndex}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-xs" data-testid="text-segment-number">
                        #{seg.segmentIndex + 1}
                      </Badge>
                      {getSeverityBadge(seg.severity)}
                      <Badge variant="secondary" className="text-xs" data-testid="text-speed-change">
                        {seg.speedChange}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium mb-1" data-testid="text-segment-text">"{seg.veoText}"</p>
                    {seg.textSimilarity < 0.8 && (
                      <p className="text-xs text-muted-foreground" data-testid="text-user-text">
                        Your text: "{seg.userText}"
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 text-xs">
                  <div>
                    <p className="text-muted-foreground mb-1">VEO Timing</p>
                    <p className="font-mono" data-testid="text-veo-timing">
                      {formatTime(seg.veoTiming.start)} - {formatTime(seg.veoTiming.end)}
                    </p>
                    <p className="font-mono text-muted-foreground" data-testid="text-veo-duration">
                      {formatTime(seg.veoTiming.duration)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">Your Timing</p>
                    <p className="font-mono" data-testid="text-user-timing">
                      {formatTime(seg.userTiming.start)} - {formatTime(seg.userTiming.end)}
                    </p>
                    <p className="font-mono text-muted-foreground" data-testid="text-user-duration">
                      {formatTime(seg.userTiming.duration)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">Adjustment</p>
                    <p className="font-mono font-semibold" data-testid="text-adjustment">
                      {seg.timeStretchRatio.toFixed(2)}x
                    </p>
                    <p className="text-muted-foreground capitalize" data-testid="text-adjustment-type">
                      {seg.adjustment}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
