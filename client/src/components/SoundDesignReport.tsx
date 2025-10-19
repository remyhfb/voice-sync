import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Volume2, Sparkles, CheckCircle2, Clock } from "lucide-react";

interface DetectedSound {
  timestamp: number;
  label: string;
  confidence: number;
  category: "ambient" | "effect" | "music" | "other";
}

interface GeneratedPrompt {
  startTime: number;
  endTime: number;
  prompt: string;
  duration: number;
}

interface SoundDesignAnalysis {
  status: "processing" | "completed" | "failed";
  detectedSounds: DetectedSound[];
  generatedPrompts: GeneratedPrompt[];
  regeneratedAudioPaths: {
    ambientAudio?: string;
    effectsAudio?: string;
    mixedAudio?: string;
  };
  enhancedVideoPath?: string;
  errorMessage?: string;
}

interface SoundDesignReportProps {
  analysis: SoundDesignAnalysis;
}

export function SoundDesignReport({ analysis }: SoundDesignReportProps) {
  if (analysis.status === "processing") {
    return (
      <Card data-testid="card-sound-design-processing">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 animate-pulse" />
            Regenerating Sound Design
          </CardTitle>
          <CardDescription>
            Analyzing and regenerating sound design from VEO video...
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (analysis.status === "failed") {
    return (
      <Card data-testid="card-sound-design-failed">
        <CardHeader>
          <CardTitle className="text-destructive">Sound Design Regeneration Failed</CardTitle>
          <CardDescription>
            {analysis.errorMessage || "An error occurred during sound design regeneration"}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const ambientSounds = analysis.detectedSounds.filter(s => s.category === "ambient");
  const effectSounds = analysis.detectedSounds.filter(s => s.category === "effect");

  return (
    <Card data-testid="card-sound-design-report">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Volume2 className="h-5 w-5" />
          Sound Design Analysis
        </CardTitle>
        <CardDescription>
          AI-detected sounds and regenerated audio from VEO video
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Success message */}
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>
            Sound design regenerated successfully! {analysis.enhancedVideoPath ? "Enhanced video includes ambient audio." : ""}
          </AlertDescription>
        </Alert>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Total Sounds</p>
            <p className="text-2xl font-bold" data-testid="text-total-sounds">
              {analysis.detectedSounds.length}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Ambient</p>
            <p className="text-2xl font-bold" data-testid="text-ambient-count">
              {ambientSounds.length}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Effects</p>
            <p className="text-2xl font-bold" data-testid="text-effects-count">
              {effectSounds.length}
            </p>
          </div>
        </div>

        <Separator />

        {/* Detected sounds list */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Detected Sounds</h3>
          <ScrollArea className="h-[200px] w-full rounded-md border p-4">
            <div className="space-y-2">
              {analysis.detectedSounds.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sounds detected</p>
              ) : (
                analysis.detectedSounds
                  .sort((a, b) => b.confidence - a.confidence)
                  .slice(0, 20) // Show top 20
                  .map((sound, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 py-1"
                      data-testid={`sound-item-${idx}`}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs font-mono text-muted-foreground flex-shrink-0">
                          {sound.timestamp.toFixed(1)}s
                        </span>
                        <span className="text-sm truncate">{sound.label}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant="outline" className="text-xs">
                          {sound.category}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {(sound.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Generated prompts */}
        {analysis.generatedPrompts.length > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Generated Audio Prompts</h3>
              <ScrollArea className="h-[150px] w-full rounded-md border p-4">
                <div className="space-y-2">
                  {analysis.generatedPrompts.map((prompt, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 py-1"
                      data-testid={`prompt-item-${idx}`}
                    >
                      <Sparkles className="h-3 w-3 text-primary flex-shrink-0 mt-1" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">{prompt.prompt}</p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {prompt.startTime.toFixed(1)}s - {prompt.endTime.toFixed(1)}s ({prompt.duration.toFixed(1)}s)
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </>
        )}

        {/* Generated files info */}
        {(analysis.regeneratedAudioPaths.ambientAudio || analysis.regeneratedAudioPaths.effectsAudio) && (
          <>
            <Separator />
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Generated Audio Files</h3>
              <div className="text-sm text-muted-foreground space-y-1">
                {analysis.regeneratedAudioPaths.ambientAudio && (
                  <p data-testid="text-ambient-audio">✓ Ambient background audio generated</p>
                )}
                {analysis.regeneratedAudioPaths.effectsAudio && (
                  <p data-testid="text-effects-audio">✓ Sound effects generated</p>
                )}
                {analysis.enhancedVideoPath && (
                  <p data-testid="text-enhanced-video">✓ Enhanced video with regenerated audio</p>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
