import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface PhraseTiming {
  text: string;
  totalDuration: number;
  startTime: number;
  endTime: number;
}

interface PhraseComparison {
  phraseIndex: number;
  veoPhrase: PhraseTiming;
  userPhrase: PhraseTiming;
  timeDelta: number;
  percentDifference: number;
  status: "too_fast" | "too_slow" | "perfect";
}

interface PacingAnalysisReport {
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

interface PacingReportProps {
  report: PacingAnalysisReport;
}

export function PacingReport({ report }: PacingReportProps) {
  // Calculate total delta (sum of all phrase deltas)
  const totalDelta = report.phraseComparisons.reduce((sum, comparison) => {
    return sum + comparison.timeDelta;
  }, 0);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1);
    return mins > 0 ? `${mins}:${secs.padStart(4, "0")}` : `${secs}s`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "perfect":
        return <CheckCircle2 className="h-4 w-4 text-chart-2" />;
      case "too_slow":
        return <TrendingDown className="h-4 w-4 text-amber-500" />;
      case "too_fast":
        return <TrendingUp className="h-4 w-4 text-blue-500" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "perfect":
        return "bg-chart-2/10 text-chart-2 border-chart-2/20";
      case "too_slow":
        return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
      case "too_fast":
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getStatusLabel = (status: string, percentDiff: number) => {
    if (status === "perfect") return "Perfect";
    const pct = Math.abs(Math.round(percentDiff));
    if (status === "too_slow") return `${pct}% Slower`;
    return `${pct}% Faster`;
  };

  return (
    <Card data-testid="pacing-report">
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Pacing Analysis</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Phrase-by-phrase timing comparison with VEO video
            </p>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" className="gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-chart-2" />
              {report.summary.perfectCount} Perfect
            </Badge>
            <Badge variant="outline" className="gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
              {report.summary.tooFastCount} Fast
            </Badge>
            <Badge variant="outline" className="gap-1.5">
              <TrendingDown className="h-3.5 w-3.5 text-amber-500" />
              {report.summary.tooSlowCount} Slow
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        {/* Total Delta - Primary metric */}
        <div className="bg-primary/5 border-2 border-primary/20 rounded-lg p-6">
          <div className="text-center">
            <div className="text-sm font-medium text-muted-foreground mb-2">
              Total Delta (VEO vs Your Audio)
            </div>
            <div className="text-4xl font-bold font-mono">
              {totalDelta >= 0 ? "+" : ""}
              {totalDelta.toFixed(2)}s
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              {totalDelta > 0 
                ? "Your audio is longer than VEO" 
                : totalDelta < 0 
                  ? "Your audio is shorter than VEO"
                  : "Durations match perfectly"}
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-muted/50 rounded-lg p-4">
            <div className="text-sm text-muted-foreground mb-1">Total Phrases</div>
            <div className="text-2xl font-semibold font-mono">{report.summary.totalPhrases}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-4">
            <div className="text-sm text-muted-foreground mb-1">Avg Difference</div>
            <div className="text-2xl font-semibold font-mono">
              {report.summary.avgPercentDifference >= 0 ? "+" : ""}
              {report.summary.avgPercentDifference.toFixed(1)}%
            </div>
          </div>
          <div className="bg-muted/50 rounded-lg p-4">
            <div className="text-sm text-muted-foreground mb-1">Avg Time Delta</div>
            <div className="text-2xl font-semibold font-mono">
              {report.summary.avgTimeDelta >= 0 ? "+" : ""}
              {report.summary.avgTimeDelta.toFixed(2)}s
            </div>
          </div>
        </div>

        {/* Phrase Comparisons */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold">Phrase-by-Phrase Analysis</h4>
            <Badge variant="outline" className="text-xs">Beta</Badge>
          </div>
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {report.phraseComparisons.map((comparison) => (
                <div
                  key={comparison.phraseIndex}
                  className="p-4 rounded-lg border bg-card"
                  data-testid={`phrase-${comparison.phraseIndex}`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-muted-foreground">
                          #{comparison.phraseIndex + 1}
                        </span>
                        <span className="text-xs font-mono text-muted-foreground">
                          {formatTime(comparison.veoPhrase.startTime)}
                        </span>
                      </div>
                      <p className="text-sm font-medium line-clamp-2">
                        {comparison.veoPhrase.text}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {getStatusIcon(comparison.status)}
                      <Badge
                        variant="outline"
                        className={getStatusColor(comparison.status)}
                      >
                        {getStatusLabel(comparison.status, comparison.percentDifference)}
                      </Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="space-y-1">
                      <div className="text-muted-foreground">VEO Duration</div>
                      <div className="font-mono font-semibold">
                        {comparison.veoPhrase.totalDuration.toFixed(2)}s
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-muted-foreground">Your Duration</div>
                      <div className="font-mono font-semibold">
                        {comparison.userPhrase.totalDuration.toFixed(2)}s
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}
