import Replicate from "replicate";
import fs from "fs/promises";

export class ReplicateService {
  private client: Replicate;

  constructor() {
    const apiToken = process.env.REPLICATE_API_TOKEN;
    if (!apiToken) {
      throw new Error("REPLICATE_API_TOKEN is not configured");
    }
    this.client = new Replicate({ auth: apiToken });
  }

  /**
   * Transcribe audio using Whisper with word-level timestamps
   */
  async transcribeWithTimestamps(audioPath: string): Promise<{
    text: string;
    segments: Array<{
      start: number;
      end: number;
      text: string;
      words?: Array<{
        word: string;
        start: number;
        end: number;
      }>;
    }>;
  }> {
    console.log(`[Replicate] Transcribing audio with word-level timestamps: ${audioPath}`);
    
    // Read audio file as base64
    const audioBuffer = await fs.readFile(audioPath);
    const audioBase64 = audioBuffer.toString('base64');
    const audioDataUri = `data:audio/mpeg;base64,${audioBase64}`;

    const output = await this.client.run(
      "openai/whisper:91ee9c0c3df30478510ff8c8a3a545add1ad0259ad3a9f78fba57fbc05ee64f7",
      {
        input: {
          audio: audioDataUri,
          model: "large-v3",
          language: "en",
          translate: false,
          temperature: 0,
          word_timestamps: true,  // Enable word-level timestamps
          suppress_tokens: "-1",
          condition_on_previous_text: true
        }
      }
    ) as any;

    console.log(`[Replicate] Whisper output:`, JSON.stringify(output).substring(0, 500));

    const result = {
      text: output.text || output.transcription || "",
      segments: output.segments || []
    };

    console.log(`[Replicate] Transcription: ${result.text.substring(0, 200)}...`);
    console.log(`[Replicate] Found ${result.segments.length} segments`);
    
    // Log word count for verification
    const totalWords = result.segments.reduce((sum: number, seg: any) => sum + (seg.words?.length || 0), 0);
    console.log(`[Replicate] Total words with timestamps: ${totalWords}`);
    
    return result;
  }

  /**
   * Generate natural-sounding speech using Bark
   */
  async generateSpeech(text: string): Promise<Buffer> {
    console.log(`[Replicate] Generating speech with Bark`);
    console.log(`[Replicate] Text: ${text.substring(0, 200)}...`);

    const output = await this.client.run(
      "suno-ai/bark:b76242b40d67c76ab6742e987628a2a9ac019e11d56ab96c4e91ce03b79b2787",
      {
        input: {
          prompt: text,
          text_temp: 0.7,
          waveform_temp: 0.7,
          output_full: false, // Just get the audio, not the full output
        }
      }
    ) as any;

    console.log(`[Replicate] Bark output type: ${typeof output}`);
    console.log(`[Replicate] Bark output:`, output);

    // Bark returns a URL to the generated audio file
    let audioUrl: string;
    if (typeof output === 'string') {
      audioUrl = output;
    } else if (output.audio_out) {
      audioUrl = output.audio_out;
    } else {
      throw new Error(`Unexpected Bark output format: ${JSON.stringify(output)}`);
    }

    console.log(`[Replicate] Downloading Bark audio from: ${audioUrl}`);

    // Download the audio file
    const response = await fetch(audioUrl);
    if (!response.ok) {
      throw new Error(`Failed to download Bark audio: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    console.log(`[Replicate] Bark audio downloaded: ${buffer.length} bytes`);
    return buffer;
  }
}
