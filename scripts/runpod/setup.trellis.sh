#!/bin/bash
set -euo pipefail

APP_DIR="/app"
TRELLIS_DIR="$APP_DIR/trellis"
UTILS3D_COMMIT="9a4eb15e4021b67b12c460c7057d642626897ec8"
INSTALL_MARKER="/etc/trellis-install.marker"

if [ ! -f "$INSTALL_MARKER" ]; then
  touch "$INSTALL_MARKER"
  sleep 1
fi

echo "=== 1. System packages ==="
apt-get update
apt-get install -y --no-install-recommends \
    git wget curl ninja-build build-essential \
    libusb-1.0-0 libusb-1.0-0-dev libgl1 libglvnd0 \
    libglvnd-dev libgl1-mesa-dev libegl1 libegl1-mesa-dev \
    libgles2 libgles2-mesa-dev libglib2.0-0 libgomp1 libsm6 libxext6 libxrender1
rm -rf /var/lib/apt/lists/*

echo "=== 2. Pin the base image torch ==="
TORCH_VERSION=$(python -c "import torch; print(torch.__version__.split('+')[0])")
CUDA_TAG=$(python -c "import torch; print('cu' + torch.version.cuda.replace('.', ''))")
pip freeze | grep -E '^(torch|torchvision|torchaudio)==' > /etc/pip-constraints.txt
export PIP_CONSTRAINT=/etc/pip-constraints.txt
echo "torch $TORCH_VERSION / $CUDA_TAG"

echo "=== 3. Python packages ==="
pip install --no-cache-dir --upgrade pip
pip install --no-cache-dir --ignore-installed blinker
pip install --no-cache-dir runpod diffusers
pip install --no-cache-dir kaolin -f "https://nvidia-kaolin.s3.us-east-2.amazonaws.com/torch-${TORCH_VERSION}_${CUDA_TAG}.html"
pip install --no-cache-dir --no-deps xformers==0.0.28.post1 --index-url "https://download.pytorch.org/whl/${CUDA_TAG}"
pip install --no-cache-dir spconv-cu120
pip install --no-cache-dir pillow imageio imageio-ffmpeg tqdm easydict opencv-python-headless scipy ninja \
    rembg onnxruntime-gpu trimesh open3d xatlas pyvista pymeshfix igraph \
    "transformers>=4.44.0,<4.46.0" "numpy<2" "plyfile<1.1" pygltflib
pip install --no-cache-dir "git+https://github.com/EasternJournalist/utils3d.git@${UTILS3D_COMMIT}"

echo "=== 4. Clone and compile TRELLIS ==="
git config --global http.version HTTP/1.1
rm -rf "$TRELLIS_DIR"
mkdir -p "$APP_DIR"
git clone --recurse-submodules https://github.com/microsoft/TRELLIS.git "$TRELLIS_DIR"
cd "$TRELLIS_DIR"
sed -i "1s/^/set -e\n/" setup.sh
sed -i "s/torch.cuda.is_available()/True/g" setup.sh
sed -i "s/pip install \/tmp\/extensions/pip install --no-build-isolation \/tmp\/extensions/g" setup.sh
bash setup.sh --diffoctreerast --nvdiffrast --mipgaussian

echo "=== 5. Verify imports ==="
export PYTHONPATH="$TRELLIS_DIR"
python -c "import torch, xformers, kaolin, open3d; from trellis.pipelines import TrellisImageTo3DPipeline; from trellis.utils import postprocessing_utils; from trellis.utils.render_utils import render_multiview; print('[VERIFIED] torch', torch.__version__, 'xformers', xformers.__version__, 'kaolin', kaolin.__version__)"
