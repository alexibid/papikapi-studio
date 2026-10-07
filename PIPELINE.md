# Automated Papercraft Pipeline (`papikapi-studio`)

Deterministic generative pipeline that turns a text prompt and optional reference photos into a printable papercraft figure. Five stages: art alternatives (1), cutout and TRELLIS 3D mesh with a clean base (2), simplification, texture and plinth (3), unfolding into coloured A4 sheets (4) and an assembly animation plan (5).

---

## 🏛️ Architecture Overview

The orchestration is strict **TypeScript** under Node 24 with `tsx`; the geometry work runs in Blender headless (Python, `bpy`/`bmesh`) and in the system Python for the vectoriser. Every module follows the **Single Responsibility Principle (SRP)**.

```text
apps/papikapi-studio/
├── pipeline.json                  # single source of truth: steps, scripts, limits, prompts
├── resources/                     # working area (per model, not versioned)
│   └── [model]/
│       ├── stage-1/               # alternatives grid, picked art
│       ├── stage-2/
│       │   ├── step-1-art-cutout.png        # transparent cutout of the picked art
│       │   ├── step-2-3d.glb                # TRELLIS mesh (texture + UVs)
│       │   ├── step-3-base.glb              # figure alone, feet on z=0, appendages removed
│       │   ├── step-3-views/                # orthographic views of the base
│       │   └── step-*-manifest.json
│       ├── stage-3/
│       │   ├── step-1-reduce.json           # reduced mesh (+ faceColours)
│       │   ├── step-1-reduce.glb            # reduced mesh with vertex colours per facet
│       │   ├── step-2-texturize.glb         # reduced mesh textured with the vector layers
│       │   ├── step-3-plinth.glb / .json    # textured figure fused to the white plinth
│       │   └── step-*-manifest.json
│       ├── stage-4/               # step-1-net.json, step-2-sheets.pdf, step renders
│       └── stage-5/               # step-1-assembly.json
├── public/models/                 # served by the Studio: index.json + [model]/{art.jpeg,model.glb,sheets.pdf,assembly.json,manifest.json}
└── scripts/
    ├── common/                    # paths, config loader, manifests, CLI parser, Blender/Python runners
    ├── stage-1/                   # alternatives, pick
    ├── stage-2/                   # cutout, TRELLIS, base cut (+ blender/base/appendages.py), checks/
    ├── stage-3/                   # simplify (blender/key_points), texturize, plinth, checks/
    ├── stage-4/                   # unfold, sheets (PDF)
    ├── stage-5/                   # assembly plan
    ├── server.ts                  # local HTTP API (port 4502)
    └── stage-orchestrator.ts      # unified CLI runner
```

---

## ⚙️ Configuration: `pipeline.json`

Every prompt, system instruction, limit, size in millimetres, Blender script and GPU endpoint is declared in [`pipeline.json`](./pipeline.json); nothing is hard-coded in the scripts. Physical limits are given in millimetres **at the print size** (`target_size_mm`, 300 mm) and converted to the mesh scale inside each script, so the same value means the same thing for every model.

### Pipeline Stages

1. **Stage 1: Art Alternatives & Selection**
   * **`s1-step-1`** (`scripts/stage-1/step-1-alternatives.ts`): prompt plus up to 3 reference photos produce a 3×2 grid of 6 styles (chibi to mature, one axonometric camera, neutral `#E5E5E5` backdrop) with `black-forest-labs/FLUX.2-klein-4B` on RunPod Serverless. Output `step-1-alternatives.jpeg`.
   * **`s1-step-2`** (`scripts/stage-1/step-2-pick.ts`): crops the chosen cell (`--pick 1..6`) to `step-1-art.jpeg` and `public/models/<model>/art.jpeg`.

