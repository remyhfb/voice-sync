import { useQuery } from "@tanstack/react-query";
import { Video, Clock, CheckCircle2, XCircle, Loader2, Download, Play, AlertCircle } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ProcessingJob } from "@shared/schema";
import { AlignmentReport } from "@/components/AlignmentReport";
import { useState } from "react";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { useToast } from "@/hooks/use-toast";

export default function ProjectsPage() {
  const { data: projects = [], isLoading } = useQuery<ProcessingJob[]>({
    queryKey: ["/api/jobs"],
  });
  const [expandedVideo, setExpandedVideo] = useState<string | null>(null);
  const { toast } = useToast();

  const handleVideoError = (projectId: string) => {
    toast({
      variant: "destructive",
      title: "Video playback error",
      description: "Unable to load the video. The file may be corrupted or missing. Try downloading it instead.",
    });
    setExpandedVideo(null);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-5 w-5 text-chart-2" />;
      case "failed":
        return <XCircle className="h-5 w-5 text-destructive" />;
      default:
        return <Clock className="h-5 w-5 text-primary animate-pulse" />;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-2">
          Projects
        </h1>
        <p className="text-lg text-muted-foreground">
          Track your voice replacement projects and download completed audio
        </p>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted mb-4">
            <Video className="h-10 w-10 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-semibold mb-2">No projects yet</h3>
          <p className="text-muted-foreground max-w-md">
            Start by creating a voice clone and uploading a video to replace its audio.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {projects.map((project) => (
            <div key={project.id} className="space-y-4">
              <Card className="hover-elevate" data-testid={`card-project-${project.id}`}>
                <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="flex h-10 w-10 items-center justify-center rounded bg-muted flex-shrink-0">
                      <Video className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold font-mono text-sm truncate" data-testid="text-video-name">
                        {project.metadata?.videoFileName || "Video"}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {project.type.replace("_", " ")}
                      </p>
                    </div>
                  </div>
                  {getStatusIcon(project.status)}
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Status</span>
                    <Badge
                      variant={
                        project.status === "completed"
                          ? "default"
                          : project.status === "failed"
                          ? "destructive"
                          : "secondary"
                      }
                      className={cn(
                        project.status === "completed" && "bg-chart-2 hover:bg-chart-2",
                        "capitalize"
                      )}
                    >
                      {project.status}
                    </Badge>
                  </div>

                  {project.status === "processing" && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Progress</span>
                        <span>{project.progress}%</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${project.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Created</span>
                    <span className="text-xs">
                      {new Date(project.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  {project.metadata?.videoDuration && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Duration</span>
                      <span className="text-xs font-mono">
                        {formatDuration(project.metadata.videoDuration)}
                      </span>
                    </div>
                  )}
                </CardContent>

                <CardFooter className="pt-4 border-t gap-2">
                  {project.status === "completed" && project.mergedVideoPath && (
                    <>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1"
                        onClick={() => setExpandedVideo(expandedVideo === project.id ? null : project.id)}
                        data-testid={`button-watch-video-${project.id}`}
                      >
                        <Play className="h-4 w-4 mr-2" />
                        {expandedVideo === project.id ? "Hide Video" : "Watch Video"}
                      </Button>
                      <Button size="sm" className="flex-1" asChild>
                        <a href={project.mergedVideoPath} download data-testid={`button-download-${project.id}`}>
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </a>
                      </Button>
                    </>
                  )}
                  {project.status === "completed" && !project.mergedVideoPath && (
                    <p className="text-sm text-muted-foreground text-center w-full py-2">
                      Video file not available
                    </p>
                  )}
                  {project.status === "processing" && (
                    <Button variant="outline" size="sm" className="w-full" disabled>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </Button>
                  )}
                  {project.status === "failed" && (
                    <Button variant="outline" size="sm" className="w-full" asChild>
                      <a href="/">Retry</a>
                    </Button>
                  )}
                </CardFooter>
              </Card>

              {project.status === "completed" && expandedVideo === project.id && project.mergedVideoPath && (
                <Card>
                  <CardContent className="p-0">
                    <AspectRatio ratio={16/9}>
                      <video
                        key={project.mergedVideoPath}
                        controls
                        className="w-full h-full rounded-lg"
                        onError={() => handleVideoError(project.id)}
                        data-testid={`video-player-${project.id}`}
                      >
                        <source src={project.mergedVideoPath} type="video/mp4" />
                        Your browser does not support the video tag.
                      </video>
                    </AspectRatio>
                  </CardContent>
                </Card>
              )}

              {project.status === "completed" && project.metadata?.alignmentReport && (
                <AlignmentReport report={project.metadata.alignmentReport} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
