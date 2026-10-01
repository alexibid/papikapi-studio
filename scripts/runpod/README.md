# Papikapi Studio — RunPod Serverless Deployment

Scale-to-Zero serverless architecture for Stage 1 (FLUX.2 Alternatives) and Stage 2 (TRELLIS Image-to-3D).

## 1. Recipes

Everything needed to rebuild the workers lives in `apps/papikapi-studio/scripts/runpod/`:

| File | Worker | Role |
| --- | --- | --- |
| `setup.trellis.sh` | TRELLIS | Installs TRELLIS on top of the official RunPod PyTorch image |
| `rp_handler.trellis.py` | TRELLIS | Serverless handler |
| `trellis_lowpoly.py` | TRELLIS | Decimates the mesh to `target_faces` and bakes the texture on the low-poly mesh |
| `test.trellis.py` | TRELLIS | Generates one GLB on the build pod before anything is published |
| `package.trellis.py` | TRELLIS | Snapshots what `setup.trellis.sh` installed and publishes the image |
| `Dockerfile.flux` | FLUX.2 | Image recipe for the alternatives sheet generator |
| `rp_handler.flux.py` | FLUX.2 | Serverless handler |

GitHub Actions is not used. Its runners have 32 GB of disk, which the TRELLIS build does not fit in.

## 2. Rebuilding the TRELLIS worker over SSH

The image is built by installing TRELLIS on a real pod, testing it there, and publishing a snapshot of
what was installed. The published image is the exact environment that just passed the test.

1. **Rent a build pod** with image `runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04`, a 24 GB
   GPU (RTX 3090 is enough, about $0.22/h), a 120 GB container disk, and port `22/tcp`. Pass the SSH
   public key in the `PUBLIC_KEY` environment variable.
2. **Copy the recipes** to `/root/` on the pod with `scp`: `setup.trellis.sh`, `rp_handler.trellis.py`,
   `trellis_lowpoly.py`, `test.trellis.py`, `package.trellis.py`, and a transparent cutout to test with.
3. **Install crane** before anything else, so it stays out of the snapshot:
   `curl -sSL https://github.com/google/go-containerregistry/releases/download/v0.20.2/go-containerregistry_Linux_x86_64.tar.gz | tar -xz -C /usr/local/bin crane`
4. **Install TRELLIS** with `bash /root/setup.trellis.sh` (20–40 minutes). It pins the torch shipped with
   the base image, picks the matching `kaolin` and `xformers` wheels, and ends by verifying the imports.
5. **Test** with `cp /root/rp_handler.trellis.py /root/trellis_lowpoly.py /app/ && PYTHONPATH=/app/trellis python /root/test.trellis.py /root/art-cutout.png /tmp/test.glb 500`.
   It prints the face count of the generated GLB. Do not publish if this fails.
6. **Log in to the registry**, typed by the owner of the GitHub account, never by an agent. The token
   needs the `write:packages` scope:
   `read -rsp "GitHub token: " TOKEN; echo; printf "%s" "$TOKEN" | crane auth login ghcr.io -u alexibid --password-stdin`
7. **Publish** with `python /root/package.trellis.py`. It writes the snapshot in layers of at most 3 GB,
   appends them to the base image, sets `CMD` to the handler, and pushes both
   `ghcr.io/alexibid/papikapi-trellis:<date>` and `:latest`. `/root` is excluded from the snapshot, so
   the token never enters the image. Use `--dry-run` to build the layers without pushing.
8. **Terminate the build pod.**

Workers pull `:latest` when they start, so no endpoint change is needed. The dated tag is kept for
rollback.

## 3. Updating only the TRELLIS handler

When only `rp_handler.trellis.py` or `trellis_lowpoly.py` change, no pod is needed. Pack both files under
`app/` in a tar owned by root and append it to the current image from the Mac with crane:
`crane append -b ghcr.io/alexibid/papikapi-trellis:latest -f handler-layer.tar -t ghcr.io/alexibid/papikapi-trellis:<date>`,
then `crane tag ghcr.io/alexibid/papikapi-trellis:<date> latest`. Tag the previous `latest` first so it can be
restored, and recycle the endpoint workers (Max Workers 0, then 1) so the next worker pulls the new image.
---

## 4. Serverless Endpoints in RunPod Console

Both images are private packages. RunPod pulls them with the `ghcr` registry credential, a GitHub
token with the `read:packages` scope.

### Endpoint 1: TRELLIS Image-to-3D
- **Endpoint Name**: `papikapi-trellis`
- **Container Image**: `ghcr.io/alexibid/papikapi-trellis:latest`
- **GPU Type**: 24 GB class (`RTX A5000`, `L4`, `RTX 3090`)
- **Min Workers**: `0` (Zero cost when idle)
- **Max Workers**: `1`
- **Idle Timeout**: `5` seconds
- **Execution Timeout**: `600` seconds

### Endpoint 2: FLUX.2 Alternatives Sheet
- **Endpoint Name**: `papikapi-flux`
- **Container Image**: `ghcr.io/alexibid/papikapi-flux:latest`
- **GPU Type**: `RTX 4090 (24GB)` or `RTX 4000 Ada (20GB)`
- **Min Workers**: `0` (Zero cost when idle)
- **Max Workers**: `1`
- **Idle Timeout**: `5` seconds
- **Execution Timeout**: `180` seconds
- **Container Disk**: `25 GB`
- **Environment**:

| Variable | Required | Meaning |
| --- | --- | --- |
| `HF_TOKEN` | yes | Hugging Face read token, also used to download a private LoRA |
| `FLUX_LORA_REPO` | no | Hugging Face repository holding the style LoRA (private, currently `ibid-dot/papikapi-style`). Unset means no LoRA |
| `FLUX_LORA_FILE` | with the repo | LoRA file inside the repository (for example `papikapi_style_v1.safetensors`) |
| `FLUX_LORA_TRIGGER` | no | Word prepended to every prompt while the LoRA is active. Defaults to `papikapi-style` |
| `FLUX_LORA_SCALE` | no | LoRA strength. Defaults to `1.0` |

Switching LoRA versions only needs these variables changed in the endpoint, not a new image. The
response reports the active LoRA in `output.lora`.

---

## 5. Configure Local Workspace

Add your RunPod credentials to `apps/papikapi-studio/.env`:

```env
RUNPOD_API_KEY=your_runpod_api_key_here
RUNPOD_FLUX_ENDPOINT_ID=your_flux_endpoint_id
RUNPOD_TRELLIS_ENDPOINT_ID=your_trellis_endpoint_id
```

Or configure them directly in `apps/papikapi-studio/pipeline.json`.
