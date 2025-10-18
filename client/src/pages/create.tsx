import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { FileUploadZone } from "@/components/file-upload-zone";
import { ProcessingTimeline, ProcessingStep } from "@/components/processing-timeline";
import { DownloadSection } from "@/components/download-section";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { VoiceClone, ProcessingJob } from "@shared/schema";

export default function CreatePage() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("");
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: voices = [], isLoading: voicesLoading } = useQuery<VoiceClone[]>({
    queryKey: ["/api/voices"],
  });

  const { data: currentJob, isLoading: jobLoading } = useQuery<ProcessingJob>({
    queryKey: ["/api/jobs", currentJobId],
    queryFn: async () => {
      if (!currentJobId) throw new Error("No job ID");
      const response = await fetch(`/api/jobs/${currentJobId}`);
      if (!response.ok) throw new Error("Failed to fetch job");
      return response.json();
    },
    enabled: !!currentJobId,
    refetchInterval: (query) => {
      const job = query.state.data;
      return job && job.status === "processing" ? 2000 : false;
    },
  });

  const processVideoMutation = useMutation({
    mutationFn: async (data: { videoFile: File; voiceCloneId: string }) => {
      const formData = new FormData();
      formData.append("video", data.videoFile);
      formData.append("voiceCloneId", data.voiceCloneId);

      const response = await fetch("/api/jobs/process-video", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to process" }));
        throw new Error(errorData.error || "Failed to start processing");
      }

      return response.json();
    },
    onSuccess: (job: ProcessingJob) => {
      setCurrentJobId(job.id);
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({
        title: "Processing started",
        description: "Your video is being processed with RVC voice conversion.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start processing",
        variant: "destructive",
      });
    },
  });

  const handleVideoUpload = (files: File[]) => {
    if (files.length > 0) {
      setVideoFile(files[0]);
    }
  };

  const handleStartProcessing = () => {
    if (!videoFile || !selectedVoiceId) {
      toast({
        title: "Missing information",
        description: "Please upload a video and select a voice clone",
        variant: "destructive",
      });
      return;
    }

    processVideoMutation.mutate({
      videoFile,
      voiceCloneId: selectedVoiceId,
    });
  };

  const handleReset = () => {
    setVideoFile(null);
    setSelectedVoiceId("");
    setCurrentJobId(null);
  };

  const readyVoices = voices.filter((v) => v.status === "ready");

  const getProcessingSteps = (): ProcessingStep[] => {
    const job = currentJob;
    if (!job) return [];

    const steps: ProcessingStep[] = [
      {
        id: "extraction",
        label: "Audio Extraction",
        status: job.progress >= 30 ? "completed" : job.status === "processing" ? "processing" : "pending",
        estimatedTime: "~30 seconds",
      },
      {
        id: "conversion",
        label: "Voice Conversion (RVC preserves timing perfectly)",
        status: job.progress >= 80 ? "completed" : job.progress >= 30 ? "processing" : "pending",
        estimatedTime: "~2 minutes",
      },
      {
        id: "merging",
        label: "Video Merging",
        status: job.status === "completed" ? "completed" : job.progress >= 80 ? "processing" : "pending",
        estimatedTime: "~30 seconds",
      },
    ];

    return steps;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">
            Create Voice Swap
          </h1>
          <p className="text-muted-foreground">
            Upload your video and choose a voice clone. RVC technology preserves perfect lip-sync!
          </p>
        </div>

        {!currentJob && (
          <Card className="p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4">
              Step 1: Upload Video
            </h2>
            <FileUploadZone
              onFilesSelected={handleVideoUpload}
              accept="video/*"
              multiple={false}
              maxSize={100 * 1024 * 1024}
              title="Upload Video"
              description="Select or drag a video file (MP4, MOV, AVI, WebM)"
              icon="video"
            />
            {videoFile && (
              <div className="mt-4 p-3 bg-accent/20 rounded-md">
                <p className="text-sm font-mono">
                  Selected: {videoFile.name} ({(videoFile.size / (1024 * 1024)).toFixed(2)} MB)
                </p>
              </div>
            )}

            <Separator className="my-6" />

            <h2 className="text-xl font-semibold mb-4">
              Step 2: Select Voice Clone
            </h2>
            <div className="space-y-3">
              <Select
                value={selectedVoiceId}
                onValueChange={setSelectedVoiceId}
                disabled={voicesLoading || readyVoices.length === 0}
              >
                <SelectTrigger data-testid="select-voice" className="w-full">
                  <SelectValue placeholder="Choose a voice clone..." />
                </SelectTrigger>
                <SelectContent>
                  {readyVoices.map((voice) => (
                    <SelectItem key={voice.id} value={voice.id}>
                      {voice.name} - Quality: {voice.quality || "N/A"}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {readyVoices.length === 0 && !voicesLoading && (
                <p className="text-sm text-muted-foreground">
                  No voice clones available. Create one first in the "My Voices" tab.
                </p>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <Button
                data-testid="button-start-processing"
                size="lg"
                onClick={handleStartProcessing}
                disabled={!videoFile || !selectedVoiceId || processVideoMutation.isPending}
              >
                {processVideoMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {processVideoMutation.isPending ? "Starting..." : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Start Voice Conversion
                  </>
                )}
              </Button>
            </div>
          </Card>
        )}

        {currentJob && (
          <>
            <Card className="p-6 mb-8">
              <ProcessingTimeline
                steps={getProcessingSteps()}
                currentStepId={
                  currentJob.progress < 30 ? "extraction" :
                  currentJob.progress < 80 ? "conversion" : "merging"
                }
              />
            </Card>

            {currentJob.status === "completed" && currentJob.mergedVideoPath && (
              <Card className="p-6">
                <h2 className="text-2xl font-semibold mb-4">Download Results</h2>
                <div className="space-y-4">
                  <div>
                    <a
                      href={currentJob.mergedVideoPath}
                      download
                      data-testid="link-download-video"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover-elevate active-elevate-2"
                    >
                      Download Video with Cloned Voice
                    </a>
                  </div>
                  <Button data-testid="button-process-another" onClick={handleReset}>
                    Process Another Video
                  </Button>
                </div>
              </Card>
            )}

            {currentJob.status === "failed" && (
              <Card className="p-6 border-destructive">
                <h3 className="text-lg font-semibold text-destructive mb-2">
                  Processing Failed
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {currentJob.metadata?.errorMessage || "An unknown error occurred"}
                </p>
                <Button data-testid="button-try-again" onClick={handleReset}>
                  Try Again
                </Button>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
