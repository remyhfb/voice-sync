import fs from "fs";
import FormData from "form-data";
import { logger } from "./logger";

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

    // Optimized voice settings for MAXIMUM voice transformation while preserving prosody/emotion
    const voiceSettings = {
      stability: 0.5,                      // Balanced stability for natural speech
      similarity_boost: 1.0,               // Maximum similarity to target voice
      style: 0,                            // No AI interpretation (preserve source emotion)
      use_speaker_boost: true,             // Enhances target voice similarity
      voice_conversion_strength: 1.0,      // CRITICAL: Full voice replacement (default is 0.3!)
      ...options.voiceSettings,
    };
    
    const apiPath = `/v1/speech-to-speech/${voiceId}`;
    
    logger.info("ElevenLabs", "Starting speech-to-speech conversion", { 
      voiceId: voiceId.substring(0, 8),
      model: options.modelId || "eleven_multilingual_sts_v2",
      removeNoise: options.removeBackgroundNoise !== false
    });

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
            if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
              const audioBuffer = Buffer.concat(chunks);
              logger.info("ElevenLabs", "S2S conversion complete", { 
                bytes: audioBuffer.length,
                contentType: response.headers['content-type']
              });
              resolve(audioBuffer);
            } else {
              const errorText = Buffer.concat(chunks).toString();
              logger.error("ElevenLabs", "S2S conversion failed", new Error(errorText));
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

    logger.info("ElevenLabs", "Starting TTS conversion", { 
      voiceId: voiceId.substring(0, 8),
      textLength: text.length
    });
    
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

      if (!response.ok) {
        const errorText = await response.text();
        logger.error("ElevenLabs", "TTS conversion failed", new Error(errorText));
        throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      logger.info("ElevenLabs", "TTS conversion complete", { bytes: arrayBuffer.byteLength });
      return Buffer.from(arrayBuffer);
    } catch (error) {
      logger.error("ElevenLabs", "TTS exception", error as Error);
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

  async isolateVoice(audioFilePath: string): Promise<Buffer> {
    if (!this.apiKey) {
      throw new Error("ElevenLabs API key not configured");
    }

    logger.info("ElevenLabs", "Starting audio isolation");

    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append("audio", fs.createReadStream(audioFilePath), {
        filename: "audio.m4a",
        contentType: "audio/mp4",
      });

      formData.submit(
        {
          protocol: "https:",
          host: "api.elevenlabs.io",
          path: "/v1/audio-isolation",
          method: "POST",
          headers: {
            "xi-api-key": this.apiKey,
          },
        },
        (err, response) => {
          if (err) {
            return reject(new Error(`ElevenLabs Audio Isolation error: ${err.message}`));
          }

          const chunks: Buffer[] = [];
          response.on("data", (chunk) => {
            chunks.push(chunk);
          });

          response.on("end", () => {
            if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
              const audioBuffer = Buffer.concat(chunks);
              logger.info("ElevenLabs", "Audio isolation complete", { bytes: audioBuffer.length });
              resolve(audioBuffer);
            } else {
              const errorText = Buffer.concat(chunks).toString();
              logger.error("ElevenLabs", "Audio isolation failed", new Error(errorText));
              reject(
                new Error(`ElevenLabs Audio Isolation error: ${response.statusCode} - ${errorText}`)
              );
            }
          });

          response.on("error", (error) => {
            reject(new Error(`ElevenLabs Audio Isolation error: ${error.message}`));
          });
        }
      );
    });
  }

  async generateSoundEffect(
    prompt: string,
    options: {
      durationSeconds?: number;
      promptInfluence?: number;
    } = {}
  ): Promise<Buffer> {
    if (!this.apiKey) {
      throw new Error("ElevenLabs API key not configured");
    }

    const durationSeconds = options.durationSeconds || 10;
    const promptInfluence = options.promptInfluence ?? 0.3;

    logger.info("ElevenLabs", "Generating sound effect with v2 model", {
      prompt,
      duration: durationSeconds,
      influence: promptInfluence
    });

    try {
      const response = await fetch(
        `${ELEVENLABS_API_BASE}/sound-generation`,
        {
          method: "POST",
          headers: {
            "xi-api-key": this.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: prompt,
            duration_seconds: durationSeconds,
            prompt_influence: promptInfluence,
            model_id: "eleven_text_to_sound_v2" // ***V2 MODEL*** as requested
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        logger.error("ElevenLabs", "Sound effect generation failed", new Error(errorText));
        throw new Error(`ElevenLabs Sound Effect API error: ${response.status} - ${errorText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      logger.info("ElevenLabs", "Sound effect generation complete", { 
        bytes: arrayBuffer.byteLength,
        prompt
      });
      return Buffer.from(arrayBuffer);
    } catch (error) {
      logger.error("ElevenLabs", "Sound effect generation exception", error as Error);
      throw error;
    }
  }
}
