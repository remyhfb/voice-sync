import { Download, FileAudio, FileText, FileJson, FileVideo } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface DownloadSectionProps {
  audioUrl?: string;
  audioFormat?: string;
  audioDuration?: number;
  audioSize?: number;
  videoUrl?: string;
  transcription?: string;
  metadata?: Record<string, any>;
}

export function DownloadSection({
  audioUrl,
  audioFormat = "MP3",
  audioDuration,
  audioSize,
  videoUrl,
  transcription,
  metadata,
}: DownloadSectionProps) {
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const downloadTranscription = () => {
    if (!transcription) return;
    const blob = new Blob([transcription], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transcription.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadMetadata = () => {
    if (!metadata) return;
    const blob = new Blob([JSON.stringify(metadata, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "metadata.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">Download Results</h3>
          <p className="text-sm text-muted-foreground">
            {videoUrl ? "Your video with cloned voice is ready" : "Your AI-generated audio is ready"}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {videoUrl && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-primary/10 border-2 border-primary/20">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded bg-primary/20">
                  <FileVideo className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium font-mono text-sm">final_video.mp4</p>
                  <p className="text-xs text-muted-foreground mt-1">Video with cloned voice audio</p>
                </div>
              </div>
              <Badge variant="default">MP4</Badge>
            </div>

            <Button
              size="lg"
              className="w-full"
              asChild
              data-testid="button-download-video"
            >
              <a href={videoUrl} download>
                <Download className="h-5 w-5 mr-2" />
                Download Final Video
              </a>
            </Button>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded bg-primary/10">
                <FileAudio className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium font-mono text-sm">cloned_audio.{audioFormat.toLowerCase()}</p>
                <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                  {audioDuration && <span>{formatDuration(audioDuration)}</span>}
                  {audioSize && <span>{formatFileSize(audioSize)}</span>}
                </div>
              </div>
            </div>
            <Badge variant="default" className="bg-chart-2 hover:bg-chart-2">
              {audioFormat}
            </Badge>
          </div>

          <Button
            variant={videoUrl ? "outline" : "default"}
            size="lg"
            className="w-full"
            disabled={!audioUrl}
            asChild={!!audioUrl}
            data-testid="button-download-audio"
          >
            {audioUrl ? (
              <a href={audioUrl} download>
                <Download className="h-5 w-5 mr-2" />
                Download Audio Only
              </a>
            ) : (
              <>
                <Download className="h-5 w-5 mr-2" />
                Download Audio Only
              </>
            )}
          </Button>
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-medium">Additional Downloads</h4>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={downloadTranscription}
              disabled={!transcription}
              className="flex-1"
              data-testid="button-download-transcription"
            >
              <FileText className="h-4 w-4 mr-2" />
              Transcription
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadMetadata}
              disabled={!metadata}
              className="flex-1"
              data-testid="button-download-metadata"
            >
              <FileJson className="h-4 w-4 mr-2" />
              Metadata
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
