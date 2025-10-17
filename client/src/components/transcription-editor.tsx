import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Save, AlertCircle } from "lucide-react";

interface TranscriptionEditorProps {
  transcription: string;
  onSave?: (text: string) => void;
  disabled?: boolean;
  onHasUnsavedChanges?: (hasChanges: boolean) => void;
}

export function TranscriptionEditor({ 
  transcription, 
  onSave,
  disabled = false,
  onHasUnsavedChanges
}: TranscriptionEditorProps) {
  const [text, setText] = useState(transcription);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setText(transcription);
    setHasChanges(false);
    onHasUnsavedChanges?.(false);
  }, [transcription, onHasUnsavedChanges]);

  const handleChange = (value: string) => {
    setText(value);
    const changed = value !== transcription;
    setHasChanges(changed);
    onHasUnsavedChanges?.(changed);
  };

  const handleSave = () => {
    onSave?.(text);
  };

  const wordCount = text.trim().split(/\s+/).length;
  const charCount = text.length;

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Transcription</h3>
            <p className="text-sm text-muted-foreground">
              Edit the text before generating the cloned voice
            </p>
          </div>
          {hasChanges && (
            <Badge variant="secondary" className="gap-1">
              <AlertCircle className="h-3 w-3" />
              Unsaved changes
            </Badge>
          )}
        </div>

        <Textarea
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          disabled={disabled}
          className="min-h-64 font-sans text-base leading-relaxed resize-none"
          placeholder="Transcription will appear here..."
          data-testid="textarea-transcription"
        />

        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-muted-foreground space-x-4">
            <span>{wordCount} words</span>
            <span>{charCount} characters</span>
          </div>
          
          {onSave && (
            <Button
              onClick={handleSave}
              disabled={!hasChanges || disabled}
              size="sm"
              data-testid="button-save-transcription"
            >
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
