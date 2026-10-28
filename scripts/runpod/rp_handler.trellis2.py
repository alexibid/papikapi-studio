"""TRELLIS.2 worker that reproduces the official Space step by step (huggingface.co/spaces/microsoft/TRELLIS.2,
app.py: image_to_3d then extract_glb), with the Space's own trellis2 code and requirements."""
import base64
import io
import os
import tempfile

SPACE_DIR = "/home/user/app"
os.environ["OPENCV_IO_ENABLE_OPENEXR"] = "1"
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
os.environ["ATTN_BACKEND"] = "flash_attn"
os.environ["FLEX_GEMM_AUTOTUNE_CACHE_PATH"] = os.path.join(SPACE_DIR, "autotune_cache.json")
os.environ["FLEX_GEMM_AUTOTUNER_VERBOSE"] = "1"

import cv2
import numpy as np
import o_voxel
import runpod
import torch
from PIL import Image
from trellis2.pipelines import Trellis2ImageTo3DPipeline, rembg
from trellis2.renderers import EnvMap
from trellis2.utils import render_utils

MODEL_ID = "microsoft/TRELLIS.2-4B"
PIPELINE_TYPES = {"512": "512", "1024": "1024_cascade", "1536": "1536_cascade"}
NVDIFFRAST_FACE_LIMIT = 16777216
AABB = [[-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]]
CHUNK_CHARS = 900_000
# Space defaults (app.py sliders), used when a request does not override them.
SPACE_DEFAULTS = {
    "resolution": "1024",
    "decimation_target": 500000,
    "texture_size": 2048,
    "ss_guidance_strength": 7.5, "ss_guidance_rescale": 0.7, "ss_sampling_steps": 12, "ss_rescale_t": 5.0,
    "shape_slat_guidance_strength": 7.5, "shape_slat_guidance_rescale": 0.5, "shape_slat_sampling_steps": 12,
    "shape_slat_rescale_t": 3.0,
    "tex_slat_guidance_strength": 1.0, "tex_slat_guidance_rescale": 0.0, "tex_slat_sampling_steps": 12,
    "tex_slat_rescale_t": 3.0,
}
PREVIEW_VIEWS = 8
PREVIEW_KEYS = ("shaded_forest", "base_color")
PREVIEW_FRONT_VIEW = 4

class UnusedBackgroundRemover:
    """The Space drops the pipeline's background remover right after loading (rembg_model = None) and sends
    cutouts; its weights (briaai/RMBG-2.0) are gated, so it is not loaded at all here."""

    def __init__(self, **_settings):
        pass


rembg.BiRefNet = UnusedBackgroundRemover

print("[INFO] Initializing TRELLIS.2 (Space build) in GPU memory...")
pipeline = Trellis2ImageTo3DPipeline.from_pretrained(MODEL_ID)
pipeline.rembg_model = None
pipeline.low_vram = os.environ.get("TRELLIS2_LOW_VRAM", "0") == "1"
pipeline.cuda()
forest = cv2.cvtColor(cv2.imread(os.path.join(SPACE_DIR, "assets/hdri/forest.exr"), cv2.IMREAD_UNCHANGED), cv2.COLOR_BGR2RGB)
envmap = {"forest": EnvMap(torch.tensor(forest, dtype=torch.float32, device="cuda"))}
print("[INFO] TRELLIS.2 loaded and ready for serverless execution.")


