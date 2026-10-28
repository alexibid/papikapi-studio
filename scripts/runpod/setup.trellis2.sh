#!/bin/bash
set -euo pipefail

APP_DIR="/app"
TRELLIS_DIR="$APP_DIR/trellis2"
WEIGHTS_DIR="$APP_DIR/hf"
TORCH_VERSION="2.6.0"
TORCHVISION_VERSION="0.21.0"
CUDA_INDEX="https://download.pytorch.org/whl/cu124"
VENV_DIR="$APP_DIR/venv"
INSTALL_MARKER="/etc/trellis2-install.marker"

if [ ! -f "$INSTALL_MARKER" ]; then
  touch "$INSTALL_MARKER"
  sleep 1
fi

echo "=== 1. System packages ==="
apt-get update
apt-get install -y --no-install-recommends \
    git wget curl ninja-build build-essential libjpeg-dev zlib1g-dev libpng-dev libfreetype6-dev libtiff-dev \
    libgl1 libglvnd0 libglvnd-dev libegl1 libgles2 libglib2.0-0 libgomp1 libsm6 libxext6 libxrender1
rm -rf /var/lib/apt/lists/*
if ! command -v sudo >/dev/null; then
  printf '#!/bin/sh\nexec "$@"\n' > /usr/local/bin/sudo
  chmod +x /usr/local/bin/sudo
fi

echo "=== 2. Isolated environment with PyTorch ${TORCH_VERSION} (CUDA 12.4) ==="
mkdir -p "$APP_DIR"
python -m venv "$VENV_DIR"
. "$VENV_DIR/bin/activate"
pip install --no-cache-dir --upgrade pip wheel setuptools
pip install --no-cache-dir "torch==${TORCH_VERSION}" "torchvision==${TORCHVISION_VERSION}" --index-url "$CUDA_INDEX"
pip install --no-cache-dir runpod

echo "=== 3. Clone TRELLIS.2 and compile its extensions ==="
git config --global http.version HTTP/1.1
rm -rf "$TRELLIS_DIR"
git clone -b main --recursive https://github.com/microsoft/TRELLIS.2.git "$TRELLIS_DIR"
cd "$TRELLIS_DIR"
sed -i "s/pip install flash-attn==2.7.3/pip install flash-attn==2.7.3 --no-build-isolation/" setup.sh
sed -i "s/^\(\s*\)pipeline.rembg_model = getattr.*/\1pipeline.rembg_model = None/" trellis2/pipelines/trellis2_image_to_3d.py
. ./setup.sh --basic --flash-attn --nvdiffrast --nvdiffrec --cumesh --o-voxel --flexgemm

pip install --no-cache-dir "transformers>=4.56,<5" "huggingface_hub<1.0"

echo "=== 4. Download the weights into the image (HF_TOKEN required for gated components) ==="
export HF_HOME="$WEIGHTS_DIR"
export PYTHONPATH="$TRELLIS_DIR"
python - <<'PYTHON'
from trellis2.pipelines import Trellis2ImageTo3DPipeline

Trellis2ImageTo3DPipeline.from_pretrained("microsoft/TRELLIS.2-4B")
print("[VERIFIED] weights cached")
PYTHON

echo "=== 5. Verify imports ==="
python -c "import torch, o_voxel; from trellis2.pipelines import Trellis2ImageTo3DPipeline; print('[VERIFIED] torch', torch.__version__, 'cuda', torch.version.cuda)"
