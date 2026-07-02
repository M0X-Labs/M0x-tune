import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

const workspaceDir = path.resolve(process.cwd(), "..");
const configFilePath = path.join(workspaceDir, "finetune_config.json");

// Helper to map snake_case to camelCase
const snakeToCamel = (key: string): string => {
  if (key === "local_model_path") return "localModelPath";
  if (key === "coding_dataset_path") return "codingDatasetPath";
  if (key === "coding_dataset_paths") return "codingDatasetPaths";
  if (key === "output_gguf_name") return "outputGgufName";
  if (key === "learning_rate") return "learningRate";
  if (key === "max_steps") return "maxSteps";
  if (key === "per_device_train_batch_size") return "batchSize";
  if (key === "gradient_accumulation_steps") return "gradAccum";
  if (key === "max_seq_length") return "maxSeqLen";
  if (key === "lora_r") return "loraR";
  if (key === "lora_alpha") return "loraAlpha";
  return key;
};

// Helper to map camelCase to snake_case
const camelToSnake = (key: string): string => {
  if (key === "localModelPath") return "local_model_path";
  if (key === "codingDatasetPath") return "coding_dataset_path";
  if (key === "codingDatasetPaths") return "coding_dataset_paths";
  if (key === "outputGgufName") return "output_gguf_name";
  if (key === "learningRate") return "learning_rate";
  if (key === "maxSteps") return "max_steps";
  if (key === "batchSize") return "per_device_train_batch_size";
  if (key === "gradAccum") return "gradient_accumulation_steps";
  if (key === "maxSeqLen") return "max_seq_length";
  if (key === "loraR") return "lora_r";
  if (key === "loraAlpha") return "lora_alpha";
  return key;
};

export async function GET() {
  try {
    let configData: Record<string, any> = {};
    if (fs.existsSync(configFilePath)) {
      const fileContent = fs.readFileSync(configFilePath, "utf-8");
      configData = JSON.parse(fileContent);
    }

    // Map to camelCase for the frontend
    const camelConfig: Record<string, any> = {
      localModelPath: "./base_model",
      codingDatasetPath: "datasets/train_clean.parquet",
      codingDatasetPaths: [],
      outputGgufName: "m0x_m1",
      learningRate: "0.0002",
      maxSteps: "300",
      batchSize: "2",
      gradAccum: "4",
      maxSeqLen: "1024",
      loraR: "16",
      loraAlpha: "16",
    };

    for (const [key, val] of Object.entries(configData)) {
      const camelKey = snakeToCamel(key);
      if (camelKey === "codingDatasetPaths") {
        camelConfig[camelKey] = (Array.isArray(val) ? val : []).map(p => {
          if (typeof p === "string") {
            const normalized = p.replace(/\\/g, "/");
            const idx = normalized.indexOf("datasets/");
            if (idx !== -1) {
              return normalized.substring(idx);
            }
            return normalized;
          }
          return p;
        });
      } else if (camelKey === "codingDatasetPath") {
        const p = String(val);
        const normalized = p.replace(/\\/g, "/");
        const idx = normalized.indexOf("datasets/");
        if (idx !== -1) {
          camelConfig[camelKey] = normalized.substring(idx);
        } else {
          camelConfig[camelKey] = normalized;
        }
      } else {
        camelConfig[camelKey] = String(val);
      }
    }

    return new Response(JSON.stringify(camelConfig), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const snakeConfig: Record<string, any> = {};

    for (const [key, val] of Object.entries(body)) {
      const snakeKey = camelToSnake(key);
      // Parse numbers if applicable
      if (["max_steps", "per_device_train_batch_size", "gradient_accumulation_steps", "max_seq_length", "lora_r", "lora_alpha"].includes(snakeKey)) {
        snakeConfig[snakeKey] = Number(val);
      } else if (snakeKey === "learning_rate") {
        snakeConfig[snakeKey] = Number(val);
      } else if (snakeKey === "coding_dataset_paths") {
        snakeConfig[snakeKey] = Array.isArray(val) ? val : [];
      } else {
        snakeConfig[snakeKey] = val;
      }
    }

    fs.writeFileSync(configFilePath, JSON.stringify(snakeConfig, null, 2), "utf-8");

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
