# Papikapi Studio (`papikapi-studio`)

> **Comprehensive Pipeline Specification:** See [**`PIPELINE.md`**](./PIPELINE.md) for the complete architecture, stage configuration, quality guards, check scripts and manifest schemas.

---

## Origami & 3D Papercraft Generation Platform

**Papikapi Studio** is an interactive web studio and generative pipeline that turns a text prompt and optional reference photos into a printable 3D papercraft figure: a low-poly mesh, coloured A4 sheets with cut, fold and glue marks, and an assembly animation.

The application combines an Angular frontend, a local orchestration backend, Blender headless for the geometry and remote serverless GPU workers with scale-to-zero economics.

```
        Prompt / photo references
                   │
                   ▼
   STAGE 1  Axonometric art: 3x2 alternatives (FLUX.2-klein-4B) and pick
                   │
                   ▼
   STAGE 2  Transparent cutout (RMBG-1.4) → TRELLIS 3D mesh →
            clean base: feet on z=0, thin appendages (whiskers…) removed
                   │
                   ▼
   STAGE 3  Simplify (decimate + no fold under 6 mm, volume guarded,
            TRELLIS colours kept per facet) → texture → white plinth
                   │
                   ▼
   STAGE 4  Unfold into pieces → coloured A4 sheets and assembly PDF
                   │
                   ▼
   STAGE 5  Assembly animation plan (played by the Studio "Montagem" tab)
```

---

## Core Features

- **Interactive 3D Web Studio**: Angular and Three.js with orbit controls, wireframe toggle, process loader, model catalogue and an assembly animation viewer.
- **Deterministic pipeline** driven by [`pipeline.json`](./pipeline.json): prompts, physical limits (in millimetres at print size), Blender scripts, pricing and GPU parameters live there.
- **TRELLIS stays the geometric truth**: every simplification pass is checked against the TRELLIS mesh for airtightness, volume change, deviation and feature loss, and falls back to the previous result when a limit is exceeded.
- **Foldable by construction**: no fold shorter than 6 mm at print size, no appendage thinner than a glue tab, facet colours inherited from the TRELLIS texture.
- **Scale-to-Zero GPU**: RunPod Serverless workers (`papikapi-flux`, `papikapi-trellis`) billed per second of use.
- **Immutable cost and audit manifests** per step.

---

## Project Structure

```text
apps/papikapi-studio/
├── README.md, PIPELINE.md, qa-stages.md
├── pipeline.json                 # single source of truth
├── project.json, package.json    # Nx targets and npm scripts (stage:N:step:M)
├── src/                          # Angular application (Studio UI)
├── resources/                    # working artifacts per model (stage-1 … stage-5)
├── public/models/                # served models: index.json + [model]/ (art, model.glb, sheets.pdf, assembly.json, manifest.json)
└── scripts/
    ├── common/                   # paths, config, manifests, CLI parser, Blender and Python runners
    ├── stage-1/ … stage-5/       # one folder per stage; Blender scripts under blender/
    ├── stage-2/checks, stage-3/checks   # validation scripts (see PIPELINE.md)
    ├── training/                 # reference library and caption templates
    ├── server.ts                 # backend API server (port 4502)
    └── stage-orchestrator.ts     # unified CLI orchestrator
```

---

## Everyday Commands

```bash
# Backend API (port 4502) and Studio frontend (port 4500)
npx nx run papikapi-studio:server
npm start -- papikapi-studio
```

```bash
# Run from apps/papikapi-studio
npm run stage:1:step:1 -- --model=dalmatian      # alternatives grid
npm run stage:1:step:2 -- --model=dalmatian --pick=3
npm run stage:2 -- --model=dalmatian             # cutout, TRELLIS, base
npm run stage:3 -- --model=dalmatian             # simplify, texture, plinth
npm run stage:4 -- --model=dalmatian             # unfold and A4 sheets
npm run stage:5 -- --model=dalmatian             # assembly plan

# From one step to the end of the pipeline (every model without --model)
npm run stage:2:step:3 --finish
npm run stage:2:step:3 --finish -- --model dalmatian
```

Steps are identified by the ids of `pipeline.json` (`s2-step-3`, `s3-step-1`, …). The Nx equivalents are `npx nx run papikapi-studio:stage:2:step:3 --model=dalmatian`.

---

## Related Documentation

- [**`PIPELINE.md`**](./PIPELINE.md): pipeline reference, step inputs and outputs, guards, checks and manifest schemas.
- [**`qa-stages.md`**](./qa-stages.md): validation status per stage.
- [**`pipeline.json`**](./pipeline.json): declarative configuration.
