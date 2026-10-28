# Papikapi Studio — QA Stages & Validation Status

**Aggregated Execution:** `npx tsx scripts/stage-orchestrator.ts --stage <N>` (or `npx tsx scripts/stage-orchestrator.ts --stage <N> --model <name>`)
**Pipeline Specification:** [PIPELINE.md](PIPELINE.md) (still on the old stage numbering, to be rewritten)
**Configuration Source:** [pipeline.json](pipeline.json)
**Where results live:** every output of a figure goes to `resources/<model>/stage-N/step-N-name.*`, QA evidence to `resources/<model>/qa/cycle-N/`. A new step writes its own new file and never overwrites an earlier step's output.

---

## 📋 Stages Matrix & Validation Status

| Stage | Name | Key Components | Outputs | Validation Status |
| :--- | :--- | :--- | :--- | :--- |
| **Stage 1** | Alternatives, art selection, **TRELLIS input** | 3x2 axonometric grid, pick and crop; s1-step-3 cutout + white plinth + 4K canvas (`scripts/stage-1/python/trellis_input.py`) | `step-1-art*.jpeg`, `step-3-cutout.png`, `step-3-trellis-input.png` | s1-step-3 new; the image sent to TRELLIS is now a stage-1 output, no longer a loose file |
| **Stage 2** | Cutout, 3D generation, base cut | s2-1 RMBG cutout; s2-2 **TRELLIS.2** reads `stage-1/step-3-trellis-input.png` (`1536_cascade`, texture 4096, seed 1) on RunPod serverless; s2-3 base cut (3D plinth removal) | `step-1-art-cutout.png`, `step-2-3d.glb`, `step-3-base.glb` | `darth` under QA (cycle 2, REJECTED); other figures not re-run |
| **Stage 3** | Simplify, texturize, plinth | Simplify, facet colours / vectoriser, white plinth. | `step-1..3-*` | Not validated on TRELLIS.2 output |
| **Stage 4** | Unfold & sheets | Blender unfold, A4 sheets | `step-1-unfold`, `step-2-sheets` | Not re-run |
| **Stage 5** | Assembly fold plan | | `step-1-assembly` | Not re-run |

TRELLIS 1 is retired: the endpoint `papikapi-trellis` serves the image `ghcr.io/alexibid/papikapi-trellis2:latest` (private, pulled with the registry credential `github-registry`, a `read:packages` token). Keep the tokens split: one read-only token for RunPod, no write token stored anywhere.

---

## 👁️ The visual QA gate (`@visual-qa`)

The skill lives in `~/.agents/skills/visual-qa/` (symlinked to `~/.claude/skills/visual-qa`). It is an independent auditor: the builder never issues the verdict, and nothing reaches the user without a PASS.

**Rule: only what the art shows blocks.** The art is the single reference.
- Details the art **shows** (eyes with pupil, nose, mouth, facial markings, ears, visible paws, chest pattern) are measured on aligned crops and must pass.
- Details the art **does not show** (tail shape hidden by the body, back side, belly) are `visibility: "hidden"` in the regions file. They are reported as `N/A`, never fail, and only need general plausibility (connected to the body, no fragments or holes, coherent colour). The auditor confirms from the art that the detail really is invisible; the builder cannot mark a visible detail as hidden.

**Tools** (`~/.agents/skills/visual-qa/scripts/`): `audit_regions.py` (blocking gate: colour dE, structure, dark-shape IoU, sharpness, pupil probe, per region), `fit_render.py`, `inspect_camera.py`. Needed for a figure whose model has no plinth while the art has: `--camera <az> <el>` and `--art-floor-y <row where paws touch the ground>`. Regions are data (`scripts/stage-3/checks/regions-<figure>-<art>.json`, boxes in art pixels).

**Two gates, both blocking:** G-BASE (raw generator output: pose, proportions, clean mesh) and G-FINAL (final texture: every visible detail passes the measurements and the visual inspection).

### Closed approval loop

| Role | Can | Cannot |
|---|---|---|
| Builder | edit `scripts/`, run the pipeline into `resources/<model>/`, produce a candidate | publish to `public/models/`, edit approval files, issue the verdict |
| Checks (deterministic scripts in `scripts/stage-3/checks/`) | measure airtight, `openEdges`, normals, volume and deviation, silhouette IoU, per-region dE, face count | approve by themselves |
| `@visual-qa` (fresh context each cycle, read-only) | read renders and check JSON, write one report and verdict | edit project files, see the builder's explanations |
| Publisher | copy a candidate to `public/models/<model>/` only if the approval matches the GLB hash | publish otherwise |

