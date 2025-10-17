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
      throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
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
