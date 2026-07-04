import gc
import threading
from pathlib import Path
from typing import Generator, Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]

class PlaygroundInferenceManager:
    def __init__(self):
        self.model = None
        self.tokenizer = None
        self.model_path = None
        self.status = "idle"  # "idle", "loading", "ready", "error"
        self.error = None
        self.lock = threading.Lock()

    def load_model(self, model_path: str):
        with self.lock:
            if self.status == "loading":
                return
            self.status = "loading"
            self.error = None
            self.model_path = model_path
            
        def _load():
            try:
                # Lazy imports of heavy libraries
                from backend.gemma4_patch import apply_gemma4_patch
                apply_gemma4_patch()

                from  import FastLanguageModel
                import torch

                # Resolve relative path if needed
                candidate = Path(model_path)
                if not candidate.is_absolute():
                    resolved_path = PROJECT_ROOT / candidate
                else:
                    resolved_path = candidate

                has_cuda = torch.cuda.is_available()
                load_in_4bit = True if has_cuda else False
                device_map = "cuda:0" if has_cuda else "cpu"

                print(f"[PLAYGROUND] Loading model from {resolved_path} (4-bit: {load_in_4bit}, device: {device_map})...")
                
                # Load with 
                model, tokenizer = FastLanguageModel.from_pretrained(
                    model_name=str(resolved_path),
                    max_seq_length=2048,
                    dtype=None,
                    load_in_4bit=load_in_4bit,
                    device_map=device_map,
                )
                if has_cuda:
                    FastLanguageModel.for_inference(model)  # Enable 2x faster inference in 
                
                with self.lock:
                    self.model = model
                    self.tokenizer = tokenizer
                    self.status = "ready"
                    print("[PLAYGROUND] Model loaded successfully.")
            except Exception as e:
                print(f"[PLAYGROUND] Error loading model: {e}")
                with self.lock:
                    self.model = None
                    self.tokenizer = None
                    self.status = "error"
                    self.error = str(e)

        threading.Thread(target=_load, daemon=True).start()

    def unload_model(self):
        with self.lock:
            if self.model is not None:
                print("[PLAYGROUND] Unloading model and cleaning VRAM cache...")
                del self.model
                del self.tokenizer
                self.model = None
                self.tokenizer = None
            self.model_path = None
            self.status = "idle"
            self.error = None
            gc.collect()
            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                    print("[PLAYGROUND] VRAM cache cleared.")
            except Exception:
                pass

    def generate_stream(self, prompt: str, temperature: float = 0.7, top_p: float = 0.95, max_tokens: int = 512) -> Generator[str, None, None]:
        from transformers import TextIteratorStreamer

        with self.lock:
            if self.status != "ready" or self.model is None or self.tokenizer is None:
                yield "Error: Model is not loaded or not ready."
                return
            model = self.model
            tokenizer = self.tokenizer

        try:
            # Format dynamically using the model's tokenizer chat template if available, otherwise fallback
            try:
                messages = [{"role": "user", "content": prompt}]
                formatted_prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
            except Exception:
                formatted_prompt = f"<bos><|turn>user\n{prompt}<turn|>\n<|turn>model\n"
            
            inputs = tokenizer([formatted_prompt], return_tensors="pt").to("cuda")
            streamer = TextIteratorStreamer(tokenizer, skip_prompt=True, clean_up_tokenization_spaces=True)
            
            generation_kwargs = dict(
                inputs,
                streamer=streamer,
                max_new_tokens=max_tokens,
                temperature=temperature,
                top_p=top_p,
                do_sample=temperature > 0.0,
            )
            
            # Generate in background thread to stream tokens on the caller thread
            thread = threading.Thread(target=model.generate, kwargs=generation_kwargs, daemon=True)
            thread.start()
            
            for new_text in streamer:
                yield new_text
                
        except Exception as e:
            yield f"\n[PLAYGROUND INFERENCE ERROR] {e}"

# Global Singleton Manager
inference_manager = PlaygroundInferenceManager()
