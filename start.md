Step 2: Build a Python 3.11 Environment
uv is amazing—you can tell it exactly what version of Python to use, and it will automatically download it for you. Run this to create a fresh Python 3.11 environment:

PowerShell
uv venv --python 3.11
Step 3: Activate the New Environment
PowerShell
.\.venv\Scripts\activate
Step 4: Install the Perfect PyTorch Match
Now that you are on Python 3.11 and using a Blackwell GPU (RTX 50-series), install the CUDA 13.0 compatible version of PyTorch to enable `sm_120` support:

PowerShell
uv pip install torch torchvision torchaudio xformers --index-url https://download.pytorch.org/whl/cu130 --upgrade

Step 5: Install Your Requirements
Since there is a requirements.txt file in your workspace, you can install the rest of your tools (like , datasets, trl, etc.) right back into this clean environment:

PowerShell
uv pip install -r requirements.txt