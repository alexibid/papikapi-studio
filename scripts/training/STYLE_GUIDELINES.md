# Kirigami Studio — Visual Style Guide & Agent Quality Evaluation Directives

This document serves as the **single source of truth** and authoritative specification for the visual style of Kirigami Studio 3D models. It synthesizes the visual DNA across all 54 reference models in `scripts/training/references/` (dogs, cats, safari, forest, ocean, dinosaurs, vehicles, games, minecraft) and defines the exact verification rubric that any evaluating agent must follow before approving an asset.

---

## 🎨 Part 1: Visual Style Architecture (Studio DNA)

### 1. Low-Poly Planar Papercraft Geometry
- **Planar Facets**: All models are constructed from clean planar geometric polygons (the aesthetic of physical cardstock origami / folded papercraft sculpture).
- **Macro-Volumes**: Heads, bodies, wings, vehicle chassis, and limbs are composed of bold, simplified closed polyhedra.
- **Zero Black Crease Lines / Zero Wireframe**: While raw assembly diagrams (Pepakura) show black cut/score lines, finished studio assets exhibit **ABSOLUTELY ZERO black crease lines, ZERO wireframe strokes, ZERO fold guide markings, and ZERO cartoon outline ink borders**. Facet boundaries are delineated strictly by natural flat directional lighting between adjoining planes.
- **Solid Matte Cardstock Palette**: Solid, opaque, vibrant paper colors. No noisy procedural textures, no photographic overlays, and no glossy plastic reflections.

### 2. 100% Closed Geometric Volumes
- **Solid Primary Blocks**: Muzzles, jaws, hulls, and appendages are solid closed geometric blocks suitable for physical folding.
- **Closed Mouths**: All mouths and muzzles are closed volumes. There are no hollow interior mouth cavities or complex open gullets.

### 3. Flat 2D UV Texture Decals (Zero 3D Spikes)
- All micro-details are illustrated **100% flat** directly onto facet surfaces as 2D printed decals (UV map style):
  - **Teeth & Claws**: Flat sawtooth decals printed along closed jawlines and paw surfaces; NEVER separate 3D spikes or cutouts protruding into the air.
  - **Markings**: Spots (dalmatian, cheetah), stripes (zebra, tiger, tabby), patches (calico, cows), and masks (pug, raccoon) are printed flat onto closed facets.
  - **Mechanical Details**: Headlights, grills, portholes, cockpit windows, and dials are illustrated flat onto vehicle hull facets.

### 4. Expressive Studio Eyes
- For all living characters and animals, there are **EXACTLY TWO** eyes (never three, never one, never floating).
- Eyes are stylized, large, cute, round decals with a prominent circular white catchlight reflection printed flat onto head facets.

### 5. Universal Perspective & Stance
- **Strict 3/4 Isometric Perspective**: Every figure is viewed from an isometric angle from the top-left corner, simultaneously revealing:
  - Top plane (back, roof, dorsal ridge)
  - Front plane (face, chest, grille)
  - Lateral flank (side body, doors, wings, legs)
- **Complete Object (Zero Busts / Zero Cropping)**:
  - The complete subject is 100% visible from end to end within its cell.
  - Generous padding margin around all sides.
  - Animals: All 4 paws (or hind legs for bipeds), torso, head, and tail fully rendered and grounded.
  - Vehicles: Entire fuselage/chassis, all wheels/treads, wings, and tailfins fully visible.
  - Never a bust, never a headshot, never a truncated torso, never severed at the frame edge.

### 6. Background & Lighting
- **Seamless Neutral Background**: Completely plain, uniform light grey (`#E5E5E5`).
- **Shadowless Display**: ABSOLUTELY ZERO cast floor shadows, drop shadows, dark contact patches, or ground ambient occlusion beneath figures. The subject rests cleanly in pure space.

---

## 📐 Part 2: The Alternatives Sheet Matrix (3x2 Grid)

