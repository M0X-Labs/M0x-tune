from __future__ import annotations

import sys
from typing import Any


def apply_gemma4_patch() -> None:
    """Dynamically registers gemma4_unified model types and monkey-patches AutoConfig

    to resolve model load issues when loading local checkpoints with unrecognized
    gemma4_unified architectures.
    """
    try:
        from transformers import AutoConfig
        from transformers.models.gemma4.configuration_gemma4 import (
            Gemma4Config,
            Gemma4AudioConfig,
            Gemma4TextConfig,
            Gemma4VisionConfig,
        )

        # 1. Subclass the configurations to match custom model_type strings
        class Gemma4UnifiedConfig(Gemma4Config):
            model_type = "gemma4_unified"

        class Gemma4UnifiedAudioConfig(Gemma4AudioConfig):
            model_type = "gemma4_unified_audio"

        class Gemma4UnifiedTextConfig(Gemma4TextConfig):
            model_type = "gemma4_unified_text"

        class Gemma4UnifiedVisionConfig(Gemma4VisionConfig):
            model_type = "gemma4_unified_vision"

        # 2. Register configs inside AutoConfig
        AutoConfig.register("gemma4_unified", Gemma4UnifiedConfig)
        AutoConfig.register("gemma4_unified_audio", Gemma4UnifiedAudioConfig)
        AutoConfig.register("gemma4_unified_text", Gemma4UnifiedTextConfig)
        AutoConfig.register("gemma4_unified_vision", Gemma4UnifiedVisionConfig)

        # 3. Monkey-patch AutoConfig.from_pretrained to dynamically map config instances
        original_from_pretrained = AutoConfig.from_pretrained

        def patched_from_pretrained(pretrained_model_name_or_path: str, *args: Any, **kwargs: Any) -> Any:
            config = original_from_pretrained(pretrained_model_name_or_path, *args, **kwargs)
            if getattr(config, "model_type", None) == "gemma4_unified":
                config.model_type = "gemma4"
                config.architectures = ["Gemma4ForConditionalGeneration"]
                # Dynamically reassign class to standard Gemma4Config
                config.__class__ = Gemma4Config
            return config

        AutoConfig.from_pretrained = patched_from_pretrained
        print("[PATCH] Gemma4Unified configuration mapping patch applied successfully.")
    except Exception as e:
        print(f"[PATCH] Failed to apply Gemma4Unified configuration mapping patch: {e}")

