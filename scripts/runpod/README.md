# Kirigami Studio — RunPod Serverless Deployment

Scale-to-Zero serverless architecture for Stage 0 (FLUX.2 Alternatives) and Stage 1 (TRELLIS Image-to-3D).

## 1. Build and Push Docker Containers

### Worker 1: TRELLIS Image-to-3D
```bash
cd apps/kirigami-studio/scripts/runpod

# Build container
docker build -t <your-dockerhub-user>/kirigami-trellis-serverless:latest -f Dockerfile.trellis .

# Push to Docker Hub
docker push <your-dockerhub-user>/kirigami-trellis-serverless:latest
```

### Worker 2: FLUX.2 Alternatives Sheet
```bash
cd apps/kirigami-studio/scripts/runpod

# Build container
docker build -t <your-dockerhub-user>/kirigami-flux-serverless:latest -f Dockerfile.flux .

# Push to Docker Hub
docker push <your-dockerhub-user>/kirigami-flux-serverless:latest
```

---

## 2. Create Serverless Endpoints in RunPod Console

Go to **RunPod Console -> Serverless -> New Endpoint**:

### Endpoint 1: TRELLIS Image-to-3D
- **Endpoint Name**: `kirigami-trellis-serverless`
- **Container Image**: `<your-dockerhub-user>/kirigami-trellis-serverless:latest`
- **GPU Type**: `RTX 4090 (24GB)` or `RTX A5000 (24GB)`
- **Min Workers**: `0` (Zero cost when idle)
- **Max Workers**: `1`
- **Idle Timeout**: `5` seconds
- **Execution Timeout**: `180` seconds
- **Container Disk**: `25 GB`

Copy the generated **Endpoint ID** (e.g. `abc123xyz-trellis`).

### Endpoint 2: FLUX.2 Alternatives Sheet
- **Endpoint Name**: `kirigami-flux-serverless`
- **Container Image**: `<your-dockerhub-user>/kirigami-flux-serverless:latest`
- **GPU Type**: `RTX 4090 (24GB)` or `RTX 4000 Ada (20GB)`
- **Min Workers**: `0` (Zero cost when idle)
- **Max Workers**: `1`
- **Idle Timeout**: `5` seconds
- **Execution Timeout**: `180` seconds
- **Container Disk**: `25 GB`

Copy the generated **Endpoint ID** (e.g. `def456uvw-flux`).

---

## 3. Configure Local Workspace

Add your RunPod credentials to `apps/kirigami-studio/.env`:

```env
RUNPOD_API_KEY=your_runpod_api_key_here
RUNPOD_FLUX_ENDPOINT_ID=your_flux_endpoint_id
RUNPOD_TRELLIS_ENDPOINT_ID=your_trellis_endpoint_id
```

Or configure them directly in `apps/kirigami-studio/pipeline.json`.
