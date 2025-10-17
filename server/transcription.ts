import { createReadStream } from "fs";
import OpenAI from "openai";

export class TranscriptionService {
  private openai: OpenAI;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error("OpenAI API key not configured");
    }
    this.openai = new OpenAI({ apiKey: key });
  }

  async transcribeAudio(audioPath: string): Promise<string> {
    try {
      const transcription = await this.openai.audio.transcriptions.create({
        file: createReadStream(audioPath),
        model: "whisper-1",
        language: "en",
      });

      return transcription.text;
    } catch (error: any) {
      throw new Error(`Transcription error: ${error.message}`);
    }
  }
}
