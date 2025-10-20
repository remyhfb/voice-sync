import { useState, useRef, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Scissors, Play, Pause, Plus, Trash2, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { ProcessingJob } from "@shared/schema";

interface Segment {
  id: string;
  startTime: number;
  endTime: number;
}

export default function EditVideoPage() {
  const [, params] = useRoute("/edit/:jobId");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [isTrimming, setIsTrimming] = useState(false);

  const jobId = params?.jobId;

  const { data: job, isLoading, error } = useQuery<ProcessingJob>({
    queryKey: ["/api/jobs", jobId],
    queryFn: async () => {
      if (!jobId) throw new Error("No job ID");
      const response = await fetch(`/api/jobs/${jobId}`);
      if (!response.ok) throw new Error("Failed to fetch job");
      return response.json();
    },
    enabled: !!jobId,
  });

  // Show error toast if job fetch fails
  useEffect(() => {
    if (error) {
      toast({
        title: "Failed to load job",
        description: error instanceof Error ? error.message : "Could not fetch job details",
        variant: "destructive",
      });
    }
  }, [error, toast]);

  useEffect(() => {
    if (duration > 0 && segments.length === 0) {
      // Initialize with full video segment
      setSegments([{
        id: crypto.randomUUID(),
        startTime: 0,
        endTime: duration
      }]);
    }
  }, [duration, segments.length]);

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const addSegment = () => {
    const newSegment: Segment = {
      id: crypto.randomUUID(),
      startTime: currentTime,
      endTime: Math.min(currentTime + 5, duration)
    };
    setSegments([...segments, newSegment].sort((a, b) => a.startTime - b.startTime));
  };

  const removeSegment = (id: string) => {
    setSegments(segments.filter(s => s.id !== id));
  };

  const updateSegment = (id: string, field: 'startTime' | 'endTime', value: number) => {
    setSegments(segments.map(s => 
      s.id === id ? { ...s, [field]: value } : s
    ).sort((a, b) => a.startTime - b.startTime));
  };

  const handleTrim = async () => {
    if (!jobId || segments.length === 0) return;

    setIsTrimming(true);
    try {
      await apiRequest("POST", `/api/jobs/${jobId}/trim`, {
        segments: segments.map(s => ({
          startTime: s.startTime,
          endTime: s.endTime
        }))
      });

      toast({
        title: "Trimming video",
        description: "Your video is being processed. You can continue to pipeline selection.",
      });

      // Navigate to create page with job ID
      setLocation(`/?jobId=${jobId}`);
    } catch (error: any) {
      toast({
        title: "Trim failed",
        description: error.message || "Failed to trim video",
        variant: "destructive",
      });
    } finally {
      setIsTrimming(false);
    }
  };

  const handleSkip = () => {
    if (!jobId) return;
    setLocation(`/?jobId=${jobId}`);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading video...</p>
      </div>
    );
  }

  if (!job || !job.videoPath) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Video not found</p>
      </div>
    );
  }

  const videoPath = job.metadata?.trimmedVideoPath || job.videoPath;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Trim Video</h1>
          <p className="text-muted-foreground mt-1">
            Remove unwanted segments before processing
          </p>
        </div>
        <Button
          variant="ghost"
          onClick={handleSkip}
          data-testid="button-skip-editing"
        >
          Skip Editing
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Video Player */}
        <Card>
          <CardHeader>
            <CardTitle>Video Preview</CardTitle>
            <CardDescription>
              Use the timeline below to select which parts to keep
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-black rounded-lg overflow-hidden aspect-video">
              <video
                ref={videoRef}
                src={videoPath}
                className="w-full h-full"
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                data-testid="video-preview"
              />
            </div>

            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="icon"
                onClick={togglePlayPause}
                data-testid="button-play-pause"
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <div className="flex-1">
                <div className="text-sm font-mono">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </div>
                <input
                  type="range"
                  min="0"
                  max={duration || 0}
                  step="0.1"
                  value={currentTime}
                  onChange={(e) => {
                    const time = parseFloat(e.target.value);
                    if (videoRef.current) {
                      videoRef.current.currentTime = time;
                      setCurrentTime(time);
                    }
                  }}
                  className="w-full"
                  data-testid="input-timeline-scrubber"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Segments Panel */}
        <Card>
          <CardHeader>
            <CardTitle>Keep Segments</CardTitle>
            <CardDescription>
              Define which parts of the video to keep. All other parts will be removed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {segments.map((segment, index) => (
                <div
                  key={segment.id}
                  className="flex items-center gap-2 p-3 border rounded-md"
                >
                  <div className="flex-1 space-y-2">
                    <div className="text-sm font-medium">Segment {index + 1}</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground">Start</label>
                        <input
                          type="number"
                          min="0"
                          max={duration}
                          step="0.1"
                          value={segment.startTime.toFixed(1)}
                          onChange={(e) => updateSegment(segment.id, 'startTime', parseFloat(e.target.value))}
                          className="w-full px-2 py-1 text-sm border rounded"
                          data-testid={`input-segment-start-${index}`}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">End</label>
                        <input
                          type="number"
                          min="0"
                          max={duration}
                          step="0.1"
                          value={segment.endTime.toFixed(1)}
                          onChange={(e) => updateSegment(segment.id, 'endTime', parseFloat(e.target.value))}
                          className="w-full px-2 py-1 text-sm border rounded"
                          data-testid={`input-segment-end-${index}`}
                        />
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeSegment(segment.id)}
                    disabled={segments.length === 1}
                    data-testid={`button-remove-segment-${index}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={addSegment}
                disabled={!duration}
                data-testid="button-add-segment"
                className="flex-1"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Segment
              </Button>
              <Button
                onClick={handleTrim}
                disabled={isTrimming || segments.length === 0}
                data-testid="button-trim-video"
                className="flex-1"
              >
                <Scissors className="h-4 w-4 mr-2" />
                {isTrimming ? "Trimming..." : "Trim & Continue"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
