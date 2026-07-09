from __future__ import annotations

import pyarrow  # Must be imported before torch to prevent Windows DLL conflicts/segfaults
import unsloth  # Must be imported before trl, transformers, peft to ensure optimizations are applied!
import gc
import json
import os
import shutil
from pathlib import Path
import sys
from typing import Any

from backend.train.schemas import TrainingJobPayload


PROJECT_ROOT = Path(__file__).resolve().parents[2]


def ensure_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def resolve_path(value: str) -> Path:
    candidate = Path(value)
    if candidate.is_absolute():
        return candidate
    return PROJECT_ROOT / candidate


def prepare_runtime_environment() -> None:
    temp_dir = PROJECT_ROOT / ".tmp"
    pip_cache_dir = PROJECT_ROOT / ".pip_cache"
    uv_cache_dir = PROJECT_ROOT / ".uv_cache"
    hf_home_dir = PROJECT_ROOT / ".hf_home"
    hf_hub_dir = hf_home_dir / "hub"

    for path in (temp_dir, pip_cache_dir, uv_cache_dir, hf_home_dir, hf_hub_dir):
        ensure_directory(path)

    os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
    os.environ["_COMPILE_DISABLE"] = "1"
    os.environ["_LLAMA_CPP_PATH"] = str(PROJECT_ROOT / "." / "llama.cpp")
    os.environ["UV_CACHE_DIR"] = str(uv_cache_dir)
    os.environ["PIP_CACHE_DIR"] = str(pip_cache_dir)
    os.environ["TEMP"] = str(temp_dir)
    os.environ["TMP"] = str(temp_dir)
    os.environ["HF_HOME"] = str(hf_home_dir)
    os.environ["HUGGINGFACE_HUB_CACHE"] = str(hf_hub_dir)


def apply_gguf_patch(_save: Any, processor_config_path: Path) -> None:
    original_save_to_gguf = _save.save_to_gguf

    def patched_save_to_gguf(*args: Any, **kwargs: Any) -> Any:
        model_directory = kwargs.get("model_directory")
        if not model_directory and len(args) >= 5:
            model_directory = args[4]

        if model_directory:
            print(f"\n[PATCH] Copying processor_config.json to {model_directory} before GGUF conversion...")
            dest_path = Path(model_directory) / "processor_config.json"
            try:
                shutil.copy(processor_config_path, dest_path)
                print(f"[PATCH] Successfully copied processor_config.json to {dest_path}")
            except Exception as exc:
                print(f"[PATCH] Error copying processor_config.json: {exc}")

        return original_save_to_gguf(*args, **kwargs)

    _save.save_to_gguf = patched_save_to_gguf


def filter_reasoning_rows(example: dict[str, Any]) -> bool:
    # 1. If it has instruction/context and cot, check them
    context_key = "context" if "context" in example else "instruction" if "instruction" in example else None
    if context_key and "cot" in example:
        return example.get(context_key) is not None and example.get("cot") is not None
        
    # 2. Otherwise try parsing row_json
    if "row_json" in example:
        try:
            row = json.loads(example["row_json"])
            return row.get("cot") is not None and row.get("context") is not None
        except Exception:
            return False
            
    # 3. Fallback: if it's already a standard instruction/output structure (without cot), we want to allow it!
    if "instruction" in example and "output" in example:
        return example.get("instruction") is not None and example.get("output") is not None
        
    return False



def map_identity_columns(example: dict[str, Any]) -> dict[str, str]:
    return {
        "instruction": example["instruction"],
        "output": f"<|channel>thought\n<channel|>\n{example['output']}",
    }


def format_custom_argument(arg: Any) -> str:
    if isinstance(arg, bool):
        return "true" if arg else "false"
    if isinstance(arg, str):
        return f'<|"|>{arg}<|"|>'
    if isinstance(arg, (int, float)):
        return str(arg)
    if isinstance(arg, dict):
        parts = []
        for key in sorted(arg.keys()):
            parts.append(f'<|"|>{key}<|"|>:{format_custom_argument(arg[key])}')
        return "{" + ",".join(parts) + "}"
    if isinstance(arg, list):
        return "[" + ",".join(format_custom_argument(item) for item in arg) + "]"
    return str(arg)


def format_custom_arguments(args_dict: Any) -> str:
    if not isinstance(args_dict, dict):
        return str(args_dict)

    parts = []
    for key in sorted(args_dict.keys()):
        parts.append(f"{key}:{format_custom_argument(args_dict[key])}")
    return "{" + ",".join(parts) + "}"


