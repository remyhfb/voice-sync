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
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("");
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [pipeline, setPipeline] = useState<"s2s" | "bark" | "lipsync">("bark"); // Default to Bark pipeline
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
    mutationFn: async (data: { videoFile: File; audioFile?: File; voiceCloneId: string; pipeline: "s2s" | "bark" | "lipsync" }) => {
      const formData = new FormData();
      formData.append("video", data.videoFile);
      
      if (data.pipeline === "lipsync") {
        if (!data.audioFile) throw new Error("Audio file required for lip-sync pipeline");
        formData.append("audio", data.audioFile);
      } else {
        formData.append("voiceCloneId", data.voiceCloneId);
      }

      const endpoint = data.pipeline === "lipsync"
        ? "/api/jobs/process-lipsync"
        : data.pipeline === "bark" 
          ? "/api/jobs/process-video-bark"
          : "/api/jobs/process-video";

      const response = await fetch(endpoint, {
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
        description: pipeline === "lipsync"
          ? "Lip-sync processing: Time-stretching video to match your voice"
          : pipeline === "bark" 
            ? "Video processing with Bark neural vocoder + S2S" 
            : "Video processing with ElevenLabs S2S",
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

  const handleAudioUpload = (files: File[]) => {
    if (files.length > 0) {
      setAudioFile(files[0]);
    }
  };

  const handleStartProcessing = () => {
    if (pipeline === "lipsync") {
      // Lip-sync pipeline requires VEO video + user audio
      if (!videoFile || !audioFile) {
        toast({
          title: "Missing information",
          description: "Please upload both VEO video and your audio recording",
          variant: "destructive",
        });
        return;
      }
      processVideoMutation.mutate({
        videoFile,
        audioFile,
        voiceCloneId: "", // Not needed for lipsync
        pipeline,
      });
    } else {
      // S2S and Bark pipelines require video + voice clone
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
        pipeline,
      });
    }
  };

  const handleReset = () => {
    setVideoFile(null);
    setAudioFile(null);
    setSelectedVoiceId("");
    setCurrentJobId(null);
  };

  const readyVoices = voices.filter((v) => v.status === "ready");

  const getProcessingSteps = (): ProcessingStep[] => {
    const job = currentJob;
    if (!job) return [];

    // Lip-sync pipeline steps
    if (job.type === "lipsync") {
      return [
        {
          id: "extraction",
          label: "VEO Audio Extraction",
          status: job.progress >= 10 ? "completed" : job.status === "processing" ? "processing" : "pending",
          estimatedTime: "~10 seconds",
        },
        {
          id: "cleanup",
          label: "Audio Cleanup (Noise Reduction + Enhancement)",
          status: job.progress >= 20 ? "completed" : job.progress >= 10 ? "processing" : "pending",
          estimatedTime: "~15 seconds",
        },
        {
          id: "transcription",
          label: "Transcribing Both Audios with Whisper",
          status: job.progress >= 40 ? "completed" : job.progress >= 20 ? "processing" : "pending",
          estimatedTime: "~30 seconds",
        },
        {
          id: "alignment",
          label: "Aligning Segments & Calculating Time-Stretch",
          status: job.progress >= 45 ? "completed" : job.progress >= 40 ? "processing" : "pending",
          estimatedTime: "~5 seconds",
        },
        {
          id: "timestretch",
          label: "Time-Stretching Video to Match Your Timing",
          status: job.progress >= 70 ? "completed" : job.progress >= 45 ? "processing" : "pending",
          estimatedTime: "~1 minute",
        },
        {
          id: "lipsync",
          label: "Applying Lip-Sync with Sync Labs",
          status: job.progress >= 90 ? "completed" : job.progress >= 70 ? "processing" : "pending",
          estimatedTime: "~1 minute",
        },
        {
          id: "upload",
          label: "Finalizing & Uploading",
          status: job.status === "completed" ? "completed" : job.progress >= 90 ? "processing" : "pending",
          estimatedTime: "~10 seconds",
        },
      ];
    }

    // Bark pipeline steps (voice_conversion_bark)
    if (job.type === "voice_conversion_bark") {
      return [
        {
          id: "extraction",
          label: "Audio Extraction",
          status: job.progress >= 15 ? "completed" : job.status === "processing" ? "processing" : "pending",
          estimatedTime: "~15 seconds",
        },
        {
          id: "isolation",
          label: "Vocal Isolation",
          status: job.progress >= 25 ? "completed" : job.progress >= 15 ? "processing" : "pending",
          estimatedTime: "~15 seconds",
        },
        {
          id: "transcription",
          label: "Transcribing with Word Timestamps",
          status: job.progress >= 35 ? "completed" : job.progress >= 25 ? "processing" : "pending",
          estimatedTime: "~20 seconds",
        },
        {
          id: "tts-align",
          label: "Generating Time-Aligned TTS Segments",
          status: job.progress >= 75 ? "completed" : job.progress >= 35 ? "processing" : "pending",
          estimatedTime: "~2 minutes",
        },
        {
          id: "concat",
          label: "Concatenating Aligned Segments",
          status: job.progress >= 85 ? "completed" : job.progress >= 75 ? "processing" : "pending",
          estimatedTime: "~15 seconds",
        },
        {
          id: "merging",
          label: "Video Merging",
          status: job.status === "completed" ? "completed" : job.progress >= 85 ? "processing" : "pending",
          estimatedTime: "~20 seconds",
        },
      ];
    }

    // Standard S2S pipeline steps
    return [
      {
        id: "extraction",
        label: "Audio Extraction",
        status: job.progress >= 20 ? "completed" : job.status === "processing" ? "processing" : "pending",
        estimatedTime: "~20 seconds",
      },
      {
        id: "isolation",
        label: "Vocal Isolation (Removing Background Music/SFX)",
        status: job.progress >= 30 ? "completed" : job.progress >= 20 ? "processing" : "pending",
        estimatedTime: "~20 seconds",
      },
      {
        id: "normalization",
        label: "Stage 1: Normalizing Synthetic Voice",
        status: job.progress >= 55 ? "completed" : job.progress >= 30 ? "processing" : "pending",
        estimatedTime: "~40 seconds",
      },
      {
        id: "conversion",
        label: "Stage 2: Voice Conversion to Clone",
        status: job.progress >= 80 ? "completed" : job.progress >= 55 ? "processing" : "pending",
        estimatedTime: "~40 seconds",
      },
      {
        id: "merging",
        label: "Video Merging",
        status: job.status === "completed" ? "completed" : job.progress >= 80 ? "processing" : "pending",
        estimatedTime: "~30 seconds",
      },
    ];
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">
            Create Voice Swap
          </h1>
          <p className="text-muted-foreground">
            Upload your VEO video and swap the voice while keeping the professional acting & emotion
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
              Step 2: Choose Processing Pipeline
            </h2>
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <button
                  data-testid="button-pipeline-s2s"
                  onClick={() => setPipeline("s2s")}
                  className={`p-4 rounded-lg border-2 transition-all text-left ${
                    pipeline === "s2s"
                      ? "border-primary bg-primary/10"
                      : "border-border hover-elevate"
                  }`}
                >
                  <div className="font-semibold mb-1">⚡ Speech-to-Speech</div>
                  <div className="text-sm text-muted-foreground">
                    AI voice conversion with emotion preservation
                  </div>
                  <div className="text-xs text-green-500 mt-2 font-medium">
                    ✓ Clone voice + VEO emotion
                  </div>
                </button>
                
                <button
                  data-testid="button-pipeline-bark"
                  onClick={() => setPipeline("bark")}
                  className={`p-4 rounded-lg border-2 transition-all text-left ${
                    pipeline === "bark"
                      ? "border-primary bg-primary/10"
                      : "border-border hover-elevate"
                  }`}
                >
                  <div className="font-semibold mb-1">🎯 Time-Aligned TTS</div>
                  <div className="text-sm text-muted-foreground">
                    Word-level timestamps → Time-stretched TTS
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    ⚠️ Neutral delivery
                  </div>
                </button>

                <button
                  data-testid="button-pipeline-lipsync"
                  onClick={() => setPipeline("lipsync")}
                  className={`p-4 rounded-lg border-2 transition-all text-left ${
                    pipeline === "lipsync"
                      ? "border-primary bg-primary/10"
                      : "border-border hover-elevate"
                  }`}
                >
                  <div className="font-semibold mb-1">🎬 Lip-Sync (Your Voice)</div>
                  <div className="text-sm text-muted-foreground">
                    Use YOUR voice recording + AI lip-sync
                  </div>
                  <div className="text-xs text-green-500 mt-2 font-medium">
                    ✓ 100% authentic performance
                  </div>
                </button>
              </div>
            </div>

            <Separator className="my-6" />

            {pipeline === "lipsync" ? (
              <>
                <h2 className="text-xl font-semibold mb-4">
                  Step 3: Upload Your Audio Recording
                </h2>
                <FileUploadZone
                  onFilesSelected={handleAudioUpload}
                  accept="audio/*"
                  multiple={false}
                  maxSize={50 * 1024 * 1024}
                  title="Upload Your Voice Acting"
                  description="Your audio recording matching VEO video (MP3, WAV, M4A)"
                  icon="audio"
                />
                {audioFile && (
                  <div className="mt-4 p-3 bg-accent/20 rounded-md">
                    <p className="text-sm font-mono">
                      Audio: {audioFile.name} ({(audioFile.size / (1024 * 1024)).toFixed(2)} MB)
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                <h2 className="text-xl font-semibold mb-4">
                  Step 3: Select Voice Clone
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
              </>
            )}

            <div className="mt-6 flex justify-end">
              <Button
                data-testid="button-start-processing"
                size="lg"
                onClick={handleStartProcessing}
                disabled={
                  !videoFile || 
                  (pipeline === "lipsync" ? !audioFile : !selectedVoiceId) || 
                  processVideoMutation.isPending
                }
              >
                {processVideoMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {processVideoMutation.isPending ? "Starting..." : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {pipeline === "lipsync" ? "Start Lip-Sync Processing" : "Start Voice Conversion"}
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