2. **Stage 2: Cutout, 3D Model and Base**
   * **`s2-step-1` CUTOUT**: local `briaai/RMBG-1.4`, about 2 s, $0.00. Output `step-1-art-cutout.png`.
   * **`s2-step-2` 3D-GLB**: `microsoft/TRELLIS-image-large` on RunPod Serverless (`simplify 0.85`, `target_faces 4000`, `texture_size 1024`, `seed 1`). Output `step-2-3d.glb`. **TRELLIS is the geometric and colour truth of the whole pipeline.**
   * **`s2-step-3` BASE** (`scripts/stage-2/step-3-base.ts`, Blender `blender/base/cut_base.py`):
     * Removes disconnected islands, cuts the TRELLIS plinth away just above its real surface (`base_cut_margin_ratios`: the first margin that gives an airtight mesh wins), caps the feet flat and seats the figure on z=0 centred on x=0, y=0. No plinth exists again until `s3-step-3`.
     * **Removes thin appendages** such as whiskers (`blender/base/envelope.py` and `appendages.py`), generic for every model. The rule is the **body contour**, not a size per model:
       1. the base is rasterised into voxels of `envelope_cell_mm` (1 mm at print size);
       2. an opening (erode then dilate by half of `min_feature_mm`, 3 mm) removes everything too thin to exist in paper; what survives is the **body envelope**;
       3. faces more than `envelope_tolerance_mm` (3 mm) outside the envelope are candidates, attached to the body or not; connected candidates form clusters;
       4. a cluster is an appendage when it is at least `appendage_min_length_mm` (6 mm, the narrowest fold) long, at most `appendage_max_section_mm` wide, at least `appendage_min_aspect` times longer than wide, smaller than `envelope_max_area_ratio` of the surface and **not touching the ground zone** (`appendage_ground_clearance_mm`: the feet are never appendages). Wide plates (fins, plates, ears) are wider than the limit and stay;
       5. the removal follows the cluster ring by ring toward the body, stopping at a concave crease (`appendage_crease_deg`) or when the boundary stops being a stalk (`appendage_root_section_mm`, at most `appendage_max_rings`), so the root goes too;
       6. the faces are deleted and the hole is closed with a fan (`hole_fill.py`) whose triangles inherit the UVs, hence the colours, of the neighbouring faces;
       7. the pass repeats up to `appendage_max_passes` times until nothing is left.
     * Manifest: `removedAppendages`, `appendageFaces`, `appendageVolumePercent`.
     * Output `step-3-base.glb`, `step-3-views/`, `step-3-manifest.json`.

3. **Stage 3: Simplify, Texture and Plinth**
   * **`s3-step-1` SIMPLIFY** (`scripts/stage-3/step-1-simplify.ts`, Blender `blender/key_points/key_points.py`):
     1. **Decimate** (collapse, quadric error) to `target_faces` triangles, the reference geometry.
     2. **Fold cleanup** (`fold_cleanup.py`): no fold shorter than `min_fold_length_mm` (6 mm at print size) may exist. Faces narrower than that are collapsed into a neighbour, then interior vertices whose faces are within `flat_vertex_angle_deg` of coplanar are collapsed. Every collapse must (a) keep the mesh airtight, (b) keep every TRELLIS vertex and face centre within `fold_tolerance_ratio` of the mesh beyond where it already was, (c) leave the vertex on the TRELLIS surface and (d) keep the enclosed volume, the vertex being placed on the position that restores it exactly. The whole pass is accepted only if volume, deviation and feature loss stay within `fold_max_volume_percent` and `fold_max_deviation_ratio` of the plain decimate; otherwise the plain decimate is kept.
     3. Triangles are joined into quads and faces larger than `face_max_extent_ratio` are split.
     4. **Facet colours**: each facet takes the TRELLIS colour sampled from the base texture (the most representative sample of the original triangles it replaces), written as `faceColours` in `step-1-reduce.json` and as vertex colours in `step-1-reduce.glb`, so reduced elements (spikes, paws, muzzles) keep their original colour.
     * Manifest: `meshFaces`, `quads`, `volumeChangePercent`, `maxDeviationMm`, `featureLossMm`, `facetColours`, `airtight`.
   * **`s3-step-2` TEXTURIZE** (`scripts/stage-3/step-2-texturize.ts`): `facet_views.py` renders the facets in the orthographic views, the vectoriser (`scripts/stage-3/python/vectorize`) turns the views into flat Bezier colour layers, and `project_reduce.py` projects them onto the reduced mesh (`min_facing`). Output `step-2-texturize.glb`, `step-2-facets/`, `step-2-views/svg`.
   * **`s3-step-3` PLINTH** (`blender/plinth/build_plinth.py`): deletes the flat foot caps, builds a white trapezoidal plinth with the footprint of the figure (`plinth_margin_ratio`) and fuses it to the feet on both the quad mesh and the textured mesh. Output `step-3-plinth.json`, `step-3-plinth.glb` (copied to `public/models/<model>/model.glb`).

4. **Stage 4: Papercraft Unfolding and Sheets**
   * **`s4-step-1` UNFOLD** (`blender/unfold_model.py`): scales the longest side to `target_size_mm`, flattens twisted quads, repairs tiny faces and unfolds into 2D pieces with cuts, folds and tabs. Output `step-1-net.json`.
   * **`s4-step-2` SHEETS** (`scripts/stage-4/step-2-sheets.ts`): nests the pieces on A4 sheets, **bakes the colour of `step-3-plinth.glb` onto each sheet** (Cycles, smooth cage, `texture_bleed_mm`, `texture_dpi`) and builds the assembly booklet `step-2-sheets.pdf`, copied to `public/models/<model>/sheets.pdf`. The texture step of the legacy mode is emission-only, so the bake converts the emission texture to albedo before baking; without this the pieces print black.
   * Manifest: `pageCount`, `sheetCount`, `pieceCount`, `labelCollisions` (must be 0). Language from `workspace.sheet_language` (`pt` or `en`), texts in `scripts/stage-4/sheet-translations.json`.

