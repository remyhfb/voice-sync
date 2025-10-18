import { Mic, Play, Trash2, Loader2 } from "lucide-react";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { VoiceClone } from "@shared/schema";

interface VoiceCloneCardProps {
  voiceClone: VoiceClone;
  onPlay?: () => void;
  onUse?: () => void;
  onDelete?: () => void;
}

export function VoiceCloneCard({ voiceClone, onPlay, onUse, onDelete }: VoiceCloneCardProps) {
  const getQualityColor = (quality: number | null) => {
    if (!quality) return "text-muted-foreground";
    if (quality >= 90) return "text-chart-2";
    if (quality >= 70) return "text-chart-4";
    return "text-destructive";
  };

  const getQualityLabel = (quality: number | null) => {
    if (!quality) return "Unknown";
    if (quality >= 90) return "Excellent";
    if (quality >= 70) return "Good";
    return "Fair";
  };

  return (
    <Card className="hover-elevate" data-testid={`card-voice-${voiceClone.id}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 flex-shrink-0">
            <Mic className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold truncate" data-testid="text-voice-name">
              {voiceClone.name}
            </h3>
            <p className="text-xs text-muted-foreground">
              {voiceClone.sampleCount} {voiceClone.sampleCount === 1 ? "sample" : "samples"}
            </p>
          </div>
        </div>
        <Badge
          variant={voiceClone.status === "ready" ? "default" : voiceClone.status === "failed" ? "destructive" : "secondary"}
          className={cn(
            voiceClone.status === "ready" && "bg-chart-2 hover:bg-chart-2",
            (voiceClone.status === "training" || voiceClone.status === "cloning") && "gap-1"
          )}
          data-testid="badge-voice-status"
        >
          {(voiceClone.status === "training" || voiceClone.status === "cloning") && <Loader2 className="h-3 w-3 animate-spin" />}
          {voiceClone.status}
        </Badge>
      </CardHeader>
      
      <CardContent>
        {voiceClone.status === "training" && (
          <div className="space-y-2" data-testid="training-progress">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Training Progress</span>
              <span className="text-sm font-semibold">
                {voiceClone.trainingProgress || 0}%
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${voiceClone.trainingProgress || 0}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Cloning voice with ElevenLabs... Usually completes in seconds.
            </p>
          </div>
        )}
        
        {voiceClone.quality && voiceClone.status === "ready" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Voice Quality</span>
              <span className={cn("text-sm font-semibold", getQualityColor(voiceClone.quality))}>
                {voiceClone.quality}% - {getQualityLabel(voiceClone.quality)}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all",
                  voiceClone.quality >= 90 && "bg-chart-2",
                  voiceClone.quality >= 70 && voiceClone.quality < 90 && "bg-chart-4",
                  voiceClone.quality < 70 && "bg-destructive"
                )}
                style={{ width: `${voiceClone.quality}%` }}
              />
            </div>
          </div>
        )}
        
        {voiceClone.status === "failed" && voiceClone.errorMessage && (
          <div className="mt-3 p-2 bg-destructive/10 border border-destructive/20 rounded-md">
            <p className="text-xs text-destructive font-medium" data-testid="text-error-message">
              {voiceClone.errorMessage}
            </p>
          </div>
        )}
        
        {voiceClone.createdAt && (
          <p className="text-xs text-muted-foreground mt-3">
            Created {new Date(voiceClone.createdAt).toLocaleDateString()}
          </p>
        )}
      </CardContent>
      
      <CardFooter className="flex gap-2 pt-4 border-t">
        <Button
          variant="outline"
          size="sm"
          onClick={onPlay}
          disabled={voiceClone.status !== "ready"}
          className="flex-1"
          data-testid="button-play-voice"
        >
          <Play className="h-4 w-4 mr-2" />
          Preview
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={onUse}
          disabled={voiceClone.status !== "ready"}
          className="flex-1"
          data-testid="button-use-voice"
        >
          Use Voice
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          data-testid="button-delete-voice"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}
