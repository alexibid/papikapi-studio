# Papikapi Studio — QA Stages & Validation Status

**Aggregated Execution:** `npx tsx scripts/stage-orchestrator.ts --stage <N>` (or `npx tsx scripts/stage-orchestrator.ts --stage <N> --model <name>`)  
**Pipeline Specification:** [PIPELINE.md](PIPELINE.md)  
**Configuration Source:** [pipeline.json](pipeline.json)  

---

## 📋 Stages Matrix & Validation Status

| Stage | Name | Key Components | Inputs | Outputs | Execution Command | Validation Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Stage 0** | **Alternatives & Art Selection** | 3x2 Axonometric grid (6 styles from chibi to mature), cell cropper | Prompt + up to 3 optional photo references | `step-1-alternatives.jpeg`, `step-1-art.jpeg`, `art.jpeg` | `npx tsx scripts/stage-orchestrator.ts --stage 0` | **CLOSED & VERIFIED** ✅ |
| **Stage 1** | **3D Model Synthesis (TRELLIS)** | Remote RunPod GPU (NVIDIA RTX PRO 4500 SE), glTF binary synthesis | `step-1-art.jpeg` | `step-1-3d.glb`, `model.glb`, `manifest.json` | `npx tsx scripts/stage-orchestrator.ts --stage 1` | **CLOSED & VERIFIED** ✅ |

---

## 🎯 Model Validation Results (Production Batch)

Tested and verified on the NVIDIA RTX PRO 4500 Blackwell Server Edition ($0.58/hr):

| Model | Input Art | Input Size | Processing Time | Cost (USD) | Output 3D Mesh (.glb) | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **bear** | `stage-0/step-1-art.jpeg` | 34.8 KB | 19.34s | $0.0031 | 1.10 MB | **PASS** ✅ |
| **cheetah** | `stage-0/step-1-art.jpeg` | 221.3 KB | 21.09s | $0.0034 | 1.55 MB | **PASS** ✅ |
| **dalmatian** | `stage-0/step-1-art.jpeg` | 154.3 KB | 18.41s | $0.0029 | 1.43 MB | **PASS** ✅ |
| **fox** | `stage-0/step-1-art.jpeg` | 165.2 KB | 22.96s | $0.0037 | 1.56 MB | **PASS** ✅ |
| **giraffe** | `stage-0/step-1-art.jpeg` | 144.7 KB | 16.45s | $0.0026 | 1.36 MB | **PASS** ✅ |
| **lion** | `stage-0/step-1-art.jpeg` | 180.3 KB | 25.54s | $0.0041 | 1.76 MB | **PASS** ✅ |
| **police-car** | `stage-0/step-1-art.jpeg` | 171.0 KB | 19.57s | $0.0031 | 1.37 MB | **PASS** ✅ |
| **t-rex** | `stage-0/step-1-art.jpeg` | 180.8 KB | 16.67s | $0.0027 | 1.40 MB | **PASS** ✅ |

* **Zero Incidents**: All 8 models generated clean watertight `.glb` meshes with 100% success rate.
* **Manifests**: Aggregated manifests written to `public/models/<model>/manifest.json` and registered in `public/models/index.json`.
