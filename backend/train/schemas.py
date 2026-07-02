from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


JobStatus = Literal["queued", "running", "completed", "failed", "cancelled"]


class TrainingJobPayload(BaseModel):
    local_model_path: str = Field(default="./base_model")
    identity_dataset_path: str = Field(default="datasets/identity_dataset.jsonl")
    coding_dataset_path: str = Field(default="datasets/train_clean.parquet")
    coding_dataset_paths: list[str] = Field(default_factory=list)
    output_dir: str = Field(default="outputs")
    raw_lora_output_dir: str = Field(default="m0x_m1_lora")
    output_gguf_name: str = Field(default="m0x_m1")
    learning_rate: float = Field(default=2e-4)
    max_steps: int = Field(default=300, ge=1)
    per_device_train_batch_size: int = Field(default=4, ge=1)
    gradient_accumulation_steps: int = Field(default=2, ge=1)
    max_seq_length: int = Field(default=1024, ge=128)
    lora_r: int = Field(default=16, ge=1)
    lora_alpha: int = Field(default=16, ge=1)
    dataset_num_proc: int = Field(default=2, ge=1)
    packing: bool = Field(default=True)
    coding_subset_prefix_size: int = Field(default=80000, ge=1)
    coding_subset_limit: int = Field(default=10000, ge=1)
    gradient_checkpointing: str | bool = Field(default="")
    quantization_method: str = Field(default="q4_k_m")
    use_4bit: bool = Field(default=True)
    rope_scaling: str | None = Field(default=None)
    warmup_steps: int = Field(default=10, ge=0)
    seed: int = Field(default=3407)


class TrainingJobSnapshot(BaseModel):
    job_id: str
    status: JobStatus
    step: int
    total_steps: int
    percent: int
    loss: float | None = None
    learning_rate: float | None = None
    epoch: float | None = None
    logs: list[str] = Field(default_factory=list)