Every model generation session produces a 1536x1024 sheet with exactly 6 cells (3 columns × 2 rows). The sheet must exhibit a deliberate, visible progression across columns:

```
┌─────────────────────┬─────────────────────┬─────────────────────┐
│  COL 1: BABY/CHIBI  │ COL 2: CHILD/YOUTH  │ COL 3: SIGNATURE    │
│  Row 0, Col 0       │ Row 0, Col 1        │ Row 0, Col 2        │
│  (Cell 1)           │ (Cell 2)            │ (Cell 3 / Pick #3)  │
├─────────────────────┼─────────────────────┼─────────────────────┤
│  COL 1: BABY/TOY    │ COL 2: PLAYFUL      │ COL 3: STRUCTURED   │
│  Row 1, Col 0       │ Row 1, Col 1        │ Row 1, Col 2        │
│  (Cell 4)           │ (Cell 5)            │ (Cell 6)            │
└─────────────────────┴─────────────────────┴─────────────────────┘
```

### Column Specifications
1. **Column 1 (Left - Cells 1 & 4)** — **Baby / Chibi / Toy**:
   - Exaggerated infant proportions: oversized round head, chubby compact body, short cute limbs, baby-like innocence.
2. **Column 2 (Center - Cells 2 & 5)** — **Child / Youthful**:
   - Intermediate active proportions: energetic, playful, cheerful demeanor.
3. **Column 3 (Right - Cells 3 & 6)** — **Signature / Reference Replica**:
   - **Cell 3 (Default Pick #3)**: Exact replica of the reference model from `scripts/training/references/`. Balanced geometric proportions, authentic colors, signature markings, rendered in clean papercraft with zero crease lines.
   - **Cell 6**: Structured, mature, elegant low-poly interpretation.

---

## 🔍 Part 3: Agent Validation Checklist & Scoring Rubric

The evaluating agent must run through this checklist before approving any generation batch:

### Mandatory Gate Checks (Pass / Fail)

| # | Check Item | Pass Criteria | Failure Disqualification |
| :--- | :--- | :--- | :--- |
| **G1** | **Complete Subject** | 100% of subject visible from end to end with margin. | ❌ Any cell is a bust, headshot, or has cropped paws/tail/wings. |
| **G2** | **Zero Wireframe / Creases** | Facet boundaries defined by light/shading only. | ❌ Any cell displays black crease lines, fold guides, or wireframe lines. |
| **G3** | **3/4 Isometric Perspective** | Uniform top-left 3/4 axonometric viewpoint across all cells. | ❌ Eye-level, flat front, side profile, or high top-down views. |
| **G4** | **True Progression (No Clones)**| Clear visual progression: Baby (Left) $\rightarrow$ Youth (Center) $\rightarrow$ Mature Signature (Right). | ❌ The 6 cells are identical or near-identical clones with same proportions. |
| **G5** | **Zero Floor Shadows** | Plain `#E5E5E5` ground with zero dark cast shadows or contact patches. | ❌ Any dark drop shadow or floor ambient occlusion beneath figures. |
| **G6** | **Decal Micro-Details** | Teeth, spots, whiskers, markings are flat 2D surface decals. | ❌ 3D spikes, jagged tooth extrusions, or open mouth cavities. |

### Scoring Rubric (1 to 5)

- **Score 5 (Perfect - Approved for LoRA)**:
  - Passes all 6 Gate Checks.
  - Cell 3 (Pick #3) is an authentic, clean replica of the training reference.
  - Columns 1 and 2 show delightful, distinct baby and youthful variations.
  - Crisp planar facets with pure solid papercraft colors and cute expressive eyes.
- **Score 4 (Good - Approved for LoRA with minor notes)**:
  - Passes all 6 Gate Checks. Minor styling differences in secondary cells, but Pick #3 and progression are solid.
- **Score 3 or lower (Rejected - Retrying Required)**:
  - Fails any Gate Check (e.g. clone repetition, cropped limb, black fold line, or incorrect perspective).
  - Must trigger prompt recalibration and regeneration.