One cycle: a named hypothesis, run on the validation set, hard checks first, then the visual verdict, then user. A defect that persists with the same root cause is a repeat blunder and needs a different hypothesis. After 5 cycles without improvement in the weakest region, present a stall report instead of a failing model. A cycle may not lower a region that previously passed.

---

## ✅ TRELLIS.2 acceptance: same quality as the official Space (2026-10-27)

Reference: the official Space preview (huggingface.co/spaces/microsoft/TRELLIS.2, Resolution 1024, Randomize Seed, Decimation 500000, Texture 2048). "Same quality" is the finish, not the same cat: every seed gives a slightly different shape. Compared side by side, same scale, same light (forest HDRI, front view at 1024 px), point by point:

1. **Eyes well defined:** sharp yellow iris, well-drawn slit pupil, clean outline, no grey, no smear.
2. **Clean fur and texture:** even black, even white, no noise, grain, green or bluish stains, no dirty facets.
3. **Colours true to the input:** the same yellows, blacks, whites and pinks, no bluish or metallic cast.
4. **Sharp face details:** nose, mouth, the white blaze between the eyes and the chin as in the Space.
5. **Clean shape:** closed facets, no holes or loose pieces, well-formed paws, ears and tail.

Any point below the Space is reported with its cause before moving on.

