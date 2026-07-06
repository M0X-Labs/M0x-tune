import argparse
import json
import os
import shutil
from pathlib import Path

# Setup environment variable overrides BEFORE imports
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
os.environ["UNSLOTH_COMPILE_DISABLE"] = "1"
os.environ["UNSLOTH_ENABLE_FLEX_ATTENTION"] = "0"
os.environ["UNSLOTH_LLAMA_CPP_PATH"] = str(Path(__file__).parent / ".unsloth" / "llama.cpp")
os.environ["UV_CACHE_DIR"] = str(Path(__file__).parent / ".uv_cache")
os.environ["PIP_CACHE_DIR"] = str(Path(__file__).parent / ".pip_cache")
os.environ["TEMP"] = str(Path(__file__).parent / ".tmp")
os.environ["TMP"] = str(Path(__file__).parent / ".tmp")

# Ensure directories exist
Path(os.environ["TEMP"]).mkdir(exist_ok=True)
Path(os.environ["PIP_CACHE_DIR"]).mkdir(exist_ok=True)

from backend.gemma4_patch import apply_gemma4_patch
apply_gemma4_patch()

import torch
torch._dynamo.config.disable = True  # Disable torch.compile globally to avoid cl.exe compiler crashes on Windows

from unsloth import FastLanguageModel
from unsloth import save as unsloth_save

# Monkeypatch save_to_gguf to inject processor_config.json
original_save_to_gguf = unsloth_save.save_to_gguf


def patched_save_to_gguf(*args, **kwargs):
    model_directory = kwargs.get("model_directory")
    if not model_directory and len(args) >= 5:
        model_directory = args[4]

    if model_directory:
        print(f"\n[PATCH] Copying processor_config.json to {model_directory} before GGUF conversion...")
        src_path = Path(__file__).parent / "base_model" / "processor_config.json"
        dest_path = Path(model_directory) / "processor_config.json"
        try:
            shutil.copy(src_path, dest_path)
            print(f"[PATCH] Successfully copied processor_config.json to {dest_path}")
        except Exception as e:
            print(f"[PATCH] Error copying processor_config.json: {e}")

    return original_save_to_gguf(*args, **kwargs)


unsloth_save.save_to_gguf = patched_save_to_gguf


def main():
    parser = argparse.ArgumentParser(description="Export GGUF models with multiple quantization options")
    parser.add_argument("--config", type=str, help="Path to config JSON file")
    args = parser.parse_args()

    config_data = {}
    if args.config and os.path.exists(args.config):
        print(f"Loading export settings from {args.config}...")
        try:
            with open(args.config, "r") as f:
                config_data = json.load(f)
        except Exception as e:
            print(f"Error loading {args.config}: {e}")
    else:
        # Fall back to finetune_config.json if no config provided
        config_path = Path(__file__).parent / "finetune_config.json"
        if config_path.exists():
            print(f"Loading export settings from {config_path}...")
            try:
                with open(config_path, "r") as f:
                    config_data = json.load(f)
            except Exception as e:
                print(f"Error loading {config_path}: {e}")

    output_gguf_name = config_data.get("output_gguf_name", "m0x_m1")
    max_seq_length = int(config_data.get("max_seq_length", 1024))
    model_path = config_data.get("model_path", "./m0x_m1_lora")
    quantization_methods = config_data.get("quantization_methods", ["q4_k_m"])

    print(f"Loading model from {model_path} (context length: {max_seq_length})...")
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=model_path,
        max_seq_length=max_seq_length,
        dtype=None,
        load_in_4bit=True,
    )

    print(f"\nStarting GGUF compilation with {len(quantization_methods)} quantization method(s)...")
    print(f"llama.cpp path redirect: {os.environ['UNSLOTH_LLAMA_CPP_PATH']}")

    for i, quant_method in enumerate(quantization_methods):
        print(f"\n=== [{i+1}/{len(quantization_methods)}] Exporting with {quant_method} ===")
        model.save_pretrained_gguf(
            output_gguf_name,
            tokenizer,
            quantization_method=quant_method,
        )

    print(f"\nSUCCESS: All GGUF exports completed!")


if __name__ == "__main__":
    main()