def map_coding_columns(example: dict[str, Any]) -> dict[str, str]:
    if "row_json" in example:
        row = json.loads(example["row_json"])
        cot = row.get("cot")
        context = row.get("context")
        output_type = row.get("output_type")
        output = row.get("output")

        if output_type == "tool_use":
            tool_name = output.get("tool", "") if isinstance(output, dict) else ""
            tool_input = output.get("input", {}) if isinstance(output, dict) else {}
            model_response = f"<|tool_call>call:{tool_name}{format_custom_arguments(tool_input)}<tool_call|>"
        else:
            model_response = output.get("text", "") if isinstance(output, dict) else str(output)
    else:
        cot = example.get("cot")
        context = example.get("context") or example.get("instruction")
        model_response = str(example.get("output") or example.get("output_text") or "")

    final_output = f"<|channel>thought\n{cot}\n<channel|>\n{model_response}"
    return {
        "instruction": context,
        "output": final_output,
    }


def formatting_prompts_func(examples: dict[str, list[str]]) -> dict[str, list[str]]:
    texts: list[str] = []
    for instruction, output in zip(examples["instruction"], examples["output"]):
        texts.append(f"<bos><|turn>user\n{instruction}<turn|>\n<|turn>model\n{output}<turn|>")
    return {"text": texts}


def diagnose_training_failure(exc: Exception) -> str:
    """Best-effort classification of a training-pipeline failure into an actionable
    message. Mirrors the REASON & RESOLUTION pattern already used below for GGUF-export
    failures, applied instead to the model-load -> LoRA-setup -> dataset-prep ->
    trainer.train() portion of the pipeline, which previously had no error boundary at
    all and surfaced as a raw, often confusing traceback with no diagnosis.
    """
    message = str(exc).lower()
    exc_type = type(exc).__name__
    lines = ["\nREASON & RESOLUTION:"]

    if "out of memory" in message or exc_type in {"OutOfMemoryError", "CUDAOutOfMemoryError"}:
        lines.append("This looks like a CUDA out-of-memory error.")
        lines.append("TO FIX THIS, try one or more of the following:")
        lines.append("  - Lower 'max_seq_length' in your training config.")
        lines.append("  - Lower 'per_device_train_batch_size' and/or raise 'gradient_accumulation_steps'")
        lines.append("    to compensate.")
        lines.append("  - Enable 'use_4bit' quantization if it isn't already enabled.")
        lines.append("  - Close other GPU-using processes/notebooks before starting training.")
    elif "gated repo" in message or "401" in message or "access to model" in message or "repositorynotfound" in exc_type.lower():
        lines.append("This looks like a Hugging Face access/authentication error.")
        lines.append("TO FIX THIS:")
        lines.append("  - If the base model is gated, accept its license on huggingface.co and set an HF")
        lines.append("    token (huggingface-cli login, or the HF_TOKEN env var) before training.")
        lines.append("  - Double check 'local_model_path' points at a valid, fully-downloaded model directory.")
    elif isinstance(exc, FileNotFoundError) or "no such file" in message or "does not exist" in message:
        lines.append("A required file or directory could not be found.")
        lines.append("TO FIX THIS:")
        lines.append("  - Verify 'local_model_path', 'identity_dataset_path', and 'coding_dataset_path' in")
        lines.append("    your training config all point at paths that actually exist.")
    elif "flex_attention" in message or "torch.compile" in message or "compileerror" in exc_type.lower() or "triton" in message:
        lines.append("This looks like a torch.compile/Triton compiler issue (common on Windows without a")
        lines.append("full MSVC toolchain, or on unsupported GPU architectures).")
        lines.append("TO FIX THIS:")
        lines.append("  - Confirm _COMPILE_DISABLE=1 is set (it is, by default, in this project).")
        lines.append("  - Re-run setup.sh/setup.bat to reinstall a matched torch/unsloth/trl/transformers combo.")
        lines.append("  - Delete the 'unsloth_compiled_cache/' directory and retry (forces a clean recompile).")
    elif "dtype" in message or "attn_implementation" in message or "attention" in message:
        lines.append("This looks like a dtype or attention-implementation mismatch, often caused by an")
        lines.append("incompatible combination of torch/transformers/unsloth versions.")
        lines.append("TO FIX THIS:")
        lines.append("  - Re-run setup.sh/setup.bat (it now pins a tested-compatible version combination).")
        lines.append("  - Delete '.venv' and reinstall from scratch if the issue persists after re-running setup.")
    else:
        lines.append("No specific known cause matched this error automatically.")
        lines.append("TO FIX THIS:")
        lines.append("  - Re-run setup.sh/setup.bat to confirm your ML dependency versions are the pinned,")
        lines.append("    tested-compatible combination (this fixes most 'different error on every device'")
        lines.append("    crashes).")
        lines.append("  - Check that your dataset files match the expected instruction/output/cot schema.")
        lines.append(f"  - Exception type: {exc_type}")

    return "\n".join(lines)


