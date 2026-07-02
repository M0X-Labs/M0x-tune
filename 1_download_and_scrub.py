import os
import json
import sys
from huggingface_hub import snapshot_download

# ==========================================
# CONFIGURATION
# ==========================================
model_id = "google/gemma-4-12B"
local_dir = "./base_model"

custom_model_name = "m0x m1"
custom_creator = "m0x" # Your creator/brand name

# Replace 'hf_xxxx' with your actual write/read token from huggingface.co/settings/tokens
HF_TOKEN = os.getenv("HF_TOKEN", "") 

# ==========================================
# PROGRESS STATUS CHECK
# ==========================================
print("-" * 50)
print("Checking for existing files and tracking progress...")
print("-" * 50)

if os.path.exists(local_dir):
    total_size = 0
    file_count = 0
    for root, dirs, files in os.walk(local_dir):
        for file in files:
            file_count += 1
            total_size += os.path.getsize(os.path.join(root, file))
    
    size_gb = total_size / (1024 ** 3)
    if size_gb > 0:
        print(f"-> Detected partial/completed download history.")
        print(f"-> Local files found: {file_count}")
        print(f"-> Current local data size: {size_gb:.2f} GB (~23.90 GB expected total).")
        print("-> The script will automatically scan and RESUME missing chunks.")
    else:
        print("-> Directory exists but no data downloaded yet.")
else:
    print("-> No previous download detected. Starting fresh snapshot pipeline.")

print("-" * 50)
print("Press Ctrl+C at any time to PAUSE the download safely.")
print("-" * 50)

# ==========================================
# EXECUTE RESUMABLE DOWNLOAD
# ==========================================
try:
    downloaded_path = snapshot_download(
        repo_id=model_id,
        local_dir=local_dir,
        token=HF_TOKEN,
        ignore_patterns=["*.msgpack", "*.h5"],
        max_workers=4
    )
except KeyboardInterrupt:
    print("\n" + "!" * 50)
    print("DOWNLOAD PAUSED: You manually interrupted the process.")
    print("Your progress has been preserved securely on your drive.")
    print("To resume, simply run this exact python script again.")
    print("!" * 50)
    sys.exit(0)
except Exception as e:
    print(f"\nAn error occurred during download: {e}")
    print("You can rerun this script to attempt a retry and resume.")
    sys.exit(1)

# ==========================================
# SCRUB THE IDENTITY (Runs only at 100% completion)
# ==========================================
config_path = os.path.join(local_dir, "config.json")
tokenizer_config_path = os.path.join(local_dir, "tokenizer_config.json")

print("\nDownload complete! Beginning identity scrubbing...")

# Update config.json
if os.path.exists(config_path):
    with open(config_path, "r", encoding="utf-8") as f:
        config_data = json.load(f)
    
    if "_name_or_path" in config_data:
        config_data["_name_or_path"] = custom_model_name
    
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(config_data, f, indent=2)
    print("-> config.json updated successfully.")

# Update tokenizer_config.json 
if os.path.exists(tokenizer_config_path):
    with open(tokenizer_config_path, "r", encoding="utf-8") as f:
        tokenizer_data = f.read()
    
    # Clean standard identity loops
    tokenizer_data = tokenizer_data.replace("Gemma", custom_model_name)
    tokenizer_data = tokenizer_data.replace("Google", custom_creator)
    
    with open(tokenizer_config_path, "w", encoding="utf-8") as f:
        f.write(tokenizer_data)
    print("-> tokenizer_config.json updated successfully.")

print(f"\nSuccess! Model fully downloaded and renamed to {custom_model_name}. Run your training script next.")