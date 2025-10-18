import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Plus, Mic, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileUploadZone } from "@/components/file-upload-zone";
import { VoiceCloneCard } from "@/components/voice-clone-card";
import { QualityMeter } from "@/components/quality-meter";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { VoiceClone } from "@shared/schema";

export default function VoicesPage() {
  const [, setLocation] = useLocation();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [voiceName, setVoiceName] = useState("");
  const [audioSamples, setAudioSamples] = useState<File[]>([]);
  const [audioElement] = useState(() => new Audio());
  const { toast } = useToast();

  const { data: voices = [], isLoading } = useQuery<VoiceClone[]>({
    queryKey: ["/api/voices"],
    refetchInterval: (query) => {
      const voices = query.state.data;
      const hasTrainingVoices = voices?.some((v) => v.status === "training");
      return hasTrainingVoices ? 2000 : false; // Poll every 2 seconds if any voice is training
    },
  });

  const createVoiceMutation = useMutation({
    mutationFn: async (data: { name: string; files: File[] }) => {
      const formData = new FormData();
      formData.append("name", data.name);
      data.files.forEach((file) => {
        formData.append("samples", file);
      });

      const response = await fetch("/api/voices", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/voices"] });
      setIsCreateDialogOpen(false);
      setVoiceName("");
      setAudioSamples([]);
      toast({
        title: "Voice cloning started",
        description: "Your voice is being cloned with ElevenLabs. This usually completes in seconds.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create voice clone",
        variant: "destructive",
      });
    },
  });

  const deleteVoiceMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/voices/${id}`, null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/voices"] });
      toast({
        title: "Voice deleted",
        description: "Voice clone has been removed.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete voice",
        variant: "destructive",
      });
    },
  });

  const handlePlayVoice = async (voiceId: string) => {
    try {
      // Stop any currently playing audio
      audioElement.pause();
      audioElement.currentTime = 0;

      toast({
        title: "Generating preview...",
        description: "Creating a voice sample with ElevenLabs",
      });

      const response = await fetch(`/api/voices/${voiceId}/preview`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to generate preview");
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      
      audioElement.src = audioUrl;
      await audioElement.play();

      toast({
        title: "Playing preview",
        description: "Listen to your cloned voice",
      });

      // Clean up the blob URL when audio finishes
      audioElement.onended = () => {
        URL.revokeObjectURL(audioUrl);
      };
    } catch (error) {
      toast({
        title: "Preview failed",
        description: "Could not generate voice preview. Try again.",
        variant: "destructive",
      });
    }
  };

  const handleCreateVoice = () => {
    if (!voiceName || audioSamples.length === 0) return;
    createVoiceMutation.mutate({ name: voiceName, files: audioSamples });
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-2">
            Voice Library
          </h1>
          <p className="text-lg text-muted-foreground">
            Clone voices with ElevenLabs Speech-to-Speech for perfect timing and lip-sync
          </p>
        </div>

        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button size="lg" data-testid="button-create-voice">
              <Plus className="h-5 w-5 mr-2" />
              Create Voice Clone
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Voice Clone</DialogTitle>
              <DialogDescription>
                Upload audio samples to create a realistic voice clone. For best results,
                use 3-5 minutes of clear audio with varied emotion and tone.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <Label htmlFor="voice-name">Voice Name</Label>
                <Input
                  id="voice-name"
                  placeholder="e.g., Professional Male Voice"
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                  data-testid="input-voice-name"
                />
              </div>

              <div className="space-y-2">
                <Label>Audio Samples</Label>
                <FileUploadZone
                  accept="audio/*"
                  maxSize={11 * 1024 * 1024}
                  multiple
                  onFilesSelected={setAudioSamples}
                  title="Upload Audio Samples"
                  description="Upload clear audio recordings with natural speech, emotion, and varied tone. MP3, WAV, M4A supported. Max 11MB per file."
                  icon="audio"
                />
              </div>

              <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Mic className="h-4 w-4 text-primary" />
                  Tips for Best Quality
                </h4>
                <ul className="text-xs text-muted-foreground space-y-1 ml-6 list-disc">
                  <li>Use 3-5 minutes of audio for optimal results</li>
                  <li>Ensure clear audio with minimal background noise</li>
                  <li>Include varied emotion, tone, and speaking styles</li>
                  <li>Natural pauses and inflection improve authenticity</li>
                </ul>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsCreateDialogOpen(false)}
                disabled={createVoiceMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateVoice}
                disabled={!voiceName || audioSamples.length === 0 || createVoiceMutation.isPending}
                data-testid="button-confirm-create-voice"
              >
                {createVoiceMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Voice Clone"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {voices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted mb-4">
            <Mic className="h-10 w-10 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-semibold mb-2">No voice clones yet</h3>
          <p className="text-muted-foreground max-w-md mb-6">
            Create your first voice clone to start replacing synthetic AI voices with
            authentic-sounding audio that captures emotion and tone.
          </p>
          <Button size="lg" onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="h-5 w-5 mr-2" />
            Create Your First Voice
          </Button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {voices.map((voice) => (
            <VoiceCloneCard
              key={voice.id}
              voiceClone={voice}
              onPlay={() => handlePlayVoice(voice.id)}
              onUse={() => setLocation("/")}
              onDelete={() => deleteVoiceMutation.mutate(voice.id)}
            />
          ))}
        </div>
      )}

      {voices.some((v) => v.quality) && (
        <div className="mt-12">
          <h2 className="text-2xl font-semibold mb-6">Voice Quality Metrics</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {voices
              .filter((v) => v.quality)
              .map((voice) => (
                <div key={voice.id} className="flex flex-col items-center p-6 rounded-lg bg-card border">
                  <h3 className="font-semibold mb-4">{voice.name}</h3>
                  <QualityMeter quality={voice.quality!} size="md" />
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
