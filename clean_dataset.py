import pandas as pd
import re

print("Loading contaminated dataset...")
# Load the dataset
df = pd.read_parquet("datasets/train.parquet")

# Regex function to strip out the tags and everything inside them
def clean_system_tags(text):
    if isinstance(text, str):
        # Removes <local-command-caveat> and anything between it
        return re.sub(r'<local-command-caveat>.*?</local-command-caveat>\s*', '', text, flags=re.DOTALL)
    return text

print("Scrubbing data...")
# Apply the cleaner to all text columns
for column in df.columns:
    if df[column].dtype == object or df[column].dtype.name == 'string':
        df[column] = df[column].apply(clean_system_tags)

# Save the pristine dataset
output_name = "datasets/train_clean.parquet"
df.to_parquet(output_name)
print(f"Success! Cleaned dataset saved as '{output_name}'.")
