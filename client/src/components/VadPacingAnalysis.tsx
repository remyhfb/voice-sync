import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, TrendingDown, TrendingUp, Loader2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface VadPacingAnalysisProps {
  jobId: string;
  veoVideoFile?: File;
  userAudioFile?: File;
  existingAnalysis?: {
    veoSpeechDuration: number;
    userSpeechDuration: number;
    ratio: number;
    classification: string;
    analyzedAt?: string;
  };
  onAnalysisComplete?: (analysis: any) => void;
}

const pacingConfig = {
  perfect: { 
    bg: "bg-chart-2/10 dark:bg-chart-2/20", 
    text: "text-chart-2", 
    border: "border-chart-2/30",
    icon: CheckCircle2,
    label: "Perfect Pacing"
  },
  slightly_fast: { 
    bg: "bg-yellow-500/10 dark:bg-yellow-500/20", 
    text: "text-yellow-700 dark:text-yellow-400", 
    border: "border-yellow-500/30",
    icon: TrendingDown,
    label: "Slightly Fast"
  },
  fast: { 
    bg: "bg-orange-500/10 dark:bg-orange-500/20", 
    text: "text-orange-700 dark:text-orange-400", 
    border: "border-orange-500/30",
    icon: TrendingDown,
    label: "Fast"
  },
  critically_fast: { 
    bg: "bg-destructive/10 dark:bg-destructive/20", 
    text: "text-destructive", 
    border: "border-destructive/30",
    icon: AlertCircle,
    label: "Critically Fast"
  },
  slightly_slow: { 
    bg: "bg-blue-500/10 dark:bg-blue-500/20", 
    text: "text-blue-700 dark:text-blue-400", 
    border: "border-blue-500/30",
    icon: TrendingUp,
    label: "Slightly Slow"
  },
  slow: { 
    bg: "bg-purple-500/10 dark:bg-purple-500/20", 
    text: "text-purple-700 dark:text-purple-400", 
    border: "border-purple-500/30",
    icon: TrendingUp,
    label: "Slow"
  },
  critically_slow: { 
    bg: "bg-destructive/10 dark:bg-destructive/20", 
    text: "text-destructive", 
    border: "border-destructive/30",
    icon: AlertCircle,
    label: "Critically Slow"
  },
};

export function VadPacingAnalysis({ 
  jobId, 
  veoVideoFile, 
  userAudioFile, 
  existingAnalysis,
  onAnalysisComplete
}: VadPacingAnalysisProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(existingAnalysis);
  const { toast } = useToast();

  const runAnalysis = async () => {
    if (!veoVideoFile || !userAudioFile) {
      toast({
        title: "Missing files",
        description: "Both VEO video and user audio are required for pacing analysis",
        variant: "destructive"
      });
      return;
    }

    setIsAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append("veoVideo", veoVideoFile);
      formData.append("userAudio", userAudioFile);

      const response = await fetch(`/api/jobs/${jobId}/analyze-pacing`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || response.statusText);
      }

      const result = await response.json();
      setAnalysis(result);
      if (onAnalysisComplete) {
        onAnalysisComplete(result);
      }

      toast({
        title: "Analysis complete",
        description: "Speech timing has been analyzed successfully"
      });
    } catch (error: any) {
      toast({
        title: "Analysis failed",
        description: error.message || "Failed to analyze pacing",
        variant: "destructive"
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!analysis) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold mb-1">Pacing Analysis</h2>
              <p className="text-sm text-muted-foreground">
                Analyze speech timing using Voice Activity Detection
              </p>
            </div>
            <Button 
              onClick={runAnalysis}
              disabled={isAnalyzing || !veoVideoFile || !userAudioFile}
              data-testid="button-run-pacing-analysis"
            >
              {isAnalyzing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isAnalyzing ? "Analyzing..." : "Run Analysis"}
            </Button>
          </div>
        </CardHeader>
      </Card>
    );
  }

  const config = pacingConfig[analysis.classification as keyof typeof pacingConfig] || pacingConfig.perfect;
  const Icon = config.icon;

  const formatDuration = (duration: number) => {
    return `${duration.toFixed(2)}s`;
  };

  const formatRatio = (ratio: number) => {
    const percentage = (ratio * 100).toFixed(0);
    return `${percentage}%`;
  };

  const getGuidance = () => {
    if (analysis.classification === "perfect") {
      return "Perfect pacing! Your speaking speed matches the video timing.";
    } else if (analysis.classification.includes("fast")) {
      const deviation = ((1 - analysis.ratio) * 100).toFixed(0);
      if (analysis.classification === "critically_fast") {
        return `You spoke ${deviation}% faster than the video. Take your time and speak much slower to match the original timing.`;
      } else if (analysis.classification === "fast") {
        return `You spoke ${deviation}% faster than the video. Slow down noticeably to better match the timing.`;
      } else {
        return `You spoke ${deviation}% faster than the video. Try slowing down slightly to match the timing.`;
      }
    } else {
      const deviation = ((analysis.ratio - 1) * 100).toFixed(0);
      if (analysis.classification === "critically_slow") {
        return `You spoke ${deviation}% slower than the video. Pick up the pace significantly to match the original timing.`;
      } else if (analysis.classification === "slow") {
        return `You spoke ${deviation}% slower than the video. Speed up noticeably to better match the timing.`;
      } else {
        return `You spoke ${deviation}% slower than the video. Try speeding up slightly to match the timing.`;
      }
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className={`border-b ${config.border}`}>
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-lg ${config.bg}`}>
            <Icon className={`h-6 w-6 ${config.text}`} />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-semibold mb-1" data-testid="text-vad-pacing-title">
              Pacing Analysis
            </h2>
            <p className="text-sm text-muted-foreground">
              Speech-only duration measured using Voice Activity Detection
            </p>
          </div>
          <Badge 
            variant="outline" 
            className={`${config.bg} ${config.text} border-0 font-mono`}
            data-testid="badge-vad-overall-ratio"
          >
            {formatRatio(analysis.ratio)}
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-4">
          <div>
            <div className="text-2xl font-bold font-mono" data-testid="text-veo-speech-duration">
              {formatDuration(analysis.veoSpeechDuration)}
            </div>
            <div className="text-xs text-muted-foreground">VEO Speech Duration</div>
          </div>
          <div>
            <div className="text-2xl font-bold font-mono" data-testid="text-user-speech-duration">
              {formatDuration(analysis.userSpeechDuration)}
            </div>
            <div className="text-xs text-muted-foreground">Your Speech Duration</div>
          </div>
          <div>
            <div className={`text-2xl font-bold ${config.text}`} data-testid="text-classification">
              {config.label}
            </div>
            <div className="text-xs text-muted-foreground">Classification</div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6">
        <div className={`flex items-start gap-3 p-4 rounded-lg ${config.bg}`}>
          <Icon className={`h-5 w-5 ${config.text} mt-0.5`} />
          <div>
            <div className="font-medium mb-1">Guidance</div>
            <div className="text-sm" data-testid="text-vad-guidance">
              {getGuidance()}
            </div>
          </div>
        </div>

        {analysis.analyzedAt && (
          <div className="mt-4 text-xs text-muted-foreground text-center">
            Analyzed on {new Date(analysis.analyzedAt).toLocaleString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
