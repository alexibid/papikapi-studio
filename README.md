# Papikapi Studio (`kirigami-studio`)

> **Comprehensive Pipeline Specification:** See [**`PIPELINE.md`**](./PIPELINE.md) for the complete 2-stage generative architecture, stage configuration, GPU contracts, and manifest schemas.

---

##  Origami & 3D Papercraft Generation Platform

**Papikapi Studio** is an interactive web studio and generative AI pipeline that transforms natural language prompts and optional visual reference photos into tactile 3D low-poly papercraft figures (`.glb`).

The application combines a modern Angular frontend, a local orchestration backend, and dedicated remote serverless GPU workers with scale-to-zero economics.

```
                    ┌────────────────────────────────────────┐
                    │          Prompt / Photo Refs           │
                    └───────────────────┬────────────────────┘
                                        │
                                        ▼
             ┌─────────────────────────────────────────────────────┐
             │       STAGE 0: Axonometric Art & Selection          │
             │  • Step 1: 3x2 Alternatives Sheet (FLUX.2-klein-4B) │
             │  • Step 2: High-Resolution Cell Crop (Node Canvas)  │
             └──────────────────────────┬──────────────────────────┘
                                        │ 512x512 Orthogonal Image
                                        ▼
             ┌─────────────────────────────────────────────────────┐
             │       STAGE 1: 3D Neural Mesh Synthesis             │
             │  • Step 1: Image-to-3D Reconstruction (TRELLIS)    │
             │  • Output: Watertight Low-Poly GLB + Manifest       │
             └──────────────────────────┬──────────────────────────┘
                                        │
                                        ▼
             ┌─────────────────────────────────────────────────────┐
             │       PAPIKAPI STUDIO: Interactive Web UI           │
             │  • Three.js WebGL Orbit Canvas & Inspection         │
             │  • Tactile Origami Process Loader & Stepped Ribbon  │
             │  • Model Catalogue & Multi-Pick Versioning          │
             └─────────────────────────────────────────────────────┘
```

---

## 🏛️ Core Features

- **Interactive 3D Web Studio**: Built with Angular 19 and Three.js, featuring real-time orbit controls, wireframe toggles, tactile papercraft process loaders, and responsive model switching.
- **Deterministic 2-Stage Pipeline**:
  - **Stage 0 (Art & Alternatives)**: Generates a 3×2 grid of 6 styled papercraft variations sharing a strict orthogonal axonometric top-right camera angle and zero floor shadows, then crops the chosen pick.
  - **Stage 1 (3D Synthesis)**: Uses Microsoft TRELLIS to reconstruct a watertight 3D mesh with planar low-poly facets and 2D UV texture mapping in ~20 seconds.
- **Scale-to-Zero GPU Infrastructure**: Deployed on RunPod Serverless workers (`papikapi-flux` and `papikapi-trellis`) billed strictly per second of active compute ($0.00 idle cost).
- **Single Source of Truth (`pipeline.json`)**: All prompts, system instructions, pricing rates, and GPU parameters live in [`pipeline.json`](./pipeline.json).
- **Immutable Cost & Audit Manifests**: Every step records exact execution time, compute cost in USD, and device metadata into structured JSON manifests.

---

## 📁 Project Structure

```text
apps/kirigami-studio/
├── README.md                     # Project overview and entry point
├── PIPELINE.md                   # Full 2-stage pipeline specifications
├── pipeline.json                 # Single source of truth configuration
├── project.json                  # Nx project targets and scripts
├── src/                          # Angular 19 application
│   ├── app/                      # Studio UI components, pages, and services
│   └── styles.scss               # Design system styling & themes
├── resources/                    # Development working artifacts per model
│   └── [model]/
│       ├── stage-0/              # Alternatives sheet & cropped art
│       └── stage-1/              # Raw GLB mesh & step manifests
├── public/                       # Publicly served production models
│   └── models/
│       ├── index.json            # Model catalogue index
│       └── [model]/              # art.jpeg, model.glb, manifest.json
└── scripts/                      # Pure TypeScript pipeline & backend
    ├── common/                   # Workspace paths, config, cropper, manifests
    ├── stage-0/                  # Step 1 (alternatives) & Step 2 (pick)
    ├── stage-1/                  # Step 1 (TRELLIS 3D synthesis)
    ├── training/                 # Reference library and caption templates
    ├── server.ts                 # Backend API server (port 4502)
    └── stage-orchestrator.ts     # Unified CLI orchestrator
```

---

## 🚀 Everyday Commands

### Running the Application

```bash
# 1. Start backend API server on port 4502
npx nx run kirigami-studio:server

# 2. Start Angular Studio frontend on port 4500
npm start -- kirigami-studio
```

### Running Pipeline Stages via CLI

```bash
# Generate 3x2 alternatives grid for a model (Stage 0 Step 1)
npx nx run kirigami-studio:stage:0:step:1 --model=dalmatian

# Pick an alternative cell from the sheet (Stage 0 Step 2, e.g. pick #3)
npx nx run kirigami-studio:stage:0:step:2 --model=dalmatian --pick=3

# Synthesize 3D low-poly model via RunPod GPU (Stage 1 Step 1)
npx nx run kirigami-studio:stage:1:step:1 --model=dalmatian

# Run complete Stage 0 or Stage 1 for a model
npx nx run kirigami-studio:stage:0 --model=dalmatian
npx nx run kirigami-studio:stage:1 --model=dalmatian
```

---

## 🔗 Related Documentation

- [**`PIPELINE.md`**](./PIPELINE.md) — Detailed pipeline reference, step inputs/outputs, and manifest schemas.
- [**`.agents/AGENTS.md`**](./.agents/AGENTS.md) — Product architectural rules and engineering invariants.
- [**`pipeline.json`**](./pipeline.json) — Declarative configuration single source of truth.