def run_training_job(config: TrainingJobPayload) -> None:
    prepare_runtime_environment()

    try:
        _run_training_pipeline(config)
    except Exception as exc:
        print("\n" + "!" * 60)
        print("TRAINING FAILED.")
        print(f"Error ({type(exc).__name__}): {exc}")
        print(diagnose_training_failure(exc))
        print("!" * 60 + "\n")
        raise


def _run_training_pipeline(config: TrainingJobPayload) -> None:
    from backend.gemma4_patch import apply_gemma4_patch
    apply_gemma4_patch()

    import torch
    # Clean up GPU memory and run garbage collection before starting
    import gc
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    from datasets import concatenate_datasets, load_dataset
    from trl import SFTConfig, SFTTrainer
    from unsloth import FastLanguageModel
    from unsloth import save as unsloth_save

    base_model_path = resolve_path(config.local_model_path)
    
    if not base_model_path.exists():
        raise FileNotFoundError(f"Base model path '{base_model_path}' does not exist.")
        
    # Auto-resolve model directory if the user pointed to a parent directory
    if base_model_path.is_dir() and not (base_model_path / "config.json").exists():
        model_subdirs = [d for d in base_model_path.iterdir() if d.is_dir() and (d / "config.json").exists()]
        if len(model_subdirs) == 1:
            print(f"Auto-resolved base model path to subdirectory: {model_subdirs[0]}")
            base_model_path = model_subdirs[0]
        else:
            nested_model_dirs = []
            for sub in base_model_path.iterdir():
                if sub.is_dir():
                    nested_model_dirs.extend([d for d in sub.iterdir() if d.is_dir() and (d / "config.json").exists()])
            if len(nested_model_dirs) == 1:
                print(f"Auto-resolved base model path to nested subdirectory: {nested_model_dirs[0]}")
                base_model_path = nested_model_dirs[0]

    identity_dataset_path = resolve_path(config.identity_dataset_path)
    coding_dataset_path = resolve_path(config.coding_dataset_path)
    raw_lora_output_dir = resolve_path(config.raw_lora_output_dir)
    output_gguf_name = resolve_path(config.output_gguf_name)

    processor_config_path = base_model_path / "processor_config.json"
    apply_gguf_patch(unsloth_save, processor_config_path)

    print("Loading training configuration from API payload...")
    print(f"Base model path: {base_model_path}")
    print(f"Identity dataset path: {identity_dataset_path}")
    print(f"Coding dataset path: {coding_dataset_path}")
    print(f"Loading identity-scrubbed model with {config.max_seq_length} context...")
    print(
        f"  4-bit quantization: {config.use_4bit} | RoPE scaling: {config.rope_scaling or 'none'} | "
        f"Gradient checkpointing: {config.gradient_checkpointing}"
    )

    # Avoid dispatching parts of 4-bit model to CPU/disk which fails in bitsandbytes.
    # Force single GPU to load the model fully on CUDA ( only supports single GPU training).
    if torch.cuda.is_available():
        device_map = "cuda:0"
        load_in_4bit = config.use_4bit
    else:
        device_map = "cpu"
        load_in_4bit = False

    # Unsloth's use_gradient_checkpointing="unsloth" (the default, see schemas.py) enables
    # its custom CUDA-only offloaded-checkpointing kernel and will throw on a CPU-only
    # device (e.g. a GPU-less machine, or a misdetected/no-GPU Kaggle CPU session). Fall
    # back to plain HF-style gradient checkpointing (True) in that case instead of
    # crashing before training even starts.
    gradient_checkpointing = config.gradient_checkpointing
    if device_map == "cpu" and gradient_checkpointing == "":
        print(
            'No CUDA device detected: falling back gradient_checkpointing from "unsloth" '
            "(CUDA-only) to standard 'True' for CPU training."
        )
        gradient_checkpointing = True

    from_pretrained_kwargs: dict[str, Any] = {
        "model_name": str(base_model_path),
        "max_seq_length": config.max_seq_length,
        "dtype": None,
        "load_in_4bit": load_in_4bit,
        "trust_remote_code": True,
        "device_map": device_map,
        "attn_implementation": "sdpa",  # Force SDPA to avoid flex_attention's torch.compile dependencies on Windows
    }
    if config.rope_scaling and torch.cuda.is_available():
        from_pretrained_kwargs["rope_scaling"] = config.rope_scaling

    model, tokenizer = FastLanguageModel.from_pretrained(**from_pretrained_kwargs)

    # Dynamic prompts formatting using the model tokenizer's chat template
    def formatting_prompts_func(examples: dict[str, list[str]]) -> dict[str, list[str]]:
        texts: list[str] = []
        for instruction, output in zip(examples["instruction"], examples["output"]):
            try:
                messages = [
                    {"role": "user", "content": instruction},
                    {"role": "assistant", "content": output}
                ]
                text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=False)
            except Exception:
                text = f"<bos><|turn>user\n{instruction}<turn|>\n<|turn>model\n{output}<turn|>"
            texts.append(text)
        return {"text": texts}

    print(f"Configuring Low-Rank Adaptation (LoRA) Layers [R={config.lora_r}, Alpha={config.lora_alpha}]...")
    model = FastLanguageModel.get_peft_model(
        model,
        r=config.lora_r,
        target_modules=None,  # Dynamic LoRA target detection for any model family
        lora_alpha=config.lora_alpha,
        lora_dropout=0,
        bias="none",
        use_gradient_checkpointing=gradient_checkpointing,
        random_state=config.seed,
    )

    # Configure model for training (disables use_cache, sets gradient checkpointing flags, etc.)
    # Note: SFTTrainer does not call this automatically when running custom SFTTrainer pipelines.
    FastLanguageModel.for_training(model, use_gradient_checkpointing=gradient_checkpointing)

    print("Loading local identity tracking dataset...")
    identity_loader = "json" if identity_dataset_path.suffix.lower() in {".json", ".jsonl"} else identity_dataset_path.suffix.lower().lstrip(".")
    identity_data = load_dataset(identity_loader, data_files={"train": str(identity_dataset_path)}, split="train")

    # Resolve coding dataset paths (support single or multiple)
    dataset_paths = []
    if hasattr(config, "coding_dataset_paths") and config.coding_dataset_paths:
        dataset_paths = [resolve_path(p) for p in config.coding_dataset_paths]
    else:
        dataset_paths = [coding_dataset_path]

    coding_subsets = []
    for path in dataset_paths:
        print(f"Loading training dataset from: {path}...")
        loader = "json" if path.suffix.lower() in {".json", ".jsonl"} else path.suffix.lower().lstrip(".")
        coding_data = load_dataset(loader, data_files={"train": str(path)}, split="train")

        print(f"Selecting prefix chunk for fast filtering for {path.name}...")
        prefix_size = min(config.coding_subset_prefix_size, len(coding_data))
        coding_subset = coding_data.select(range(prefix_size))

        print("Filtering reasoning trace rows from prefix...")
        coding_subset = coding_subset.filter(filter_reasoning_rows)

        num_examples = min(config.coding_subset_limit, len(coding_subset))
        print(f"Slicing data down to {num_examples} rows...")
        coding_subset = coding_subset.select(range(num_examples))

        print("Mapping coding dataset columns...")
        coding_subset = coding_subset.map(map_coding_columns, remove_columns=coding_data.column_names)
        coding_subsets.append(coding_subset)

    # Concatenate all training coding datasets
    if len(coding_subsets) > 1:
        print(f"Concatenating {len(coding_subsets)} training datasets...")
        combined_coding = concatenate_datasets(coding_subsets)
    else:
        combined_coding = coding_subsets[0]

    print("Mapping identity dataset columns...")
    identity_mapped = identity_data.map(map_identity_columns, remove_columns=identity_data.column_names)

    dataset = concatenate_datasets([identity_mapped, combined_coding])
    dataset = dataset.map(formatting_prompts_func, batched=True)

    # NOTE: modern trl (>=0.12ish, which our unpinned `trl` dependency will resolve to)
    # removed the old pattern of passing `tokenizer=`, `dataset_text_field=`,
    # `max_seq_length=`, `dataset_num_proc=`, and `packing=` directly as SFTTrainer(...)
    # constructor kwargs alongside a plain TrainingArguments. They now live on SFTConfig
    # (a TrainingArguments subclass), and the tokenizer/processor kwarg was renamed to
    # `processing_class`. This mirrors Unsloth's own reference training script
    # (-cli.py) exactly, and avoids a hard TypeError at trainer construction.
    has_bf16 = False
    if torch.cuda.is_available():
        try:
            has_bf16 = torch.cuda.is_bf16_supported()
        except Exception:
            pass

    # Multiprocess dataset mapping on Windows is extremely fragile due to dill/pickle serialization errors.
    # We force single-process mapping (dataset_num_proc=None) on Windows.
    dataset_num_proc = None if sys.platform == "win32" else config.dataset_num_proc

    trainer = SFTTrainer(
        model=model,
        processing_class=tokenizer,
        train_dataset=dataset,
        args=SFTConfig(
            per_device_train_batch_size=config.per_device_train_batch_size,
            gradient_accumulation_steps=config.gradient_accumulation_steps,
            gradient_checkpointing=False,  # Let Unsloth's model-level gradient checkpointing manage this
            warmup_steps=config.warmup_steps,
            max_steps=config.max_steps,
            learning_rate=config.learning_rate,
            fp16=not has_bf16,
            bf16=has_bf16,
            logging_steps=10,
            optim="paged_adamw_8bit",
            weight_decay=0.01,
            lr_scheduler_type="linear",
            seed=config.seed,
            output_dir=config.output_dir,
            save_strategy="no",
            dataset_text_field="text",
            max_length=config.max_seq_length,
            dataset_num_proc=dataset_num_proc,
            packing=config.packing,
        ),
    )

    print("\n" + "=" * 60)
    print("LAUNCHING TRAINING PIPELINE: EMBEDDING IDENTITY AND REASONING TRACES")
    print("=" * 60 + "\n")

    trainer.train()

    del trainer
    gc.collect()
    torch.cuda.empty_cache()

    print("\n" + "=" * 60)
    print("TRAINING SUCCESSFUL! SAVING MODEL MATRICES")
    print("=" * 60 + "\n")

    print(f"Saving raw LoRA checkpoint folder for future stacking ('{raw_lora_output_dir.name}')...")
    model.save_pretrained(str(raw_lora_output_dir))
    tokenizer.save_pretrained(str(raw_lora_output_dir))

    print("Converting weights to 4-bit GGUF using Ryzen 9 CPU and DDR5 RAM...")
    try:
        model.save_pretrained_gguf(
            str(output_gguf_name),
            tokenizer,
            quantization_method=config.quantization_method,
        )
        print("\nPipeline successfully completed!")
        print(f"-> Local state saved in: {raw_lora_output_dir}")
        print(f"-> Playable file ready at: {output_gguf_name}.gguf")
    except Exception as exc:
        print("\n" + "!" * 60)
        print("WARNING: GGUF conversion failed during merging/saving.")
        print(f"Error: {exc}")
        print("\nREASON & RESOLUTION:")
        print("This is usually caused by running out of virtual memory (Windows 'os error 1455').")
        print("Merging a 12B parameter model requires ~24 GB of RAM/virtual memory.")
        print("Your C: drive has limited free space, preventing the Windows pagefile (pagefile.sys) from growing.")
        print("\nTO FIX THIS:")
        print("1. Free up space on your C: drive (at least 25 GB free).")
        print("   OR")
        print("2. Move/expand your Windows Paging File to your D: drive (which has 65+ GB free):")
        print("   - Open Start Menu, search 'Advanced System Settings'.")
        print("   - Click Settings under 'Performance' -> Advanced tab -> Virtual memory [Change].")
        print("   - Uncheck 'Automatically manage paging file size for all drives'.")
        print("   - Select D: drive, choose 'System managed size' or set 'Custom size' (e.g. 32768 MB).")
        print("   - Click 'Set' then 'OK' and restart your PC.")
        print(f"\nNOTE: Your training was SUCCESSFUL and raw weights are saved in: {raw_lora_output_dir}")
        print("!" * 60 + "\n")
