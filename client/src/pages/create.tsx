import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { FileUploadZone } from "@/components/file-upload-zone";
import { ProcessingTimeline, ProcessingStep } from "@/components/processing-timeline";
import { TranscriptionEditor } from "@/components/transcription-editor";
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
        throw new Error(await response.text());
      }

      return response.json();
    },
    onSuccess: (job: ProcessingJob) => {
      setCurrentJobId(job.id);
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({
        title: "Processing started",
        description: "Your video is being processed. This may take a few minutes.",
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
    if (!videoFile || !selectedVoiceId) return;
    processVideoMutation.mutate({ videoFile, voiceCloneId: selectedVoiceId });
  };

  const getProcessingSteps = (): ProcessingStep[] => {
    if (!currentJob) {
      return [
        {
          id: "upload",
          label: "Upload Video",
          status: videoFile ? "completed" : "pending",
        },
        {
          id: "extract",
          label: "Extract Audio",
          status: "pending",
        },
        {
          id: "transcribe",
          label: "Transcribe Speech",
          status: "pending",
        },
        {
          id: "generate",
          label: "Generate Cloned Voice",
          status: "pending",
        },
        {
          id: "download",
          label: "Ready to Download",
          status: "pending",
        },
      ];
    }

    return [
      {
        id: "upload",
        label: "Upload Video",
        status: "completed",
      },
      {
        id: "extract",
        label: "Extract Audio",
        status: currentJob.progress >= 30 ? "completed" : currentJob.progress > 10 ? "processing" : "pending",
        progress: currentJob.progress < 30 ? currentJob.progress : undefined,
      },
      {
        id: "transcribe",
        label: "Transcribe Speech",
        status: currentJob.progress >= 60 ? "completed" : currentJob.progress > 30 ? "processing" : "pending",
        progress: currentJob.progress >= 30 && currentJob.progress < 60 ? currentJob.progress : undefined,
      },
      {
        id: "generate",
        label: "Generate Cloned Voice",
        status: currentJob.progress >= 100 ? "completed" : currentJob.progress > 60 ? "processing" : "pending",
        progress: currentJob.progress >= 60 && currentJob.progress < 100 ? currentJob.progress : undefined,
      },
      {
        id: "download",
        label: "Ready to Download",
        status: currentJob.status === "completed" ? "completed" : "pending",
      },
    ];
  };

  const readyVoices = voices.filter((v) => v.status === "ready");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-2">
          Create Voice Clone
        </h1>
        <p className="text-lg text-muted-foreground">
          Upload your video and replace synthetic voices with authentic cloned audio
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6">
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-xl font-semibold">Step 1: Upload Video</h2>
                <p className="text-sm text-muted-foreground">
                  Upload the video file that contains the voice you want to replace
                </p>
              </div>

              <FileUploadZone
                accept="video/*"
                maxSize={500 * 1024 * 1024}
                onFilesSelected={handleVideoUpload}
                title="Upload Video File"
                description="Drop your video file here or click to browse. Supports MP4, MOV, AVI, and more."
                icon="video"
                disabled={processVideoMutation.isPending || currentJob?.status === "processing"}
              />
            </div>
          </Card>

          <Card className="p-6">
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-xl font-semibold">Step 2: Select Voice Clone</h2>
                <p className="text-sm text-muted-foreground">
                  Choose which voice to use for the replacement audio
                </p>
              </div>

              <div className="space-y-4">
                {voicesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : readyVoices.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-muted-foreground mb-2">
                      No voice clones available yet
                    </p>
                    <Button variant="link" asChild>
                      <a href="/voices">Create your first voice clone</a>
                    </Button>
                  </div>
                ) : (
                  <Select value={selectedVoiceId} onValueChange={setSelectedVoiceId}>
                    <SelectTrigger data-testid="select-voice-clone">
                      <SelectValue placeholder="Select a voice clone" />
                    </SelectTrigger>
                    <SelectContent>
                      {readyVoices.map((voice) => (
                        <SelectItem key={voice.id} value={voice.id}>
                          {voice.name} ({voice.quality}% quality)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Sparkles className="h-4 w-4" />
                  <span>Voice clones capture emotion, tone, and natural inflection</span>
                </div>
              </div>
            </div>
          </Card>

          {currentJob?.transcription && (
            <TranscriptionEditor
              transcription={currentJob.transcription}
              disabled={currentJob.status === "processing"}
            />
          )}

          <Separator />

          <Button
            size="lg"
            className="w-full"
            disabled={!videoFile || !selectedVoiceId || processVideoMutation.isPending || currentJob?.status === "processing"}
            onClick={handleStartProcessing}
            data-testid="button-start-processing"
          >
            {processVideoMutation.isPending || currentJob?.status === "processing" ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5 mr-2" />
                Start Voice Replacement
              </>
            )}
          </Button>
        </div>

        <div className="space-y-6">
          <ProcessingTimeline steps={getProcessingSteps()} />
          
          {currentJob?.status === "completed" && currentJob.generatedAudioPath && (
            <DownloadSection
              audioUrl={currentJob.generatedAudioPath}
              audioFormat={currentJob.metadata?.generatedAudioFormat?.toUpperCase() || "MP3"}
              audioDuration={currentJob.metadata?.generatedAudioDuration}
              audioSize={0}
              transcription={currentJob.transcription || undefined}
              metadata={currentJob.metadata}
            />
          )}
        </div>
      </div>
    </div>
  );
}
