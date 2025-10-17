import { CheckCircle2, Circle, Loader2, XCircle, Upload, Music, FileText, Mic, Download, Edit, Video } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface ProcessingStep {
  id: string;
  label: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress?: number;
  estimatedTime?: string;
  errorMessage?: string;
}

interface ProcessingTimelineProps {
  steps: ProcessingStep[];
  currentStepId?: string;
}

const stepIcons: Record<string, any> = {
  upload: Upload,
  extract: Music,
  transcribe: FileText,
  review: Edit,
  clone: Mic,
  generate: Music,
  merge: Video,
  download: Download,
};

export function ProcessingTimeline({ steps, currentStepId }: ProcessingTimelineProps) {
  return (
    <Card className="p-6">
      <div className="space-y-1 mb-6">
        <h3 className="text-lg font-semibold">Processing Pipeline</h3>
        <p className="text-sm text-muted-foreground">Track your voice cloning progress</p>
      </div>
      
      <div className="space-y-4">
        {steps.map((step, index) => {
          const Icon = stepIcons[step.id] || Circle;
          const isLast = index === steps.length - 1;
          
          return (
            <div key={step.id} className="relative" data-testid={`step-${step.id}`}>
              {!isLast && (
                <div
                  className={cn(
                    "absolute left-5 top-12 bottom-0 w-0.5 -mb-4",
                    step.status === "completed"
                      ? "bg-chart-2"
                      : "bg-border"
                  )}
                />
              )}
              
              <div className="flex gap-4">
                <div className="relative flex-shrink-0">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all",
                      step.status === "completed" && "bg-chart-2 border-chart-2",
                      step.status === "processing" && "bg-primary/10 border-primary animate-pulse",
                      step.status === "failed" && "bg-destructive/10 border-destructive",
                      step.status === "pending" && "bg-background border-border"
                    )}
                  >
                    {step.status === "completed" && (
                      <CheckCircle2 className="h-5 w-5 text-white" />
                    )}
                    {step.status === "processing" && (
                      <Loader2 className="h-5 w-5 text-primary animate-spin" />
                    )}
                    {step.status === "failed" && (
                      <XCircle className="h-5 w-5 text-destructive" />
                    )}
                    {step.status === "pending" && (
                      <Icon className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                </div>
                
                <div className="flex-1 pb-8">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-medium">{step.label}</h4>
                      {step.estimatedTime && step.status === "processing" && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Est. {step.estimatedTime}
                        </p>
                      )}
                      {step.errorMessage && (
                        <p className="text-xs text-destructive mt-1">
                          {step.errorMessage}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant={
                        step.status === "completed"
                          ? "default"
                          : step.status === "processing"
                          ? "secondary"
                          : step.status === "failed"
                          ? "destructive"
                          : "outline"
                      }
                      className={cn(
                        step.status === "completed" && "bg-chart-2 hover:bg-chart-2",
                        "capitalize"
                      )}
                      data-testid={`badge-status-${step.id}`}
                    >
                      {step.status}
                    </Badge>
                  </div>
                  
                  {step.status === "processing" && step.progress !== undefined && (
                    <div className="space-y-1">
                      <Progress value={step.progress} className="h-2" />
                      <p className="text-xs text-muted-foreground text-right">
                        {step.progress}%
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
