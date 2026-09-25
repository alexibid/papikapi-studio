import base64
import io
import time
import runpod
from PIL import Image
import torch
from diffusers import Flux2KleinPipeline

print("[INFO] Initializing FLUX.2-klein-4B in GPU memory...")
device = "cuda" if torch.cuda.is_available() else "cpu"
dtype = torch.bfloat16 if torch.cuda.is_available() else torch.float32

pipe = Flux2KleinPipeline.from_pretrained(
    "black-forest-labs/FLUX.2-klein-4B",
    dtype=dtype
)
pipe = pipe.to(device)
print(f"[INFO] FLUX.2-klein-4B loaded on {device} ({dtype}) and ready for serverless execution.")

def handler(job):
    job_input = job.get("input", {})
    prompt = job_input.get("prompt")
    if not prompt:
        return {"error": "Missing required field 'prompt' in input"}

    negative_prompt = job_input.get("negative_prompt", "")
    reference_images_b64 = job_input.get("reference_images", [])
    columns = int(job_input.get("columns", 3))
    rows = int(job_input.get("rows", 2))
    total_picks = columns * rows

    ref_imgs = []
    for raw in reference_images_b64:
        try:
            if "," in raw:
                raw = raw.split(",", 1)[1]
            b = base64.b64decode(raw)
            ref_imgs.append(Image.open(io.BytesIO(b)).convert("RGB"))
        except Exception:
            pass

    try:
        t_start = time.time()
        primary_ref = ref_imgs[0] if len(ref_imgs) > 0 else None

        if primary_ref is not None:
            pick_prompts = [
                (prompt + " Cute stylized variation with bright playful papercraft tone.", 101),
                (prompt + " Cheerful papercraft variation with subtle alternate decorative details.", 102),
                (prompt + " Identical to reference with signature colors, markings, and proportions.", 103),
                (prompt + " Crisp structured variation with sharp planar low-poly facets.", 104),
                (prompt + " Compact chibi variation with simplified bold geometric planes.", 105),
                (prompt + " Dynamic variation with rich contrasting papercraft tones.", 106),
            ]

            picks = []
            for p_idx in range(total_picks):
                p_text, p_seed = pick_prompts[p_idx % len(pick_prompts)]
                gen = torch.Generator(device="cpu").manual_seed(p_seed)
                out = pipe(
                    image=primary_ref,
                    prompt=p_text,
                    width=512,
                    height=512,
                    num_inference_steps=3,
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
        else:
            sheet = pipe(
                prompt=prompt,
                width=1536,
                height=1024,
                num_inference_steps=4,
                guidance_scale=1.0,
                generator=torch.Generator(device="cpu").manual_seed(42)
            ).images[0]

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
                "mime": "image/jpeg"
            }
        }
    except Exception as exc:
        return {"error": f"Inference error during FLUX generation: {exc}"}

if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
