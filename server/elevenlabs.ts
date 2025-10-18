import fs from "fs";
import FormData from "form-data";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

export class ElevenLabsService {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ELEVENLABS_API_KEY || "";
  }

  async cloneVoice(
    name: string,
    files: string[],
    description?: string,
    labels?: {
      language?: string;
      accent?: string;
      gender?: string;
      age?: string;
      use_case?: string;
    }
  ): Promise<{ voice_id: string }> {
    if (!this.apiKey) {
      throw new Error("ElevenLabs API key not configured");
    }

    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append("name", name);
      if (description) {
        formData.append("description", description);
      }
      
      // Add labels to help ElevenLabs optimize voice quality
      if (labels) {
        const labelsObj: Record<string, string> = {};
        if (labels.language) labelsObj.language = labels.language;
        if (labels.accent) labelsObj.accent = labels.accent;
        if (labels.gender) labelsObj.gender = labels.gender;
        if (labels.age) labelsObj.age = labels.age;
        if (labels.use_case) labelsObj.use_case = labels.use_case;
        
        if (Object.keys(labelsObj).length > 0) {
          formData.append("labels", JSON.stringify(labelsObj));
        }
      }

      files.forEach((filePath) => {
        const fileName = filePath.split('/').pop() || 'audio.wav';
        const ext = fileName.split('.').pop()?.toLowerCase();
        const contentType = 
          ext === 'mp3' ? 'audio/mpeg' :
          ext === 'wav' ? 'audio/wav' :
          ext === 'm4a' ? 'audio/mp4' :
          ext === 'ogg' ? 'audio/ogg' :
          'audio/mpeg';
        
        formData.append("files", fs.createReadStream(filePath), {
          filename: fileName,
          contentType: contentType,
        });
      });

      formData.submit(
        {
          protocol: "https:",
          host: "api.elevenlabs.io",
          path: "/v1/voices/add",
          method: "POST",
          headers: {
            "xi-api-key": this.apiKey,
          },
        },
        (err, response) => {
          if (err) {
            return reject(new Error(`ElevenLabs API error: ${err.message}`));
          }

          let data = "";
          response.on("data", (chunk) => {
            data += chunk;
          });

          response.on("end", () => {
            if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
              try {
                resolve(JSON.parse(data));
              } catch (e) {
                reject(new Error("Failed to parse ElevenLabs response"));
              }
            } else {
              reject(
                new Error(`ElevenLabs API error: ${response.statusCode} - ${data}`)
              );
            }
          });

          response.on("error", (error) => {
            reject(new Error(`ElevenLabs API error: ${error.message}`));
          });
        }
      );
    });
  }

  async speechToSpeech(
    voiceId: string,
    audioFilePath: string,
    options: {
      modelId?: string;
      removeBackgroundNoise?: boolean;
      voiceSettings?: {
        stability?: number;
        similarity_boost?: number;
        style?: number;
        use_speaker_boost?: boolean;
        voice_conversion_strength?: number;
      };
    } = {},
  ): Promise<Buffer> {
    if (!this.apiKey) {
      throw new Error("ElevenLabs API key not configured");
    }

    // Optimized voice settings for MAXIMUM voice transformation (not preservation)
    const voiceSettings = {
      stability: 0.5,              // Lower = more transformation, less source preservation
      similarity_boost: 1.0,       // Maximum = strongest match to target voice (full replacement)
      style: 0,                    // No AI interpretation
      use_speaker_boost: true,     // Enhances similarity (slight latency cost)
      ...options.voiceSettings,
    };
    
    const apiPath = `/v1/speech-to-speech/${voiceId}`;
    
    console.log(`[S2S] Converting speech with voice: ${voiceId}, audio: ${audioFilePath}`);
    console.log(`[S2S] API endpoint: https://api.elevenlabs.io${apiPath}`);
    console.log(`[S2S] Voice settings:`, JSON.stringify(voiceSettings));
    console.log(`[S2S] Model: ${options.modelId || "eleven_multilingual_sts_v2"}`);
    console.log(`[S2S] Remove background noise: ${options.removeBackgroundNoise !== false}`);

    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append("audio", fs.createReadStream(audioFilePath), {
        filename: "input.mp3",
        contentType: "audio/mpeg",
      });
      // Use eleven_multilingual_sts_v2 for best quality (outperforms English-only model)
      formData.append("model_id", options.modelId || "eleven_multilingual_sts_v2");
      
      // Enable background noise removal for cleaner output
      formData.append("remove_background_noise", (options.removeBackgroundNoise !== false).toString());
      
      formData.append("voice_settings", JSON.stringify(voiceSettings));

      formData.submit(
        {
          protocol: "https:",
          host: "api.elevenlabs.io",
          path: apiPath,
          method: "POST",
          headers: {
            "xi-api-key": this.apiKey,
          },
        },
        (err, response) => {
          if (err) {
            return reject(new Error(`ElevenLabs S2S error: ${err.message}`));
          }

          const chunks: Buffer[] = [];
          response.on("data", (chunk) => {
            chunks.push(chunk);
          });

          response.on("end", () => {
            console.log(`[S2S] Response status code: ${response.statusCode}`);
            console.log(`[S2S] Response headers:`, JSON.stringify(response.headers));
            
            if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
              const audioBuffer = Buffer.concat(chunks);
              console.log(`[S2S] Conversion completed: ${audioBuffer.length} bytes`);
              console.log(`[S2S] Content-Type: ${response.headers['content-type']}`);
              console.log(`[S2S] First 100 bytes:`, audioBuffer.slice(0, 100).toString('hex'));
              resolve(audioBuffer);
            } else {
              const errorText = Buffer.concat(chunks).toString();
              console.log(`[S2S] Error response body:`, errorText);
              reject(
                new Error(`ElevenLabs S2S error: ${response.statusCode} - ${errorText}`)
              );
            }
          });

          response.on("error", (error) => {
            reject(new Error(`ElevenLabs S2S error: ${error.message}`));
          });
        }
      );
    });
  }

  async textToSpeech(
    text: string,
    voiceId: string,
    options: {
      similarity_boost?: number;
      stability?: number;
      style?: number;
    } = {},
  ): Promise<Buffer> {
    if (!this.apiKey) {
      throw new Error("ElevenLabs API key not configured");
    }

    console.log(`[TTS] Calling ElevenLabs API for voice ${voiceId}, text length: ${text.length}`);
    
    try {
      const response = await fetch(
        `${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": this.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text,
            model_id: "eleven_multilingual_v2",
            voice_settings: {
              similarity_boost: options.similarity_boost ?? 0.75,
              stability: options.stability ?? 0.5,
              style: options.style ?? 0,
            },
          }),
        },
      );

      console.log(`[TTS] Response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[TTS] Error response body: ${errorText}`);
        throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      console.log(`[TTS] Received audio buffer: ${arrayBuffer.byteLength} bytes`);
      return Buffer.from(arrayBuffer);
    } catch (error) {
      console.error(`[TTS] Exception during text-to-speech:`, error);
      throw error;
    }
  }

  async getVoice(voiceId: string): Promise<any> {
    if (!this.apiKey) {
      throw new Error("ElevenLabs API key not configured");
    }

    const response = await fetch(`${ELEVENLABS_API_BASE}/voices/${voiceId}`, {
      headers: {
        "xi-api-key": this.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.status}`);
    }

    return await response.json();
  }

  async deleteVoice(voiceId: string): Promise<void> {
    if (!this.apiKey) {
      throw new Error("ElevenLabs API key not configured");
    }

    const response = await fetch(`${ELEVENLABS_API_BASE}/voices/${voiceId}`, {
      method: "DELETE",
      headers: {
        "xi-api-key": this.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.status}`);
    }
  }
}