**Run 2026-10-27 15:02, Space image on RTX 4090** (`ghcr.io/alexibid/papikapi-trellis2@sha256:6d59606d…`, the public Space image `registry.hf.space/microsoft-trellis-2@sha256:b736194e…` plus the 5 CUDA extensions rebuilt for sm_89 from the Space wheels' commits, weights and runpod 1.12.0; seed 1207894639; input `stage-1/step-3-trellis-input.png`). Evidence in `resources/darth/qa/trellis2-space-build/`.

1. Eyes: yellow iris with a dark slit, but the slit is soft and doubled and the outline is blurry; below the Space. **Fail.**
2. Fur and texture: blacks and whites even, no noise, but a gold stripe on the back of the neck that the input does not have; **fail.**
3. Colours: black and white true; ear insides lilac where the input is grey. **Partial.**
4. Face: nose, mouth, blaze between the eyes and chin mark present and readable. **Pass.**
5. Shape: tail, ears and paws well formed, but the mesh is open (63 boundary edges, 475 non-manifold edges, 5 islands). **Fail.**

The input is the same art as the Space screenshot (the Space shows transparency as black; `step-3-trellis-input.png` is the cleaner cut of the same image). The seed is random, as agreed: the target is the same quality, not the same cat. Result: below the Space on points 1, 2 and 5. Those files were deleted with the whole `stage-2`.

**Run 2026-10-27 15:24, same image, clean stage 2** (seed 67108501, 491 717 faces; base cut 475 950 faces). Builder's read, not a `@visual-qa` verdict:

1. Eyes: big yellow irises with one dark pupil each and a clean outline, like the Space; the pupil is a soft oval rather than the Space's sharp slit. **Close to the Space.**
2. Fur and texture: even black and white, no stripes or stains. The grain in `step-3-views` is Blender render noise, not texture. **At the Space level.**
3. Colours: black, white, yellow eyes and grey-pink ear insides, true to the input. **At the Space level.**
4. Face: nose, mouth, blaze between the eyes and black chin present and sharp. **At the Space level.**
5. Shape: clean facets, ears, tail and four paws well formed; after the base cut the mesh is still open (16 open edges, 60 non-manifold edges). **Open mesh.**

Conclusion: quality varies with the seed far more than with the build or the GPU; this run matches the Space finish except the pupil sharpness and the open mesh.

---

## 👁️ s2-step-4 Details (2026-10-27)

TRELLIS re-imagines small details (darth: vertical eyes, the art has horizontal almonds). `s2-step-4` repaints them from the art on the texture only; the mesh is untouched. Today it handles the eyes: the visible eye of the art, mirrored on both, sized by the art's eye-height / figure-height ratio (darth 5.19%). Output `stage-2/step-4-details.glb` + `step-4-views/`; stage 3 now reads this file. Detection is by iris colour, so dark eyes, eyes with white sclera and profile art are not covered yet. The generic transfer of any essential detail from the art is the planned replacement, after darth is finished. Not yet through `@visual-qa`.

---

## 📐 s3-step-1 Simplify shape and texture (2026-10-27)

Stage 3 now starts from `stage-2/step-4-details.glb` and simplifies both the shape and the texture.

**Shape.** TRELLIS.2 meshes are hollow (every wall is two surfaces 2-3 mm apart), which is why decimation lost 30-55% of the volume and got stuck near 55k faces. The step:
1. keeps the outer surface only: faces from which a ray escapes (the ground counts as closed, so the open paws from the base cut don't count);
2. closes it with a 2.5 mm voxel remesh (it lands within 11 mm of the original);
3. searches for the fewest faces that pass the gates: volume ±1%, dimensions ±1%, feature loss ≤ 1.5% of the length, airtight. Decimation shrinks the figure, so the volume is restored by a uniform offset along the normals. If a gate fails, the step stops.

The hand-written `"darth"` tail rule is gone.

**Texture.** The texture is baked from the detailed model onto fresh UVs, with metallic cut because the diffuse bake darkened white to 0.69. The atlas is then simplified:
- colour families from the stage-3 palette (neutral chroma 5, so the pale pink ears stay pink);
- a majority filter within each face;
- low-contrast specks absorbed;
- details (rare colours and what they enclose, plus coloured texels the palette greyed out) keep their baked colours;
- borders softened by one texel, and colours bled past each face.

**darth result:** 619 faces (319 quads), volume −0.03%, dimensions 0.4%, feature loss 9.6 mm, airtight. Colours are black, white, pink and yellow, with the eyes intact. The white collar on the nape comes from TRELLIS (stage 2). Evidence is in `resources/darth/stage-3/step-1-views/`; the close-up check is `scripts/stage-3/checks/render_closeup.py`. The old figures averaged 314 faces and none had a volume check. s3-step-2 (texturize) still has to be redecided on top of this output.

**@visual-qa, G-FINAL partial (isolated agent, 2026-10-27): ❌ REJECTED, 52/100.** The step-1-reduce gate fails 9 of 14 regions; step-4-details (stage 2) on its own already fails 10 of 14. Evidence is in `resources/darth/qa/stage-3-step-1/`, with regions in `regions-darth-1024.json`.

What stage 3 does well:
- the mesh is closed;
- the silhouette matches stage 2 (IoU 0.98);
- grain, streaks and specks are gone.

Defects created by stage 3:
1. nose and mouth broken by the majority filter;
2. right iris blurred;
3. a facet edge crosses the left iris;
4. the blaze is wider and soft;
5. the black rim of the ears is lost;
6. the front paws lost the volume of the foot;
7. small bites in the belly and the bib;
8. the soles are grey #7f7b7d.

Defects that come from stage 2:
- left pupil 0.49× the art;
- nose and mouth already differ;
- ear interior colour and shape;
- blaze already soft;
- bib and belly shape;
- no toes;
- white collar on the nape.

Face budget: halving to about 310 faces (`half-faces/`, 307 faces) keeps the volume at −0.29% and the dimensions at 0.92%. The feature loss is 27.6 mm, at the paw outlines on the ground.

**Cycle 2 (same day).** At the user's request, only volume and dimensions (≤1%) and closure block now. Feature loss is reported but no longer blocks, and the reduction starts at 430 triangles, which gives 307 faces (123 quads), volume −0.29% and dimensions 0.92%.

Texture changes:
- colour comes from the closest point with bilinear interpolation (`transfer: "nearest"`). The ray bake took colour from the wrong side of concave areas, which widened the blaze and cracked the mouth;
- the majority filter is replaced by a 3 px smoothing of family borders, so the stair-stepped edges are gone;
- the grey soles are gone, and the 5 colour families are black, white, pink and two yellows for the eyes.

The @visual-qa cycle 2 audit is in `resources/darth/qa/stage-3-step-1-cycle-2/`. Verdict: ❌ REJECTED, 40/100. The gate fails 8 of 14 regions (cycle 1: 9; stage 2: 10).

Fixed since cycle 1: the ears pass, the iris is no longer cut by a fold in close-up, the dark bite in the belly is gone and the soles are no longer grey.

Repeated (critical recurrence): the nose and mouth are now separated, the right iris is soft (0.31×) and the blaze is stair-stepped.

New defects from stage 3:
- stair-stepped edges from closest-point sampling;
- a pink stripe on the right side of the head (ear colour picked up by a head face);
- a white dot on the forehead;
- a white chip from the blaze touching the left eye.

The auditor asks for a different hypothesis, not more parameter tuning: vector patches (one Bezier path per patch) for the edges and the details, and a closest-point transfer that respects face orientation.

---

## 📏 Figure QA: volume and parts (2026-10-28)

Rule from the user: what matters is that the volume is kept (≤1% PASS, 1-2% WARN, >2% FAIL) and that every element (paws, wheels, tail, ears...) is still there. A base cut that takes part of the body must fail. Facets and shading are never judged.

`scripts/qa/figure_qa.py` runs it on every figure; the Blender side is `scripts/qa/blender/figure_masks.py`.

**Volume.** The simplified figure (stage 3) is compared with the exact shape stage 3 simplified (from its manifest). The volume is measured by vertical columns through the outer surface, which tolerates holes and hollow TRELLIS walls. Figures made of overlapping blocks (more than 10% of columns crossing an odd number of walls) use a voxel union instead.

**Parts.** Silhouettes from six views:
- TRELLIS above the cut plane against the base, so the cut must keep every part;
- the base against the simplified figure, so the simplification must keep every part.

The largest missing piece decides: up to 0.4% of the silhouette is PASS, up to 1% is WARN, above that is FAIL.

Rules learnt from false positives:
- TRELLIS and base are aligned by vote, then refined vertex by vertex (the cut only translates);
- loose leftovers on the plinth are ignored (pieces under 10% of the body);
- perfectly flat panels (flatness < 0.002) are ignored, because the cut is right to remove them.

The test is `scripts/qa/check_figure_qa.py`: darth with one leg removed must FAIL (it does: 9.2% missing) and intact darth must PASS. Evidence is in `resources/<figure>/qa/figure-qa/`, the summary in `resources/qa-summary/figure-qa.json`.

**Extra pieces (added 2026-10-28).** Each comparison also looks for pieces that are added: in the cut, a plinth leftover; in the simplification, a face that bridges a gap. The largest missing or extra piece decides.

**Corrections (2026-10-28), all with the current code:**
- giraffe: the base was redone (the old base had lost the tail);
- steve: the base was redone after a fix to s2-step-3. When TRELLIS makes a separate plinth, the cut only flattened the contact band and kept a zero-thickness sheet under the feet (two coincident layers at z = 0). A solid figure never has floor faces looking up, so when they exist (≥0.5% of the footprint), every floor face goes and the soles are capped on the leg walls (`remove_ground_sheet`);
- giraffe, fire-truck, steve, cow, police-car and hammerhead-shark: stage 3 redone with the new s3-step-1; darth regenerated with the same code.

Fixes to s3-step-1 that came out of this:
1. A large enclosed block is only an inner wall when the outer wall is within 0.6% of the length along its normals. The truck is not hollow, but 41% of its surface was being removed.
2. The step stops if closing the shape moves it more than 2% away.
3. Figures without `step-4-details.glb` fall back to `step-3-base.glb` (`fallback_model_resource`, also understood by `step-inputs.ts`).
4. Neutral lightness tolerance 18, so a grey body and a white belly stay apart.
5. The colour of each family is the median of its texels; the vectoriser's palette lifted light families to white and turned the grey shark white.

| Figure | Faces | Volume (QA) |
|---|---|---|
| giraffe | 373 | −0.23% |
| fire-truck | 535 | −0.23% |
| steve | 349 | +0.15% |
| cow | 337 | +0.15% |
| police-car | 364 | −0.03% |
| hammerhead-shark | 315 | 0.00% |
| darth | 307 | −0.29% |

Renders: `resources/qa-summary/corrected-figures.png`.

**Result on the 54 figures (full run):** 44 PASS, 9 WARN, 0 FAIL, 1 without data.

| Verdict | Figure | Cause |
|---|---|---|
| ⚠️ WARN volume | ankylosaurus −1.66%, octopus −1.53%, dalmatian −1.25% | |
| ⚠️ WARN parts (<1%) | brachiosaurus, plane, stegosaurus (cut); dolphin, hippo, raccoon, stegosaurus (simplification) | |
| ⛔ no data | tractor | no stage-2 base |

Stage 4 and 5 of the seven figures regenerated in stage 3 still come from the old stage 3, so they are stale. It is not yet checked whether s3-step-2/3 run on top of the new s3-step-1 output.

All failures and the four false positives found along the way (lion, white-kitten, dolphin, hammerhead-shark) were checked against coloured renders and the art.

---

## 🖼️ Input image of TRELLIS (stage 1, found 2026-10-26)

FLUX.2-klein renders each alternative at 512 px, so the chosen art is 486 px; the 4K sent to the first TRELLIS.2 run was an 8x upscale of that. In that run the plinth had been whitened by a hue mask written ad hoc in the scratchpad: it turned the pink belly shadow white, ate the haunch/back-paw edges and left orange fringes on the paws. Those defects came into the 3D (pink soles, white streak, broken haunch, failing paws) and were being chased downstream. Now `s1-step-3` does it generically: RMBG cutout, soft Lab membership of the plinth (only the slab component and a 4 px fringe around it, so belly pink is kept), shading-preserving whitening, tight crop, 4096 canvas, premultiplied Lanczos. Run 1 evidence is kept in `resources/darth/archive-run-1/`. The remaining limit is FLUX itself: real detail is 486 px; a higher-resolution FLUX pass (needs a new FLUX image) is the next lever if the muzzle stays weak.

---

## 🧾 Audit findings (art → TRELLIS → stage 3, model `darth`)

Scope: one model (`darth`, tuxedo cat). The texture loss was never caused by simplification: TRELLIS produced good colours and stage 3 threw them away.

**Stage 3 (root cause)**
- `texturize` reduced the colour to 3 flat tones and 134 paths, then on `darth` overwrote facet colours with hand-written rules (`"darth" in reduce_json`, absolute coordinates for bib, ears, tail). It ignored the art and cannot place eyes, nose or lips. View selection also hard-wired cat anatomy (`z > 55%` head). Both break the generic-pipeline invariant and must be deleted.
- Facet colour is a medoid of TRELLIS texels, so a 20 px eye becomes the neighbour colour. Synthetic eyes (`make_almond_eye`) are the opposite of matching the art. Small features need UV-atlas detail, large patches flat colour, one Bezier path per patch.
- `texture_mode: "art"` (silhouette fit, atlas) exists but was not used. Manifests reported DONE with `openEdges: 6`, `maxDeviationMm 251.97`, `featureLossMm 72.65`: no step has a gate that stops the run.

**Stage 2**
- The plinth was removed in 2D before TRELLIS by a colour heuristic (hue 2..40, bottom 45%) that deletes orange or tan parts of other figures, re-crops the image and overwrites the art in place. Fixed: the plinth stays in the TRELLIS input (white, so it does not contaminate the body colour) and is removed in 3D afterwards.
- TRELLIS 1 (518 px conditioning, 64³ voxels) lost muzzle and pupils by resolution. Replaced by TRELLIS.2 with a 4K white-plinth input, `1536_cascade` and texture 4096. One run per figure, seed 1, no seed lottery.

**QA process**
- The skill was outside the repo and unregistered, the rule demanded another tool's `read_file` and `/tmp`, the gate had no numbers, hidden sides were judged against a reference that does not exist (now handled by `visibility`), and earlier PASS verdicts came from the session that built the fix.

---

## 🐈 `darth` status (reset 2026-10-26)

The art-bake path was wrong and was deleted (code, outputs and QA evidence of runs 1 and 2 under `resources/darth/stage-2` and `qa`). What stays: the corrected stage-1 input (`resources/darth/stage-1/step-3-trellis-input.png`) and the run-1 archive. The next TRELLIS.2 run (s2-step-2 reads that input) starts from a clean `stage-2`. Open question from the run with the corrected input: `1536_cascade` runs out of the 24 GB GPU, `1024_cascade` fits.

---

## ➡️ Next steps

1. Run s2-step-2 and s2-step-3 on the corrected input, then the `@visual-qa` gate (regions in `scripts/stage-3/checks/regions-darth-pick3-4k.json`, boxes shifted +33,+45 for the new canvas).
2. Delete the `"darth"` branch and cat thresholds in stage 3, add manifest gates that stop a run, rewrite `PIPELINE.md` to the current numbering.
3. Only after `darth` passes G-FINAL, run the same chain unchanged on `bear`, `orange-tabby` and a dinosaur, then the remaining figures.

---

## 🎯 Model Validation Results (historical batch, TRELLIS 1)

Batch of 2026-09-24, run with the old one-step Stage 2 on an RTX PRO 4500 Blackwell. Kept for cost reference only; none of these models were validated against the art.

| Model | Processing Time | Cost (USD) | Output 3D Mesh (.glb) |
| :--- | :--- | :--- | :--- |
| bear | 19.34s | $0.0031 | 1.10 MB |
| cheetah | 21.09s | $0.0034 | 1.55 MB |
| dalmatian | 18.41s | $0.0029 | 1.43 MB |
| fox | 22.96s | $0.0037 | 1.56 MB |
| giraffe | 16.45s | $0.0026 | 1.36 MB |
| lion | 25.54s | $0.0041 | 1.76 MB |
| police-car | 19.57s | $0.0031 | 1.37 MB |
| t-rex | 16.67s | $0.0027 | 1.40 MB |
