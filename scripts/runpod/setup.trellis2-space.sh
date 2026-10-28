#!/bin/bash
# Installs TRELLIS.2 exactly as the official Hugging Face Space runs it (requirements.txt of
# huggingface.co/spaces/microsoft/TRELLIS.2): Python 3.12, torch 2.11 + CUDA 13.0, flash-attn 2.8.3,
# the Space's own trellis2 code. The Space ships its CUDA extensions prebuilt for its GPU; any of
# them without RTX 4090 (sm_89) kernels is rebuilt from the same sources for sm_89.
# Base pod image: runpod/pytorch:1.4.2-rc.184-cu1300-torch291-ubuntu2404 (CUDA 13.0 toolkit).
set -euo pipefail

APP_DIR="/app"
SPACE_DIR="$APP_DIR/space"
VENV_DIR="$APP_DIR/venv"
WEIGHTS_DIR="$APP_DIR/hf"
INSTALL_MARKER="/etc/trellis2-install.marker"
SPACE_REPO="https://huggingface.co/spaces/microsoft/TRELLIS.2"
TARGET_ARCH="8.9"
EXT_DIR="/root/extensions"

if [ ! -f "$INSTALL_MARKER" ]; then
  touch "$INSTALL_MARKER"
  sleep 1
fi

echo "=== 1. System packages ==="
apt-get update
apt-get install -y --no-install-recommends git git-lfs ninja-build build-essential python3.12-venv python3.12-dev \
    libgl1 libegl1 libgles2 libglvnd-dev libglib2.0-0 libgomp1
rm -rf /var/lib/apt/lists/*

echo "=== 2. Space code and its exact requirements ==="
mkdir -p "$APP_DIR"
rm -rf "$SPACE_DIR"
GIT_LFS_SKIP_SMUDGE=0 git clone "$SPACE_REPO" "$SPACE_DIR"
python3.12 -m venv "$VENV_DIR"
. "$VENV_DIR/bin/activate"
pip install --no-cache-dir --upgrade pip wheel setuptools
pip install --no-cache-dir -r "$SPACE_DIR/requirements.txt"
pip install --no-cache-dir runpod

echo "=== 3. Rebuild every Space extension that has no kernels the RTX 4090 can run ==="
export TORCH_CUDA_ARCH_LIST="$TARGET_ARCH"
# The pod is capped at 50 GB of RAM: more parallel nvcc jobs get killed for memory.
export MAX_JOBS="${MAX_JOBS:-8}"
mkdir -p "$EXT_DIR"
# Probes the compiled module itself (flash_attn and nvdiffrast keep it outside their package folder).
# sm_80 and sm_86 binaries also run on sm_89 (same major version); sm_90+ ones do not.
runs_on_4090() {
  local library kernels
  library=$(python -c "import importlib.util;print(importlib.util.find_spec('$1').origin)")
  # Listed into a variable first: piping into grep -q breaks cuobjdump's pipe and fails under pipefail.
  kernels=$(cuobjdump --list-elf "$library" 2>/dev/null || true)
  grep -qE "sm_8[069]\b" <<< "$kernels"
}
rebuild() {
  local compiled_module="$1" url="$2" branch="$3" subdir="$4"
  if runs_on_4090 "$compiled_module"; then echo "[OK] $compiled_module has kernels the RTX 4090 can run"; return; fi
  echo "[BUILD] $compiled_module for sm_$TARGET_ARCH"
  rm -rf "$EXT_DIR/$compiled_module"
  git clone --recursive ${branch:+-b "$branch"} "$url" "$EXT_DIR/$compiled_module"
  pip install --no-cache-dir --force-reinstall --no-deps --no-build-isolation "$EXT_DIR/$compiled_module/$subdir"
  runs_on_4090 "$compiled_module" || { echo "[FAIL] $compiled_module still has no RTX 4090 kernels"; exit 1; }
}
rebuild flash_attn_2_cuda https://github.com/Dao-AILab/flash-attention.git v2.8.3 .
rebuild flex_gemm.kernels.cuda https://github.com/JeffreyXiang/FlexGEMM.git "" .
rebuild cumesh._C https://github.com/JeffreyXiang/CuMesh.git "" .
rebuild _nvdiffrast_c https://github.com/NVlabs/nvdiffrast.git v0.4.0 .
rebuild nvdiffrec_render.renderutils._C https://github.com/JeffreyXiang/nvdiffrec.git renderutils .
rebuild o_voxel._C https://github.com/microsoft/TRELLIS.2.git "" o-voxel

echo "=== 4. Weights into the image (HF_TOKEN needed for the gated image encoder) ==="
export HF_HOME="$WEIGHTS_DIR"
export PYTHONPATH="$SPACE_DIR"
python - <<'PYTHON'
from trellis2.pipelines import Trellis2ImageTo3DPipeline

Trellis2ImageTo3DPipeline.from_pretrained("microsoft/TRELLIS.2-4B")
print("[VERIFIED] weights cached")
PYTHON

echo "=== 5. Versions ==="
python -c "import sys,torch,flash_attn;print('[VERIFIED] python',sys.version.split()[0],'torch',torch.__version__,'cuda',torch.version.cuda,'flash_attn',flash_attn.__version__)"
