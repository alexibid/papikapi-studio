# Papikapi Studio — QA Stages & Validation Status

**Run a stage:** `npm run stage:<N> -- --model <name>` (all models without `--model`)  
**Run from a step to the end:** `npm run stage:<N>:step:<M> --finish` (add `-- --model <name>` for one model)  
**Pipeline Specification:** [PIPELINE.md](PIPELINE.md)  
**Configuration Source:** [pipeline.json](pipeline.json)  

---

## Stages Matrix & Validation Status

| Stage | Name | Key Components | Outputs | Validation Status |
| :--- | :--- | :--- | :--- | :--- |
| **Stage 1** | Alternatives & Art Selection | 3x2 axonometric grid (6 styles), cell cropper | `step-1-alternatives.jpeg`, `step-1-art.jpeg`, `art.jpeg` | **CLOSED & VERIFIED** |
| **Stage 2** | Cutout, 3D Model and Base | RMBG-1.4 cutout, TRELLIS on RunPod, base cut, thin-appendage removal | `step-1-art-cutout.png`, `step-2-3d.glb`, `step-3-base.glb` | Steps 1 and 2 **CLOSED & VERIFIED**. `s2-step-3` appendage removal **IN VALIDATION** (see below) |
| **Stage 3** | Simplify, Texture and Plinth | decimate + fold cleanup (no fold under 6 mm, volume guarded), facet colours, legacy vector texture, white plinth | `step-1-reduce.json/.glb`, `step-2-texturize.glb`, `step-3-plinth.glb/.json` | `s3-step-1` fold cleanup **IN VALIDATION** (see below). Texture and plinth run on every model |
| **Stage 4** | Unfolding and Sheets | unfold into pieces, baked colour on A4 sheets, assembly PDF | `step-1-net.json`, `step-2-sheets.pdf` | Sheet colour bake fixed (emission-only texture converted to albedo); needs a regeneration of every model to confirm in the PDFs |
| **Stage 5** | Assembly Animation | fold plan, build order, face colours | `step-1-assembly.json` | Runs on every model |

---

## Open Validation Points

| Area | What was measured | What is still open |
| :--- | :--- | :--- |
| Appendage removal (`s2-step-3`) | Body-contour method on 5 models, viewed: bear unchanged, gray-kitten and calico lose their whiskers, dolphin keeps tail and fins, stegosaurus keeps its plates; volume removed 0 to 0.07 %; feet in the ground zone untouched | Regenerate the base of the other 49 models and check the whiskers and the small root remains (gray-kitten keeps a 1 to 2 face spike at the muzzle seen from above) |
| Fold cleanup (`s3-step-1`) | alex 499 to 100 faces, bear 413 to 352, black tuxedo 447 to 297, ankylosaurus 464 to 435; the plain decimate is the fallback | Alex real volume change is -0.15 % against -0.04 % of the plain decimate; the guard allows 0.1 percentage points on the triangle mesh, quad joining adds the rest. Decide the accepted limit |
| Facet colours | cat and ankylosaurus keep black, white and cream facets in `step-1-reduce.glb` | eyes smaller than a facet are lost by design |

---

## Model Validation Results (historical batch)

Batch of 2026-09-24, run with the previous one-step Stage 2 on the NVIDIA RTX PRO 4500 Blackwell Server Edition ($0.58/hr). Stage 2 now runs cutout and TRELLIS as two steps on a RunPod Serverless RTX 4090.

| Model | Input Art | Input Size | Processing Time | Cost (USD) | Output 3D Mesh (.glb) | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **bear** | `stage-1/step-1-art.jpeg` | 34.8 KB | 19.34s | $0.0031 | 1.10 MB | **PASS** |
| **cheetah** | `stage-1/step-1-art.jpeg` | 221.3 KB | 21.09s | $0.0034 | 1.55 MB | **PASS** |
| **dalmatian** | `stage-1/step-1-art.jpeg` | 154.3 KB | 18.41s | $0.0029 | 1.43 MB | **PASS** |
| **fox** | `stage-1/step-1-art.jpeg` | 165.2 KB | 22.96s | $0.0037 | 1.56 MB | **PASS** |
| **giraffe** | `stage-1/step-1-art.jpeg` | 144.7 KB | 16.45s | $0.0026 | 1.36 MB | **PASS** |
| **lion** | `stage-1/step-1-art.jpeg` | 180.3 KB | 25.54s | $0.0041 | 1.76 MB | **PASS** |
| **police-car** | `stage-1/step-1-art.jpeg` | 171.0 KB | 19.57s | $0.0031 | 1.37 MB | **PASS** |
| **t-rex** | `stage-1/step-1-art.jpeg` | 180.8 KB | 16.67s | $0.0027 | 1.40 MB | **PASS** |

* All 8 models generated clean watertight `.glb` meshes.
* Aggregated manifests are written to `public/models/<model>/manifest.json` and registered in `public/models/index.json`.
