import Replicate from "replicate";

// Latest working version for RVC training (updated Oct 2025)
const REPLICATE_RVC_TRAINING_MODEL = "replicate/train-rvc-model:0397d5e28c9b54665e1e5d29d5cf4f722a7b89ec20e9dbf31487235305b1a101";
// Inference version for voice conversion
const REPLICATE_RVC_INFERENCE_MODEL = "zsxkib/realistic-voice-cloning:56d0c89f960d4f2e291ace63531a5dc2ab2557c5a9c8c7bf5c85ef537e8b9117";

export class ReplicateService {
  private client: Replicate;

  constructor(apiToken?: string) {
    const token = apiToken || process.env.REPLICATE_API_TOKEN;
    if (!token) {
      throw new Error("Replicate API token not configured");
    }
    this.client = new Replicate({ auth: token });
  }

  async trainVoiceModel(
    datasetZipUrl: string,
    modelName: string
  ): Promise<{ modelUrl: string; trainingId: string }> {
    console.log(`[RVC] Starting voice model training for: ${modelName}`);
    
    // train-rvc-model is a prediction model, not a training endpoint
    const prediction = await this.client.predictions.create({
      version: REPLICATE_RVC_TRAINING_MODEL.split(":")[1],
      input: {
        dataset_zip: datasetZipUrl,
        sample_rate: "48k",
        version: "v2",
        f0method: "rmvpe_gpu",
        epoch: 50,
        batch_size: "7",
      },
    });

    console.log(`[RVC] Training prediction started: ${prediction.id}`);
    return {
      trainingId: prediction.id,
      modelUrl: "",
    };
  }

  async getTrainingStatus(trainingId: string): Promise<{
    status: string;
    modelUrl?: string;
    error?: string;
    logs?: string;
  }> {
    const prediction = await this.client.predictions.get(trainingId);
    
    return {
      status: prediction.status,
      // Output is a URL to the trained model zip file
      modelUrl: typeof prediction.output === 'string' ? prediction.output : undefined,
      error: prediction.error?.toString(),
      logs: prediction.logs,
    };
  }

  async convertVoice(
    audioUrl: string,
    rvcModelUrl: string,
    options: {
      pitchChange?: number;
      indexRate?: number;
      filterRadius?: number;
      rmsLevel?: number;
    } = {}
  ): Promise<string> {
    console.log(`[RVC] Converting voice for audio: ${audioUrl}`);
    console.log(`[RVC] Using model: ${rvcModelUrl}`);

    const output = await this.client.run(REPLICATE_RVC_INFERENCE_MODEL, {
      input: {
        song_input: audioUrl,
        rvc_model: "CUSTOM",
        custom_rvc_model_download_url: rvcModelUrl,
        pitch_change: options.pitchChange || 0,
        index_rate: options.indexRate || 0.5,
        filter_radius: options.filterRadius || 3,
        rms_mix_rate: options.rmsLevel || 0.25,
        protect: 0.33,
      },
    });

    console.log(`[RVC] Voice conversion completed`);
    return output as string;
  }
}
