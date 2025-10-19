import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { FileUploadZone } from "@/components/file-upload-zone";
import { ProcessingTimeline, ProcessingStep } from "@/components/processing-timeline";
import { PacingReport } from "@/components/PacingReport";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Loader2, Download, RotateCcw, BarChart3, AlertCircle, CheckCircle2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ProcessingJob } from "@shared/schema";

export default function CreatePage() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [analyzingPacing, setAnalyzingPacing] = useState(false);
  const { toast } = useToast();

  const { data: currentJob } = useQuery<ProcessingJob>({
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
    mutationFn: async (data: { videoFile: File; audioFile: File }) => {
      const formData = new FormData();
      formData.append("video", data.videoFile);
      formData.append("audio", data.audioFile);

      const response = await fetch("/api/jobs/process-lipsync", {
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
        description: "Your video is being processed with AI lip-sync technology",
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
    if (!videoFile || !audioFile) {
      toast({
        title: "Missing files",
        description: "Please upload both VEO video and your audio recording",
        variant: "destructive",
      });
      return;
    }

    processVideoMutation.mutate({
      videoFile,
      audioFile,
    });
  };

  const handleReset = () => {
    setVideoFile(null);
    setAudioFile(null);
    setCurrentJobId(null);
  };

  const handleVideoError = (projectId: string) => {
    toast({
      variant: "destructive",
      title: "Video playback error",
      description: "Unable to load the video. The file may be corrupted or missing. Try downloading it instead.",
    });
  };

  const handleAnalyzePacing = async () => {
    if (!currentJobId) return;
    
    setAnalyzingPacing(true);
    try {
      await apiRequest("POST", `/api/jobs/${currentJobId}/analyze-pacing`);
      
      toast({
        title: "Analysis started",
        description: "Analyzing pacing... This may take a minute.",
      });
      
      // Poll for updates
      const pollInterval = setInterval(async () => {
        queryClient.invalidateQueries({ queryKey: ["/api/jobs", currentJobId] });
      }, 3000);
      
      // Stop polling after 2 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        setAnalyzingPacing(false);
      }, 120000);
      
    } catch (error: any) {
      toast({
        title: "Analysis failed",
        description: error.message || "Failed to analyze pacing",
        variant: "destructive",
      });
      setAnalyzingPacing(false);
    }
  };

  const getProcessingSteps = (): ProcessingStep[] => {
    const job = currentJob;
    if (!job) return [];

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
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">
            Create Lip-Synced Video
          </h1>
          <p className="text-muted-foreground text-lg">
            Upload your VEO video and your voice recording to get perfectly lip-synced results
          </p>
        </div>

        {!currentJob && (
          <Card className="p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4">
              Step 1: Upload VEO Video
            </h2>
            <Alert className="mb-4" data-testid="alert-veo-requirements">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Important:</strong> Remove any weird or unintended footage that your AI video generator added on its own (grunts, groans, odd expressions, etc.). Our software detects natural patterns, and AI-generated artifacts will result in poor output.
              </AlertDescription>
            </Alert>
            <FileUploadZone
              onFilesSelected={handleVideoUpload}
              accept="video/*"
              multiple={false}
              maxSize={100 * 1024 * 1024}
              title="Upload VEO Video"
              description="Select or drag your VEO video file (MP4, MOV, AVI, WebM)"
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
              Step 2: Upload Your Voice Recording
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Record yourself performing the same script as the VEO video. 
              The AI will time-stretch the video to match your timing and apply perfect lip-sync.
            </p>
            <Alert className="mb-4" data-testid="alert-audio-requirements">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Important:</strong> Your audio must include every single word from the VEO video, even words you don't intend to use in the final version. You can edit later.
              </AlertDescription>
            </Alert>
            <FileUploadZone
              onFilesSelected={handleAudioUpload}
              accept="audio/*"
              multiple={false}
              maxSize={50 * 1024 * 1024}
              title="Upload Your Voice Acting"
              description="Your audio recording matching the VEO video script (MP3, WAV, M4A)"
              icon="audio"
            />
            {audioFile && (
              <div className="mt-4 p-3 bg-accent/20 rounded-md">
                <p className="text-sm font-mono">
                  Audio: {audioFile.name} ({(audioFile.size / (1024 * 1024)).toFixed(2)} MB)
                </p>
              </div>
            )}

            <div className="mt-8 flex justify-end">
              <Button
                data-testid="button-start-processing"
                size="lg"
                onClick={handleStartProcessing}
                disabled={!videoFile || !audioFile || processVideoMutation.isPending}
              >
                {processVideoMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {processVideoMutation.isPending ? "Starting..." : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Start Lip-Sync Processing
                  </>
                )}
              </Button>
            </div>
          </Card>
        )}

        {currentJob && (
          <>
            {currentJob.status === "processing" && (
              <Card className="p-6 mb-8">
                <ProcessingTimeline
                  steps={getProcessingSteps()}
                  currentStepId={
                    currentJob.progress < 30 ? "extraction" :
                    currentJob.progress < 80 ? "timestretch" : "upload"
                  }
                />
              </Card>
            )}

            {currentJob.status === "completed" && currentJob.mergedVideoPath && (
              <div className="space-y-6">
                <Alert className="bg-chart-2/10 border-chart-2" data-testid="alert-success">
                  <CheckCircle2 className="h-5 w-5 text-chart-2" />
                  <AlertDescription className="text-base">
                    <strong>Success!</strong> Your lip-synced video is ready. The video has been time-stretched to match your timing and perfectly lip-synced.
                  </AlertDescription>
                </Alert>

                <Card>
                  <CardContent className="p-0">
                    <AspectRatio ratio={16/9}>
                      <video
                        key={currentJob.mergedVideoPath}
                        controls
                        autoPlay
                        className="w-full h-full rounded-lg"
                        onError={() => handleVideoError(currentJob.id)}
                        data-testid="video-player-result"
                      >
                        <source src={currentJob.mergedVideoPath} type="video/mp4" />
                        Your browser does not support the video tag.
                      </video>
                    </AspectRatio>
                  </CardContent>
                </Card>

                {currentJob.metadata?.pacingAnalysis && (
                  <PacingReport report={currentJob.metadata.pacingAnalysis} />
                )}

                <Card className="p-6">
                  <h2 className="text-xl font-semibold mb-4">Next Steps</h2>
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-3">
                      <Button size="lg" asChild className="flex-1">
                        <a href={currentJob.mergedVideoPath} download data-testid="button-download-result">
                          <Download className="h-4 w-4 mr-2" />
                          Download Video
                        </a>
                      </Button>
                      <Button size="lg" variant="outline" onClick={handleReset} className="flex-1" data-testid="button-create-another">
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Create Another
                      </Button>
                    </div>
                    
                    {!currentJob.metadata?.pacingAnalysis && (
                      <Button 
                        size="lg" 
                        variant="secondary" 
                        onClick={handleAnalyzePacing}
                        disabled={analyzingPacing}
                        className="w-full"
                        data-testid="button-analyze-pacing"
                      >
                        {analyzingPacing ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Analyzing Pacing...
                          </>
                        ) : (
                          <>
                            <BarChart3 className="h-4 w-4 mr-2" />
                            Analyze Pacing
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </Card>
              </div>
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
