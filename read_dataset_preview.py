import json
import os
import pandas as pd

def main():
    preview_data = {
        "identity": [],
        "coding": []
    }
    
    # 1. Read first 10 rows of identity JSONL
    jsonl_path = "datasets/identity_dataset.jsonl"
    if os.path.exists(jsonl_path):
        try:
            with open(jsonl_path, "r", encoding="utf-8") as f:
                count = 0
                for line in f:
                    if count >= 10:
                        break
                    line = line.strip()
                    if line:
                        preview_data["identity"].append(json.loads(line))
                        count += 1
        except Exception as e:
            preview_data["identity_error"] = str(e)
            
    # 2. Read first 10 rows of FABLE parquet dataset
    parquet_path = "datasets/train_clean.parquet" if os.path.exists("datasets/train_clean.parquet") else "datasets/train.parquet"
    if os.path.exists(parquet_path):
        try:
            df = pd.read_parquet(parquet_path, engine="pyarrow")
            # Slice first 10 rows
            df_subset = df.head(10)
            for _, row in df_subset.iterrows():
                row_dict = row.to_dict()
                # Parse row_json key if present to show details
                if "row_json" in row_dict:
                    try:
                        row_dict["parsed_row"] = json.loads(row_dict["row_json"])
                    except:
                        pass
                preview_data["coding"].append(row_dict)
        except Exception as e:
            preview_data["coding_error"] = str(e)
            
    # Output raw JSON to stdout
    print(json.dumps(preview_data))

if __name__ == "__main__":
    main()
