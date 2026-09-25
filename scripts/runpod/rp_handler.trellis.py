import base64
import io
import os
import tempfile
import runpod
from PIL import Image
import torch

os.environ['SPCONV_ALGO'] = 'native'
os.environ['ATTN_BACKEND'] = 'sdpa'
os.environ['SPARSE_ATTN_BACKEND'] = 'sdpa'
os.environ['XFORMERS_DISABLED'] = '1'

from trellis.pipelines import TrellisImageTo3DPipeline
from trellis.utils import postprocessing_utils

print("[INFO] Initializing TRELLIS Image-to-3D pipeline in GPU memory...")
pipeline = TrellisImageTo3DPipeline.from_pretrained("microsoft/TRELLIS-image-large")
pipeline.cuda()
print("[INFO] TRELLIS model loaded and ready for serverless execution.")

def handler(job):
    job_input = job.get("input", {})
    image_b64 = job_input.get("image_base64")
    if not image_b64:
        return {"error": "Missing required field 'image_base64' in input"}

    seed = int(job_input.get("seed", 1))
    simplify = float(job_input.get("simplify", 0.95))
    texture_size = int(job_input.get("texture_size", 1024))

    try:
        if "," in image_b64:
            image_b64 = image_b64.split(",", 1)[1]
        raw_bytes = base64.b64decode(image_b64)
        image = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
    except Exception as exc:
        return {"error": f"Failed to decode input image base64: {exc}"}

    try:
        outputs = pipeline.run(image, seed=seed)
        glb = postprocessing_utils.to_glb(
            outputs['gaussian'][0],
            outputs['mesh'][0],
            simplify=simplify,
            texture_size=texture_size,
        )

        with tempfile.NamedTemporaryFile(delete=False, suffix=".glb") as tmp:
            tmp_path = tmp.name
        glb.export(tmp_path)

        with open(tmp_path, "rb") as f:
            glb_bytes = f.read()

        if os.path.exists(tmp_path):
            os.remove(tmp_path)

        glb_b64 = base64.b64encode(glb_bytes).decode("utf-8")
        return {
            "status": "COMPLETED",
            "output": {
                "glb_base64": glb_b64,
                "file_size": len(glb_bytes)
            }
        }
    except Exception as exc:
        return {"error": f"Inference error during 3D generation: {exc}"}

if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
