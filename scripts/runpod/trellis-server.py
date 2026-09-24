import io
import os
import tempfile
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, UploadFile, Query, HTTPException
from fastapi.responses import FileResponse
from PIL import Image
import torch

os.environ['SPCONV_ALGO'] = 'native'
os.environ['ATTN_BACKEND'] = 'sdpa'
os.environ['SPARSE_ATTN_BACKEND'] = 'sdpa'
os.environ['XFORMERS_DISABLED'] = '1'

from trellis.pipelines import TrellisImageTo3DPipeline
from trellis.utils import postprocessing_utils

pipeline = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global pipeline
    print("[INFO] Loading TRELLIS pipeline into GPU memory...")
    pipeline = TrellisImageTo3DPipeline.from_pretrained("microsoft/TRELLIS-image-large")
    pipeline.cuda()
    print("[INFO] TRELLIS pipeline loaded and ready.")
    yield
    del pipeline
    torch.cuda.empty_cache()

app = FastAPI(title="TRELLIS 3D Generation API", lifespan=lifespan)

@app.get("/health")
def health():
    return {
        "status": "ok",
        "gpu_available": torch.cuda.is_available(),
        "device_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None
    }

@app.post("/generate")
async def generate(
    file: UploadFile = File(...),
    seed: int = Query(default=0, description="Seed for reproducible generation"),
    simplify: float = Query(default=0.95, ge=0.0, le=1.0, description="Mesh simplification ratio"),
    texture_size: int = Query(default=1024, description="GLB texture resolution")
):
    global pipeline
    if pipeline is None:
        raise HTTPException(status_code=503, detail="Model pipeline is not initialized")

    try:
        image_bytes = await file.read()
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid image file: {exc}")

    try:
        outputs = pipeline.run(image, seed=seed)
        glb = postprocessing_utils.to_glb(
            outputs['gaussian'][0],
            outputs['mesh'][0],
            simplify=simplify,
            texture_size=texture_size,
        )

        temp_output = tempfile.NamedTemporaryFile(delete=False, suffix=".glb")
        glb.export(temp_output.name)

        return FileResponse(
            temp_output.name,
            media_type="model/gltf-binary",
            filename="generated_model.glb"
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Inference error: {exc}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8888)