def preprocess_image(image: Image.Image) -> Image.Image:
    """app.py preprocess_image for an RGBA cutout: resize to 1024 max, square crop on alpha, premultiply."""
    if image.mode != "RGBA" or np.all(np.array(image)[:, :, 3] == 255):
        raise ValueError("A transparent cutout (RGBA with a real alpha channel) is required")
    scale = min(1, 1024 / max(image.size))
    if scale < 1:
        image = image.resize((int(image.width * scale), int(image.height * scale)), Image.Resampling.LANCZOS)
    bbox = np.argwhere(np.array(image)[:, :, 3] > 0.8 * 255)
    bbox = np.min(bbox[:, 1]), np.min(bbox[:, 0]), np.max(bbox[:, 1]), np.max(bbox[:, 0])
    center = (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2
    size = int(max(bbox[2] - bbox[0], bbox[3] - bbox[1]))
    image = image.crop((center[0] - size // 2, center[1] - size // 2, center[0] + size // 2, center[1] + size // 2))
    output = np.array(image).astype(np.float32) / 255
    return Image.fromarray((output[:, :, :3] * output[:, :, 3:4] * 255).astype(np.uint8))


def sampler_params(settings: dict, stage: str) -> dict:
    return {
        "steps": settings[f"{stage}_sampling_steps"],
        "guidance_strength": settings[f"{stage}_guidance_strength"],
        "guidance_rescale": settings[f"{stage}_guidance_rescale"],
        "rescale_t": settings[f"{stage}_rescale_t"],
    }


def render_preview(mesh) -> bytes:
    """Same snapshot as the Space preview (render_snapshot r=2 fov=36, forest HDRI), front view at full 1024 px."""
    frames = render_utils.render_snapshot(mesh, resolution=1024, r=2, fov=36, nviews=PREVIEW_VIEWS, envmap=envmap)
    front = np.concatenate([frames[key][PREVIEW_FRONT_VIEW] for key in PREVIEW_KEYS], axis=1)
    ok, encoded = cv2.imencode(".png", cv2.cvtColor(front, cv2.COLOR_RGB2BGR))
    if not ok:
        raise RuntimeError("Could not encode the preview image")
    return encoded.tobytes()


def extract_glb(latents, settings: dict) -> tuple[bytes, int]:
    """app.py extract_glb: decode the latents again and bake the GLB with the Space's arguments."""
    shape_slat, tex_slat, res = latents
    mesh = pipeline.decode_latent(shape_slat, tex_slat, res)[0]
    mesh.simplify(NVDIFFRAST_FACE_LIMIT)
    glb = o_voxel.postprocess.to_glb(
        vertices=mesh.vertices, faces=mesh.faces, attr_volume=mesh.attrs, coords=mesh.coords,
        attr_layout=pipeline.pbr_attr_layout, grid_size=res, aabb=AABB,
        decimation_target=settings["decimation_target"], texture_size=settings["texture_size"],
        remesh=True, remesh_band=1, remesh_project=0,
    )
    with tempfile.NamedTemporaryFile(delete=False, suffix=".glb") as handle:
        path = handle.name
    glb.export(path, extension_webp=True)
    with open(path, "rb") as stream:
        data = stream.read()
    os.remove(path)
    return data, len(getattr(glb, "faces", []))


def stream_part(part: str, data: bytes, metadata: dict):
    encoded = base64.b64encode(data).decode("utf-8")
    chunks = [encoded[start:start + CHUNK_CHARS] for start in range(0, len(encoded), CHUNK_CHARS)]
    for index, chunk in enumerate(chunks):
        yield {"part": part, "chunk_index": index, "chunk_count": len(chunks), "data": chunk,
               "file_size": len(data), **metadata}


def handler(job):
    """Yields the preview and the GLB in base64 chunks under RunPod's 1 MB stream limit (the ~20 MB job result
    cap drops a whole GLB: /job-done answers 400 and the job reads COMPLETED without output)."""
    job_input = job.get("input", {})
    if not job_input.get("image_base64"):
        yield {"error": "Missing required field 'image_base64' in input"}
        return
    settings = {**SPACE_DEFAULTS, **{key: job_input[key] for key in SPACE_DEFAULTS if key in job_input}}
    seed = int(job_input.get("seed", 0))

    try:
        image = preprocess_image(Image.open(io.BytesIO(base64.b64decode(job_input["image_base64"]))))
        outputs, latents = pipeline.run(
            image,
            seed=seed,
            preprocess_image=False,
            sparse_structure_sampler_params=sampler_params(settings, "ss"),
            shape_slat_sampler_params=sampler_params(settings, "shape_slat"),
            tex_slat_sampler_params=sampler_params(settings, "tex_slat"),
            pipeline_type=PIPELINE_TYPES[str(settings["resolution"])],
            return_latent=True,
        )
        mesh = outputs[0]
        mesh.simplify(NVDIFFRAST_FACE_LIMIT)
        preview = render_preview(mesh)
        del outputs, mesh
        torch.cuda.empty_cache()
        glb_bytes, face_count = extract_glb(latents, settings)
        torch.cuda.empty_cache()
    except Exception as exc:
        yield {"error": f"Inference error during 3D generation: {exc}"}
        return

    yield from stream_part("preview", preview, {"seed": seed})
    yield from stream_part("glb", glb_bytes, {"face_count": face_count, "seed": seed})


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler, "return_aggregate_stream": False})
