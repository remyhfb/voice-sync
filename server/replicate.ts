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
    console.log(`[Replicate] Transcribing audio with timestamps: ${audioPath}`);
    
    // Read audio file as base64
    const audioBuffer = await fs.readFile(audioPath);
    const audioBase64 = audioBuffer.toString('base64');
    const audioDataUri = `data:audio/mpeg;base64,${audioBase64}`;

    const output = await this.client.run(
      "openai/whisper:4d50797290df275329f202e48c76360b3f22b08d28c196cbc54600319435f8d2",
      {
        input: {
          audio: audioDataUri,
          model: "large-v3",
          language: "en",
          translate: false,
          temperature: 0,
          transcription: "srt", // Get timestamps in SRT format
          suppress_tokens: "-1",
          logprob_threshold: -1.0,
          no_speech_threshold: 0.6,
          condition_on_previous_text: true,
          compression_ratio_threshold: 2.4,
          temperature_increment_on_fallback: 0.2,
        }
      }
    ) as any;

    console.log(`[Replicate] Whisper output:`, JSON.stringify(output).substring(0, 500));

    // Parse the output to extract segments with timestamps
    const result = {
      text: output.text || output.transcription || "",
      segments: output.segments || []
    };

    console.log(`[Replicate] Transcription: ${result.text.substring(0, 200)}...`);
    console.log(`[Replicate] Found ${result.segments.length} segments with timestamps`);
    
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