5. **Stage 5: Assembly Animation**
   * **`s5-step-1` ASSEMBLY** (`scripts/stage-5/step-1-assembly.ts`, no Blender, $0.00): builds the fold plan (hinges, fold angles from the rigid transform flat→3D, build order bottom-up, tray layout) and the face colours from the textured GLB. Output `step-1-assembly.json`, copied to `public/models/<model>/assembly.json`. The Studio `Montagem` tab plays it with a slider.

---

## 🚀 Execution Commands

Single steps and stages (`npm run` from `apps/papikapi-studio`, or `npx tsx scripts/stage-orchestrator.ts`):

```bash
npm run stage:2:step:3 -- --model calico       # one step for one model
npm run stage:3 -- --model calico              # one stage for one model
npm run stage:3                                # one stage for every model found in resources/
npm run stages                                 # everything for every model
```

**From a step to the end of the pipeline** (`--finish`; it crosses the following stages):

```bash
npm run stage:2:step:3 --finish                         # every model, from the base to the assembly plan
npm run stage:2:step:3 --finish -- --model calico       # one model
```

`npm` keeps `--finish` for itself and exposes it as `npm_config_finish`; the parser reads both forms. Step ids (`s2-step-3`, `s3-step-1`, …) are those of `pipeline.json`; `--step`, `--from-step` and `--stage` take them. The same can be run through Nx (`nx run papikapi-studio:stage:2:step:3`).

Before each step the orchestrator checks the files listed in the step's `inputs`. A step with a missing input is reported as `SKIP`, deletes nothing and the run carries on; only a step that ran and failed stops that model. When everything runs (no `--stage`, no `--step`), a step whose outputs exist is skipped, so nothing is regenerated or paid twice; a step flagged `skip_if_outputs_exist` (`s1-step-1`, a paid API) is skipped unless requested by name.

### Local API server for the Studio

```bash
npx nx run papikapi-studio:server      # backend on port 4502
npm start -- papikapi-studio           # Angular Studio, proxies /api to 4502
```

`POST /api/creator/generate`, `POST /api/creator/pick`, `GET /api/health`.

---

## 🧪 Checks

Read-only or temporary-output scripts to validate a change before regenerating anything. They never write to `resources/` or `public/` unless pointed there.

| Script | Purpose |
| --- | --- |
| `scripts/stage-2/checks/run_base.py <dir> <model…>` | runs `s2-step-3` into `<dir>` and prints the statistics |
| `scripts/stage-2/checks/envelope_report.py` | (Blender) lists the clusters outside the body envelope with their extents and surface share |
| `scripts/stage-2/checks/envelope_contour.py` | (Blender) writes the body envelope as a GLB, to look at the contour |
| `scripts/stage-2/checks/render_glb.py` | (Blender) renders a GLB from two sides and from above, texture or vertex colours |
| `scripts/stage-3/checks/run_simplify.py <dir> <model…>` | runs `s3-step-1` into `<dir>` and prints faces, volume, deviation, feature loss |
| `scripts/stage-3/checks/true_volume.py` | (Blender) volume change of reduced meshes with every polygon triangulated |
| `scripts/stage-3/checks/render_edges.py` | (Blender) renders a reduced mesh with its edges |
| `scripts/stage-3/checks/coplanar_pairs.py` | counts edges separating nearly coplanar faces |
| `scripts/stage-3/checks/base_settings.py` | prints a step's parameters plus a model's base as the settings JSON of the Blender scripts |

---

## 📊 Manifest & Accounting Structure

Every step writes `step-<n>-manifest.json` and merges into `public/models/<model>/manifest.json`:

```json
{
  "version": 1,
  "subject": "lion",
  "stages": {
    "s2-step-2": {
      "stageId": "s2-step-2",
      "at": "2026-09-24T15:02:51.707Z",
      "status": "DONE",
      "seconds": 25.54,
      "costUsd": 0.0041,
      "costNote": "RunPod RTX PRO 4500 SE ($0.58/hr)",
      "data": { "fileSize": 1849564, "format": "model/gltf-binary" }
    }
  },
  "totalSeconds": 25.54,
  "totalCostUsd": 0.0041
}
```

---

## 🛡️ Code Standards & Invariants

* **TRELLIS is the geometric truth.** Simplification never moves geometry toward the art; every geometry-changing pass is guarded by volume, deviation and feature-loss limits against the TRELLIS mesh and falls back to the previous result.
* **Strict TypeScript** with a dedicated `tsconfig.scripts.json`; identifiers, schemas and logs in English.
* **Self-documenting code**: clear names and small functions; the only comments are the usage lines at the top of the check scripts.
* **Physical limits in millimetres at print size**, never in mesh units.
* **Monorepo build gate**: `npm run check:build` must pass before a task is closed.
