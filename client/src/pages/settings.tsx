import { useState } from "react";
import { Eye, EyeOff, Save, Key } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

export default function SettingsPage() {
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [similarity, setSimilarity] = useState([75]);
  const [stability, setStability] = useState([50]);
  const [styleExaggeration, setStyleExaggeration] = useState([0]);
  const [outputFormat, setOutputFormat] = useState("mp3");
  const [bitrate, setBitrate] = useState("192");
  const [removeNoise, setRemoveNoise] = useState(true);
  const [autoTranscribe, setAutoTranscribe] = useState(true);
  
  const { toast } = useToast();

  const handleSave = () => {
    toast({
      title: "Settings saved",
      description: "Your preferences have been updated successfully.",
    });
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-2">
          Settings
        </h1>
        <p className="text-lg text-muted-foreground">
          Configure your voice cloning preferences and API integration
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              API Configuration
            </CardTitle>
            <CardDescription>
              Connect your ElevenLabs account to enable voice cloning
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="api-key">ElevenLabs API Key</Label>
              <div className="relative">
                <Input
                  id="api-key"
                  type={showApiKey ? "text" : "password"}
                  placeholder="Enter your API key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="pr-10 font-mono text-sm"
                  data-testid="input-api-key"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowApiKey(!showApiKey)}
                  data-testid="button-toggle-api-key"
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Get your API key from{" "}
                <a
                  href="https://elevenlabs.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  elevenlabs.io
                </a>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Voice Quality Settings</CardTitle>
            <CardDescription>
              Fine-tune how your cloned voices sound for optimal emotion and tone preservation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="similarity">Similarity</Label>
                <span className="text-sm text-muted-foreground">{similarity[0]}%</span>
              </div>
              <Slider
                id="similarity"
                value={similarity}
                onValueChange={setSimilarity}
                max={100}
                step={1}
                data-testid="slider-similarity"
              />
              <p className="text-xs text-muted-foreground">
                Higher values make the voice sound more like the original samples
              </p>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="stability">Stability</Label>
                <span className="text-sm text-muted-foreground">{stability[0]}%</span>
              </div>
              <Slider
                id="stability"
                value={stability}
                onValueChange={setStability}
                max={100}
                step={1}
                data-testid="slider-stability"
              />
              <p className="text-xs text-muted-foreground">
                Higher stability = more consistent, lower = more expressive and varied
              </p>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="style">Style Exaggeration</Label>
                <span className="text-sm text-muted-foreground">{styleExaggeration[0]}%</span>
              </div>
              <Slider
                id="style"
                value={styleExaggeration}
                onValueChange={setStyleExaggeration}
                max={100}
                step={1}
                data-testid="slider-style"
              />
              <p className="text-xs text-muted-foreground">
                Amplifies the speaker's style and emotion for more dramatic delivery
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Output Preferences</CardTitle>
            <CardDescription>
              Choose audio format and quality settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="format">Audio Format</Label>
                <Select value={outputFormat} onValueChange={setOutputFormat}>
                  <SelectTrigger id="format" data-testid="select-output-format">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mp3">MP3</SelectItem>
                    <SelectItem value="wav">WAV</SelectItem>
                    <SelectItem value="aac">AAC</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bitrate">Bitrate</Label>
                <Select value={bitrate} onValueChange={setBitrate}>
                  <SelectTrigger id="bitrate" data-testid="select-bitrate">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="128">128 kbps</SelectItem>
                    <SelectItem value="192">192 kbps</SelectItem>
                    <SelectItem value="256">256 kbps</SelectItem>
                    <SelectItem value="320">320 kbps</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Processing Options</CardTitle>
            <CardDescription>
              Automatic processing and enhancement features
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="remove-noise">Remove Background Noise</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically clean audio before processing
                </p>
              </div>
              <Switch
                id="remove-noise"
                checked={removeNoise}
                onCheckedChange={setRemoveNoise}
                data-testid="switch-remove-noise"
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="auto-transcribe">Auto-Transcribe</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically transcribe audio after extraction
                </p>
              </div>
              <Switch
                id="auto-transcribe"
                checked={autoTranscribe}
                onCheckedChange={setAutoTranscribe}
                data-testid="switch-auto-transcribe"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button size="lg" onClick={handleSave} data-testid="button-save-settings">
            <Save className="h-5 w-5 mr-2" />
            Save Settings
          </Button>
        </div>
      </div>
    </div>
  );
}
