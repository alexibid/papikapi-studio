import base64
import io
import os
import time
import runpod
from PIL import Image
import torch
from diffusers import Flux2KleinPipeline
from huggingface_hub import hf_hub_download

LORA_ADAPTER_NAME = "papikapi"
MAX_REFERENCE_IMAGES = 4

print("[INFO] Initializing FLUX.2-klein-4B in GPU memory...")
device = "cuda" if torch.cuda.is_available() else "cpu"
dtype = torch.bfloat16 if torch.cuda.is_available() else torch.float32

hf_token = os.environ.get("HF_TOKEN")
pipe = Flux2KleinPipeline.from_pretrained(
    "black-forest-labs/FLUX.2-klein-4B",
    token=hf_token,
    torch_dtype=dtype
)
pipe = pipe.to(device)
print(f"[INFO] FLUX.2-klein-4B loaded on {device} ({dtype}) and ready for serverless execution.")


def read_lora_settings():
    repo = os.environ.get("FLUX_LORA_REPO", "").strip()
    if not repo:
        return None
    filename = os.environ.get("FLUX_LORA_FILE", "").strip()
    if not filename:
        raise RuntimeError("FLUX_LORA_REPO is set but FLUX_LORA_FILE is empty")
    return {
        "repo": repo,
        "file": filename,
        "trigger": os.environ.get("FLUX_LORA_TRIGGER", "papikapi-style").strip(),
        "scale": float(os.environ.get("FLUX_LORA_SCALE", "1.0")),
    }


def load_lora(settings):
    if settings is None:
        print("[INFO] No LoRA configured; generating with the base FLUX.2-klein-4B style.")
        return
    weights = hf_hub_download(repo_id=settings["repo"], filename=settings["file"], token=hf_token)
    pipe.load_lora_weights(weights, adapter_name=LORA_ADAPTER_NAME)
    pipe.set_adapters([LORA_ADAPTER_NAME], adapter_weights=[settings["scale"]])
    print(f"[INFO] LoRA {settings['repo']}/{settings['file']} loaded at scale {settings['scale']}.")


def with_trigger(prompt, settings):
    if settings is None or not settings["trigger"] or prompt.startswith(settings["trigger"]):
        return prompt
    return f"{settings['trigger']}, {prompt}"


def decode_reference_images(encoded_images):
    if len(encoded_images) > MAX_REFERENCE_IMAGES:
        raise ValueError(f"At most {MAX_REFERENCE_IMAGES} reference images are supported, got {len(encoded_images)}")
    images = []
    for index, encoded in enumerate(encoded_images):
        payload = encoded.split(",", 1)[1] if "," in encoded else encoded
        try:
            images.append(Image.open(io.BytesIO(base64.b64decode(payload))).convert("RGB"))
        except Exception as exc:
            raise ValueError(f"Reference image {index + 1} is not a valid image: {exc}") from exc
    return images


lora_settings = read_lora_settings()
load_lora(lora_settings)

def handler(job):
    job_input = job.get("input", {})
    prompt = job_input.get("prompt")
    if not prompt:
        return {"error": "Missing required field 'prompt' in input"}

    columns = int(job_input.get("columns", 3))
    rows = int(job_input.get("rows", 2))
    total_picks = columns * rows

    try:
        reference_images = decode_reference_images(job_input.get("reference_images", []))
    except ValueError as exc:
        return {"error": str(exc)}

    try:
        t_start = time.time()

        custom_cell_prompts = job_input.get("cell_prompts")
        if custom_cell_prompts and len(custom_cell_prompts) == total_picks:
            pick_prompts = [(custom_cell_prompts[i], 101 + i) for i in range(total_picks)]
        else:
            pick_prompts = [
                (prompt + " Ultra-cute baby chibi figure, oversized round head, chubby compact body, short tiny legs.", 101),
                (prompt + " Youthful playful young figure, cheerful energetic stance, soft rounded geometry.", 102),
                (prompt + " Studio signature training style, balanced geometric proportions, expressive eyes with white catchlight, clean planar facets without black crease lines.", 103),
                (prompt + " Cute toy-like baby chibi variation with bold simplified geometric planes.", 104),
                (prompt + " Playful youthful variation with lively dynamic posture.", 105),
                (prompt + " Refined structured low-poly sculpture with elegant faceted planes.", 106),
            ]

        picks = []
        for p_idx in range(total_picks):
            p_text, p_seed = pick_prompts[p_idx % len(pick_prompts)]
            gen = torch.Generator(device="cpu").manual_seed(p_seed)
            out = pipe(
                image=reference_images if reference_images else None,
                prompt=with_trigger(p_text, lora_settings),
                width=512,
                height=512,
                num_inference_steps=4,
                guidance_scale=1.0,
                generator=gen
            ).images[0]
            picks.append(out)

        sheet_width = columns * 512
        sheet_height = rows * 512
        sheet = Image.new("RGB", (sheet_width, sheet_height), (229, 229, 229))
        for idx, p_img in enumerate(picks):
            col = idx % columns
            row = idx // columns
            sheet.paste(p_img, (col * 512, row * 512))

        buf = io.BytesIO()
        sheet.save(buf, format="JPEG", quality=95)
        sheet_bytes = buf.getvalue()
        sheet_b64 = base64.b64encode(sheet_bytes).decode("utf-8")

        duration = round(time.time() - t_start, 2)
        print(f"[INFO] Alternatives sheet generated in {duration}s ({len(sheet_bytes)} bytes)")

        return {
            "status": "COMPLETED",
            "output": {
                "sheet_base64": sheet_b64,
                "mime": "image/jpeg",
                "lora": None if lora_settings is None else f"{lora_settings['repo']}/{lora_settings['file']}",
                "reference_images_used": len(reference_images)
            }
        }
    except Exception as exc:
        return {"error": f"Inference error during FLUX generation: {exc}"}

if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
