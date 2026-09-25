FROM pytorch/pytorch:2.4.0-cuda12.1-cudnn9-runtime

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir \
    runpod \
    pillow \
    torchvision \
    diffusers \
    transformers \
    accelerate \
    sentencepiece \
    protobuf \
    safetensors

COPY rp_handler.flux.py /app/rp_handler.flux.py

CMD ["python", "-u", "/app/rp_handler.flux.py"]
