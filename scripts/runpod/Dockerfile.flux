FROM pytorch/pytorch:2.5.1-cuda12.4-cudnn9-runtime

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    libgl1 \
    libglvnd0 \
    libegl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir \
    runpod \
    pillow \
    "torch==2.5.1" \
    "torchvision==0.20.1" \
    "diffusers==0.40.0" \
    transformers \
    accelerate \
    sentencepiece \
    protobuf \
    safetensors \
    peft \
    "huggingface_hub>=1.23,<2"

RUN python -c "from huggingface_hub import snapshot_download; snapshot_download('black-forest-labs/FLUX.2-klein-4B', local_dir='/app/models/FLUX.2-klein-4B', allow_patterns=['model_index.json', 'scheduler/*', 'text_encoder/*', 'tokenizer/*', 'transformer/*', 'vae/*'])"

COPY rp_handler.flux.py /app/rp_handler.flux.py

CMD ["python", "-u", "/app/rp_handler.flux.py"]
