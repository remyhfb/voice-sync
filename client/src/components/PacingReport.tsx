import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, TrendingDown, TrendingUp } from "lucide-react";

interface PacingReportProps {
  report: {
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
  };
}

const pacingConfig = {
  perfect: { 
    bg: "bg-chart-2/10 dark:bg-chart-2/20", 
    text: "text-chart-2", 
    border: "border-chart-2/30",
    icon: CheckCircle2 
  },
  slightly_fast: { 
    bg: "bg-yellow-500/10 dark:bg-yellow-500/20", 
    text: "text-yellow-700 dark:text-yellow-400", 
    border: "border-yellow-500/30",
    icon: TrendingDown 
  },
  fast: { 
    bg: "bg-orange-500/10 dark:bg-orange-500/20", 
    text: "text-orange-700 dark:text-orange-400", 
    border: "border-orange-500/30",
    icon: TrendingDown 
  },
  critically_fast: { 
    bg: "bg-destructive/10 dark:bg-destructive/20", 
    text: "text-destructive", 
    border: "border-destructive/30",
    icon: AlertCircle 
  },
  slightly_slow: { 
    bg: "bg-blue-500/10 dark:bg-blue-500/20", 
    text: "text-blue-700 dark:text-blue-400", 
    border: "border-blue-500/30",
    icon: TrendingUp 
  },
  slow: { 
    bg: "bg-purple-500/10 dark:bg-purple-500/20", 
    text: "text-purple-700 dark:text-purple-400", 
    border: "border-purple-500/30",
    icon: TrendingUp 
  },
  critically_slow: { 
    bg: "bg-destructive/10 dark:bg-destructive/20", 
    text: "text-destructive", 
    border: "border-destructive/30",
    icon: AlertCircle 
  },
};

export function PacingReport({ report }: PacingReportProps) {
  const summaryConfig = pacingConfig[report.summary.overallPacing];
  const SummaryIcon = summaryConfig.icon;

  const formatDuration = (duration: number) => {
    return `${duration.toFixed(2)}s`;
  };

  const formatRatio = (ratio: number) => {
    return `${(ratio * 100).toFixed(0)}%`;
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className={`border-b ${summaryConfig.border}`}>
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-lg ${summaryConfig.bg}`}>
            <SummaryIcon className={`h-6 w-6 ${summaryConfig.text}`} />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-semibold mb-1" data-testid="text-pacing-title">
              Pacing Analysis
            </h2>
            <p className="text-sm text-muted-foreground">
              Speech timing comparison (excludes pauses and silences)
            </p>
          </div>
          <Badge 
            variant="outline" 
            className={`${summaryConfig.bg} ${summaryConfig.text} border-0 font-mono`}
            data-testid="badge-overall-pacing"
          >
            {formatRatio(report.summary.overallRatio)} overall
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-4">
          <div>
            <div className="text-2xl font-bold" data-testid="text-total-segments">
              {report.summary.totalSegments}
            </div>
            <div className="text-xs text-muted-foreground">Total Segments</div>
          </div>
          <div>
            <div className="text-2xl font-bold" data-testid="text-segments-needing-adjustment">
              {report.summary.segmentsNeedingAdjustment}
            </div>
            <div className="text-xs text-muted-foreground">Need Adjustment</div>
          </div>
          <div>
            <div className="text-2xl font-bold" data-testid="text-average-deviation">
              {(report.summary.averageDeviation * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">Avg Deviation</div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="divide-y">
          {report.segments.map((segment) => {
            const config = pacingConfig[segment.pacingLabel];
            const Icon = config.icon;

            return (
              <div 
                key={segment.segmentIndex} 
                className={`p-4 hover-elevate border-l-4 ${config.border}`}
                data-testid={`segment-${segment.segmentIndex}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded ${config.bg} mt-1`}>
                    <Icon className={`h-4 w-4 ${config.text}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-mono text-muted-foreground">
                        Segment {segment.segmentIndex + 1}
                      </span>
                      <Badge 
                        variant="outline" 
                        className={`${config.bg} ${config.text} border-0 text-xs font-mono`}
                        data-testid={`badge-ratio-${segment.segmentIndex}`}
                      >
                        {formatRatio(segment.pacingRatio)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {segment.wordCount} words
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div>
                        <div className="text-sm font-medium mb-1">Script:</div>
                        <div 
                          className="text-sm text-muted-foreground font-mono"
                          data-testid={`text-veo-${segment.segmentIndex}`}
                        >
                          {segment.veoText}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <span className="text-muted-foreground">VEO speech: </span>
                          <span className="font-mono font-medium">
                            {formatDuration(segment.veoSpeechDuration)}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Your speech: </span>
                          <span className="font-mono font-medium">
                            {formatDuration(segment.userSpeechDuration)}
                          </span>
                        </div>
                      </div>

                      {segment.pacingLabel !== "perfect" && (
                        <div 
                          className={`text-sm ${config.text} mt-2`}
                          data-testid={`guidance-${segment.segmentIndex}`}
                        >
                          {segment.guidance}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
