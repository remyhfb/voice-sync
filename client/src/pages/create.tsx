import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { FileUploadZone } from "@/components/file-upload-zone";
import { ProcessingTimeline, ProcessingStep } from "@/components/processing-timeline";
import { PacingReport } from "@/components/PacingReport";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Loader2, Download, RotateCcw, BarChart3, AlertCircle, CheckCircle2, X, Volume2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ProcessingJob } from "@shared/schema";

export default function CreatePage() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [analyzingPacing, setAnalyzingPacing] = useState(false);
  const [enhancingAmbient, setEnhancingAmbient] = useState(false);
  const [selectedAmbientType, setSelectedAmbientType] = useState<string>("office");
  const [customAmbientPrompt, setCustomAmbientPrompt] = useState<string>("");
  const [ambientVolume, setAmbientVolume] = useState<number>(15);
  const [applyingVoiceFilter, setApplyingVoiceFilter] = useState(false);
  const [selectedVoiceFilter, setSelectedVoiceFilter] = useState<string>("concert_hall");
  const [voiceFilterMix, setVoiceFilterMix] = useState<number>(50);
  const [successAlertDismissed, setSuccessAlertDismissed] = useState(false);
  const { toast } = useToast();
  const audioPreviewRef = useRef<HTMLAudioElement>(null);

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

  // Sync the audio preview volume with the slider in real-time
  useEffect(() => {
    if (audioPreviewRef.current) {
      // Convert 0-100 percentage to 0-1 decimal for HTML5 audio
      audioPreviewRef.current.volume = ambientVolume / 100;
    }
  }, [ambientVolume]);

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
    setSuccessAlertDismissed(false);
    setEnhancingAmbient(false);
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

  const handlePreviewAmbient = async () => {
    if (!currentJobId) return;
    
    // Validation: at least one must be provided
    if (!customAmbientPrompt.trim() && !selectedAmbientType) {
      toast({
        title: "Input required",
        description: "Please select a preset or enter a custom prompt",
        variant: "destructive",
      });
      return;
    }
    
    setEnhancingAmbient(true);
    try {
      const requestBody: { preset?: string; customPrompt?: string; volume: number } = { 
        volume: ambientVolume 
      };
      
      if (customAmbientPrompt.trim()) {
        requestBody.customPrompt = customAmbientPrompt.trim();
      } else {
        requestBody.preset = selectedAmbientType;
      }
      
      // Clear old ambient enhancement data from cache before starting
      const currentJob = queryClient.getQueryData<ProcessingJob>(["/api/jobs", currentJobId]);
      if (currentJob) {
        queryClient.setQueryData<ProcessingJob>(["/api/jobs", currentJobId], {
          ...currentJob,
          metadata: {
            ...currentJob.metadata,
            ambientEnhancement: {
              status: "processing" as const,
              volume: ambientVolume,
              ...(requestBody.preset && { preset: requestBody.preset as any }),
              ...(requestBody.customPrompt && { customPrompt: requestBody.customPrompt })
            }
          }
        });
      }
      
      await apiRequest("POST", `/api/jobs/${currentJobId}/preview-ambient`, requestBody);
      
      toast({
        title: "Generating preview...",
        description: "Creating ambient sound for you to listen to",
      });

      // Timeout after 2 minutes with notification
      const timeout = setTimeout(() => {
        clearInterval(pollInterval);
        setEnhancingAmbient(false);
        toast({
          title: "Preview generation timed out",
          description: "The preview is taking longer than expected. Please try again or contact support.",
          variant: "destructive",
        });
      }, 120000);

      // Poll for updates
      const pollInterval = setInterval(async () => {
        queryClient.invalidateQueries({ queryKey: ["/api/jobs", currentJobId] });
        const job = queryClient.getQueryData<ProcessingJob>(["/api/jobs", currentJobId]);
        
        // Stop polling when preview completes or fails
        if (job?.metadata?.ambientEnhancement && 
            job.metadata.ambientEnhancement.status !== "processing") {
          clearInterval(pollInterval);
          clearTimeout(timeout);
          setEnhancingAmbient(false);
          
          if (job.metadata.ambientEnhancement.status === "completed") {
            toast({
              title: "Preview ready!",
              description: "Listen to the ambient sound below and apply it to your video if you like it",
            });
          } else if (job.metadata.ambientEnhancement.status === "failed") {
            toast({
              title: "Preview generation failed",
              description: job.metadata.ambientEnhancement.errorMessage || "Failed to generate ambient sound preview",
              variant: "destructive",
            });
          }
        }
      }, 3000);
      
    } catch (error: any) {
      toast({
        title: "Preview generation failed",
        description: error.message || "Failed to generate preview",
        variant: "destructive",
      });
      setEnhancingAmbient(false);
    }
  };

  const handleApplyAmbient = async () => {
    if (!currentJobId) return;
    
    const job = queryClient.getQueryData<ProcessingJob>(["/api/jobs", currentJobId]);
    if (!job?.metadata?.ambientEnhancement) return;
    
    setEnhancingAmbient(true);
    try {
      // Always use the current slider value for mixing
      // This allows users to adjust volume after preview without re-previewing
      const requestBody: { preset?: string; customPrompt?: string; volume: number } = { 
        volume: ambientVolume 
      };
      
      if (job.metadata.ambientEnhancement.customPrompt) {
        requestBody.customPrompt = job.metadata.ambientEnhancement.customPrompt;
      } else if (job.metadata.ambientEnhancement.preset) {
        requestBody.preset = job.metadata.ambientEnhancement.preset;
      }
      
      // Clear enhancedVideoPath from cache before starting (keep preview)
      queryClient.setQueryData<ProcessingJob>(["/api/jobs", currentJobId], {
        ...job,
        metadata: {
          ...job.metadata,
          ambientEnhancement: {
            ...job.metadata.ambientEnhancement,
            status: "processing",
            enhancedVideoPath: undefined
          }
        }
      });
      
      await apiRequest("POST", `/api/jobs/${currentJobId}/enhance-ambient`, requestBody);
      
      toast({
        title: "Mixing ambient sound...",
        description: "Adding the ambient sound to your video",
      });

      // Timeout after 3 minutes with notification
      const timeout = setTimeout(() => {
        clearInterval(pollInterval);
        setEnhancingAmbient(false);
        toast({
          title: "Enhancement timed out",
          description: "The enhancement is taking longer than expected. Please try again or contact support.",
          variant: "destructive",
        });
      }, 180000);

      // Poll for updates
      const pollInterval = setInterval(async () => {
        queryClient.invalidateQueries({ queryKey: ["/api/jobs", currentJobId] });
        const job = queryClient.getQueryData<ProcessingJob>(["/api/jobs", currentJobId]);
        
        // Check if enhancedVideoPath is available (processing complete)
        if (job?.metadata?.ambientEnhancement?.enhancedVideoPath) {
          clearInterval(pollInterval);
          clearTimeout(timeout);
          setEnhancingAmbient(false);
          
          toast({
            title: "Ambient sound added!",
            description: "Your enhanced video is ready to download",
          });
        } else if (job?.metadata?.ambientEnhancement?.status === "failed") {
          clearInterval(pollInterval);
          clearTimeout(timeout);
          setEnhancingAmbient(false);
          
          toast({
            title: "Enhancement failed",
            description: job.metadata.ambientEnhancement.errorMessage || "Failed to add ambient sound to video",
            variant: "destructive",
          });
        }
      }, 3000);
      
    } catch (error: any) {
      toast({
        title: "Enhancement failed",
        description: error.message || "Failed to add ambient sound to video",
        variant: "destructive",
      });
      setEnhancingAmbient(false);
    }
  };

  const handleApplyVoiceFilter = async () => {
    if (!currentJobId) return;
    
    setApplyingVoiceFilter(true);
    try {
      const requestBody = { 
        preset: selectedVoiceFilter,
        mix: voiceFilterMix
      };
      
      // Clear old voice filter data from cache before starting
      const currentJob = queryClient.getQueryData<ProcessingJob>(["/api/jobs", currentJobId]);
      if (currentJob) {
        queryClient.setQueryData<ProcessingJob>(["/api/jobs", currentJobId], {
          ...currentJob,
          metadata: {
            ...currentJob.metadata,
            voiceFilter: {
              status: "processing" as const,
              preset: selectedVoiceFilter as any,
              mix: voiceFilterMix
            }
          }
        });
      }
      
      await apiRequest("POST", `/api/jobs/${currentJobId}/apply-voice-filter`, requestBody);
      
      toast({
        title: "Applying voice filter...",
        description: "Processing your audio with the selected effect",
      });

      // Timeout after 3 minutes with notification
      const timeout = setTimeout(() => {
        clearInterval(pollInterval);
        setApplyingVoiceFilter(false);
        toast({
          title: "Filter timed out",
          description: "Please try again or contact support",
          variant: "destructive",
        });
      }, 180000);

      // Poll for updates
      const pollInterval = setInterval(async () => {
        queryClient.invalidateQueries({ queryKey: ["/api/jobs", currentJobId] });
        const job = queryClient.getQueryData<ProcessingJob>(["/api/jobs", currentJobId]);
        
        // Check if enhancedVideoPath is available (processing complete)
        if (job?.metadata?.voiceFilter?.enhancedVideoPath) {
          clearInterval(pollInterval);
          clearTimeout(timeout);
          setApplyingVoiceFilter(false);
          
          toast({
            title: "Voice filter applied!",
            description: "Your filtered video is ready to download",
          });
        } else if (job?.metadata?.voiceFilter?.status === "failed") {
          clearInterval(pollInterval);
          clearTimeout(timeout);
          setApplyingVoiceFilter(false);
          
          toast({
            title: "Filter failed",
            description: job.metadata.voiceFilter.errorMessage || "Failed to apply voice filter",
            variant: "destructive",
          });
        }
      }, 3000);
      
    } catch (error: any) {
      toast({
        title: "Filter failed",
        description: error.message || "Failed to apply voice filter",
        variant: "destructive",
      });
      setApplyingVoiceFilter(false);
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
                {!successAlertDismissed && (
                  <Alert className="bg-chart-2/10 border-chart-2 relative" data-testid="alert-success">
                    <CheckCircle2 className="h-5 w-5 text-chart-2" />
                    <AlertDescription className="text-base pr-8">
                      <strong>Success!</strong> Your lip-synced video is ready. If it is not perfectly synced up it means your audio was poorly paced or your video had AI artifacts that were not removed or there were inconsistencies between words in the script.
                    </AlertDescription>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 h-6 w-6"
                      onClick={() => setSuccessAlertDismissed(true)}
                      data-testid="button-dismiss-alert"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </Alert>
                )}

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

                {currentJob.metadata?.ambientEnhancement?.enhancedVideoPath && (
                  <Card className="p-6">
                    <h2 className="text-xl font-semibold mb-2">Ambient Sound Enhanced Video</h2>
                    <p className="text-sm text-muted-foreground mb-3">
                      {currentJob.metadata.ambientEnhancement.customPrompt ? (
                        <>Enhanced with custom ambient: "{currentJob.metadata.ambientEnhancement.customPrompt}" at {currentJob.metadata.ambientEnhancement.volume}% volume</>
                      ) : (
                        <>Enhanced with {currentJob.metadata.ambientEnhancement.preset || (currentJob.metadata.ambientEnhancement as any).ambientType || 'ambient'} ambience at {currentJob.metadata.ambientEnhancement.volume}% volume</>
                      )}
                    </p>
                    <div className="flex gap-3">
                      <Button size="lg" asChild className="flex-1">
                        <a href={currentJob.metadata.ambientEnhancement.enhancedVideoPath} download data-testid="button-download-enhanced">
                          <Download className="h-4 w-4 mr-2" />
                          Download Enhanced Video
                        </a>
                      </Button>
                      <Button 
                        size="lg" 
                        variant="outline"
                        onClick={() => {
                          setSelectedAmbientType("office");
                          setCustomAmbientPrompt("");
                          setAmbientVolume(15);
                          queryClient.setQueryData(['/api/jobs', currentJob.id], {
                            ...currentJob,
                            metadata: {
                              ...currentJob.metadata,
                              ambientEnhancement: undefined
                            }
                          });
                        }}
                        className="flex-1"
                        data-testid="button-try-different-enhanced"
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Try Different Ambient
                      </Button>
                    </div>
                  </Card>
                )}

                {currentJob.metadata?.voiceFilter?.enhancedVideoPath && (
                  <Card className="p-6">
                    <h2 className="text-xl font-semibold mb-2">Voice Filtered Video</h2>
                    <p className="text-sm text-muted-foreground mb-3">
                      Applied {currentJob.metadata.voiceFilter.preset?.replace('_', ' ')} filter at {currentJob.metadata.voiceFilter.mix}% mix
                    </p>
                    <div className="flex gap-3">
                      <Button size="lg" asChild className="flex-1">
                        <a href={currentJob.metadata.voiceFilter.enhancedVideoPath} download data-testid="button-download-voice-filtered">
                          <Download className="h-4 w-4 mr-2" />
                          Download Filtered Video
                        </a>
                      </Button>
                      <Button 
                        size="lg" 
                        variant="outline"
                        onClick={() => {
                          setSelectedVoiceFilter("concert_hall");
                          setVoiceFilterMix(50);
                          queryClient.setQueryData(['/api/jobs', currentJob.id], {
                            ...currentJob,
                            metadata: {
                              ...currentJob.metadata,
                              voiceFilter: undefined
                            }
                          });
                        }}
                        className="flex-1"
                        data-testid="button-try-different-filter"
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Try Different Filter
                      </Button>
                    </div>
                  </Card>
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

                    {!currentJob.metadata?.ambientEnhancement?.enhancedVideoPath && (
                      <div className="space-y-3">
                        {!currentJob.metadata?.ambientEnhancement?.previewAudioPath ? (
                          <>
                            <div className="flex flex-col gap-2">
                              <label className="text-sm font-medium">Add Ambient Sound (Optional)</label>
                              <Select 
                                value={selectedAmbientType} 
                                onValueChange={setSelectedAmbientType}
                                disabled={!!customAmbientPrompt.trim() || enhancingAmbient}
                              >
                                <SelectTrigger data-testid="select-ambient-type">
                                  <SelectValue placeholder="Select preset..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="office" data-testid="option-office">Office</SelectItem>
                                  <SelectItem value="cafe" data-testid="option-cafe">Café</SelectItem>
                                  <SelectItem value="nature" data-testid="option-nature">Nature</SelectItem>
                                  <SelectItem value="city" data-testid="option-city">City Street</SelectItem>
                                  <SelectItem value="studio" data-testid="option-studio">Studio</SelectItem>
                                  <SelectItem value="home" data-testid="option-home">Home</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex flex-col gap-2">
                              <label className="text-sm font-medium">Or enter custom prompt</label>
                              <Input
                                type="text"
                                placeholder="Describe the ambient sound you want (e.g., 'Gentle rain with distant thunder')"
                                value={customAmbientPrompt}
                                onChange={(e) => setCustomAmbientPrompt(e.target.value)}
                                disabled={enhancingAmbient}
                                maxLength={200}
                                data-testid="input-custom-prompt"
                                className="font-mono text-sm"
                              />
                              {customAmbientPrompt.length > 0 && (
                                <p className="text-xs text-muted-foreground">
                                  {customAmbientPrompt.length}/200 characters
                                </p>
                              )}
                            </div>
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center justify-between">
                                <label className="text-sm font-medium">Ambient Volume</label>
                                <span className="text-sm text-muted-foreground font-mono">{ambientVolume}%</span>
                              </div>
                              <Slider
                                value={[ambientVolume]}
                                onValueChange={(value) => setAmbientVolume(value[0])}
                                min={0}
                                max={100}
                                step={5}
                                disabled={enhancingAmbient}
                                data-testid="slider-ambient-volume"
                                className="w-full"
                              />
                              <p className="text-xs text-muted-foreground">
                                Adjust how loud the ambient sound will be relative to your voice
                              </p>
                            </div>
                            <Button 
                              size="lg" 
                              variant="secondary" 
                              onClick={handlePreviewAmbient}
                              disabled={enhancingAmbient}
                              className="w-full"
                              data-testid="button-preview-ambient"
                            >
                              {enhancingAmbient ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Generating Preview...
                                </>
                              ) : (
                                <>
                                  <Volume2 className="h-4 w-4 mr-2" />
                                  Preview Ambient Sound
                                </>
                              )}
                            </Button>
                          </>
                        ) : (
                          <div className="space-y-3 p-4 border rounded-lg bg-card">
                            <h3 className="text-sm font-semibold">Preview: {currentJob.metadata.ambientEnhancement.customPrompt || `${currentJob.metadata.ambientEnhancement.preset} ambience`}</h3>
                            <audio 
                              ref={audioPreviewRef}
                              controls 
                              className="w-full"
                              data-testid="audio-preview-player"
                            >
                              <source src={currentJob.metadata.ambientEnhancement.previewAudioPath} type="audio/mpeg" />
                              Your browser does not support the audio tag.
                            </audio>
                            <p className="text-xs text-muted-foreground">
                              Listen to the preview above. If you like it, adjust the volume and apply it to your video.
                            </p>
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center justify-between">
                                <label className="text-sm font-medium">Ambient Volume</label>
                                <span className="text-sm text-muted-foreground font-mono">{ambientVolume}%</span>
                              </div>
                              <Slider
                                value={[ambientVolume]}
                                onValueChange={(value) => setAmbientVolume(value[0])}
                                min={0}
                                max={100}
                                step={5}
                                disabled={enhancingAmbient}
                                data-testid="slider-ambient-volume-preview"
                                className="w-full"
                              />
                              <p className="text-xs text-muted-foreground">
                                This volume will be applied when you add the ambient sound to your video
                              </p>
                            </div>
                            <div className="flex gap-3">
                              <Button 
                                size="lg" 
                                onClick={handleApplyAmbient}
                                disabled={enhancingAmbient}
                                className="flex-1"
                                data-testid="button-apply-ambient"
                              >
                                {enhancingAmbient ? (
                                  <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Mixing with Video...
                                  </>
                                ) : (
                                  <>
                                    <Download className="h-4 w-4 mr-2" />
                                    Apply to Video
                                  </>
                                )}
                              </Button>
                              <Button 
                                size="lg"
                                variant="outline"
                                onClick={() => {
                                  setSelectedAmbientType("");
                                  setCustomAmbientPrompt("");
                                  queryClient.setQueryData(['/api/jobs', currentJob.id], {
                                    ...currentJob,
                                    metadata: {
                                      ...currentJob.metadata,
                                      ambientEnhancement: undefined
                                    }
                                  });
                                }}
                                disabled={enhancingAmbient}
                                className="flex-1"
                                data-testid="button-try-different"
                              >
                                <RotateCcw className="h-4 w-4 mr-2" />
                                Try Different Sound
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {!currentJob.metadata?.voiceFilter?.enhancedVideoPath && (
                      <div className="space-y-3 mt-6 pt-6 border-t">
                        <div className="flex flex-col gap-2">
                          <label className="text-sm font-medium">Apply Voice Filter (Optional)</label>
                          <Select 
                            value={selectedVoiceFilter} 
                            onValueChange={setSelectedVoiceFilter}
                            disabled={applyingVoiceFilter}
                          >
                            <SelectTrigger data-testid="select-voice-filter">
                              <SelectValue placeholder="Select filter..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="concert_hall" data-testid="option-concert-hall">Concert Hall</SelectItem>
                              <SelectItem value="small_room" data-testid="option-small-room">Small Room</SelectItem>
                              <SelectItem value="cathedral" data-testid="option-cathedral">Cathedral</SelectItem>
                              <SelectItem value="stadium" data-testid="option-stadium">Stadium</SelectItem>
                              <SelectItem value="telephone" data-testid="option-telephone">Telephone</SelectItem>
                              <SelectItem value="radio" data-testid="option-radio">Radio</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            Add acoustic effects to your voice audio
                          </p>
                        </div>
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium">Effect Mix</label>
                            <span className="text-sm text-muted-foreground font-mono">{voiceFilterMix}%</span>
                          </div>
                          <Slider
                            value={[voiceFilterMix]}
                            onValueChange={(value) => setVoiceFilterMix(value[0])}
                            min={0}
                            max={100}
                            step={5}
                            disabled={applyingVoiceFilter}
                            data-testid="slider-voice-filter-mix"
                            className="w-full"
                          />
                          <p className="text-xs text-muted-foreground">
                            0% = original voice, 100% = full effect
                          </p>
                        </div>
                        <Button 
                          size="lg" 
                          variant="secondary" 
                          onClick={handleApplyVoiceFilter}
                          disabled={applyingVoiceFilter}
                          className="w-full"
                          data-testid="button-apply-voice-filter"
                        >
                          {applyingVoiceFilter ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Applying Filter...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4 mr-2" />
                              Apply Voice Filter
                            </>
                          )}
                        </Button>
                      </div>
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
