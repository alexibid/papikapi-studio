# Kirigami 3D Model Construction — QA Stages & Validation Status

**Target File:** `model_construct.blend` (under `resources/<model_name>/`)  
**Aggregated Execution:** `npm run stage:pipeline` (or `npm run stage:<stage_num>`) from `apps/kirigami-studio`  
**Pipeline Specification:** [PIPELINE.md](file:///Users/alexsantos/Projects/ibid-workspace/tools/kirigami/stage/PIPELINE.md)  
**Core Invariant:** All scene elements across all stage collections are strictly preserved in the scene at all times. Non-active elements are hidden in viewport (`hide_viewport = True`). Outliner collections are automatically collapsed. Cameras and lights (`Stage Setup`) are hidden in viewport on save.

---

## Stages Matrix & Validation Status

| Stage | Name | Key Components | Active Elements (Visible) | Inactive (Viewport Hidden) | Execution Command | Validation Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Stage 0** | **Bounding Box & Clean Cutouts** | Bounding box parallelepiped ($L \times W \times H$), 6 planar cutouts with facet polygons, 8 quadrant wire blocks | `Bounding Box`, `Clean Cutouts`, `Quadrant Blocks` | All other stage collections (Mold, Extrusions, Tubes, Spheres, Reconstructed Mesh, Cameras, Lights) | `npm run stage:0` | **CLOSED & VERIFIED** ✅ |
| **Stage 1** | **Face Extrusions & Mold Merge** | Individual face extrusion solids per facet, trimmed inwards and merged into the unified solid mold (`Molde_Solid`) | `Base Mold` (`Molde_Solid`), `Face Extrusions` (face solids per view), `Bounding Box` (`Clean Cutouts`) | Quadrants, Tubes, Spheres, Reconstructed Mesh, Cameras, Lights | `npm run stage:1` | **CLOSED & VERIFIED** ✅ |
| **Stage 2** | **Orthogonal Raycast Tubes & Collisions** | Transparent raycast tubes, 1-to-1 unique HEX color pairing between origin circles and 3D collision markers | `Raycast Tubes` (`Tubes_Raycast_Transparent`, `Circles_Raycast_All`, `Collisions_Raycast_All`, `Circles_Contour_Blue`, `Circles_Interior_Green`), `Clean Cutouts` | Mold, Extrusions, Quadrants, Spheres, Reconstructed Mesh, Cameras, Lights | `npm run stage:2` | **READY FOR VALIDATION** ⏳ |
| **Stage 3** | **Quadrant Collisions & Spheres** | Tube intersections filtered strictly within the 8 octant quadrant blocks; contact and consolidated midpoint spheres | `Raycast Tubes`, `Contact Spheres`, `Consolidated Spheres`, `Bounding Box` (`Clean Cutouts`) | Mold, Extrusions, Reconstructed Mesh, Cameras, Lights | `npm run stage:3` | **PENDING** ⚪ |
| **Stage 4** | **Snapped Reconstructed Mesh** | 2D cutout mesh snapped directly to consolidated collision spheres | `Reconstructed Model`, `Consolidated Spheres`, `Bounding Box` | Mold, Extrusions, Tubes, Cameras, Lights | `npm run stage:4` | **PENDING** ⚪ |

---

## Detailed Procedures per Stage

1. **Stage 0: Bounding Box & Clean Cutouts**
   - **Procedure:** Establish bounding box dimensions from model extents. Project the 6 clean planar meshes flush on the 6 outer bounding box faces carrying all facet polygons with assigned materials. Setup 8 wireframe quadrant division blocks.
   - **Status:** Closed and verified by user.

2. **Stage 1: Face Extrusions & Mold Merge (`Molde_Solid`)**
   - **Procedure:** Extrude all facet polygons from the 6 outer clean cutouts inwards towards the center. Merge the face extrusions together into the unified solid mold (`Molde_Solid`), leaving the mold fully ready and clean.
   - **Active Objects:** `Molde_Solid` in `Base Mold`, individual face solids organized in `Face Extrusions` (`Faces Left`, `Faces Right`, `Faces Front`, `Faces Back`, `Faces Top`, `Faces Bottom`), and `Bounding Box` (`Clean Cutouts`).
   - **Status:** Closed and verified by user. Aggregated into the pipeline runner.

3. **Stage 2: Orthogonal Raycast Tubes & Collisions**
   - **Procedure:** Emit transparent orthogonal projection tubes perpendicularly from clean cutout vertices inwards. Calculate precise collision coordinates (first intersection with `Molde_Solid` for interior vertices; contour boundary envelope for contour vertices).
   - **Unique 1-to-1 HEX Color Pairing:** Assign a deterministic globally unique HEX color code to each vertex. The origin ring on the cutout plane and its corresponding 3D collision sphere share the identical HEX color, providing visual and programmatic traceability for retopology.
   - **Status:** Ready for user validation.

4. **Stage 3: Quadrant Collisions & Spheres**
   - **Procedure:** Calculate pairwise intersections between perpendicular tubes, filtering strictly between tubes originating in matching octant quadrants. Place collision markers at intersection midpoints and cluster within tolerance into consolidated spheres.

5. **Stage 4: Snapped Reconstructed Mesh**
   - **Procedure:** Snap the vertices of the clean cutout mesh to the consolidated sphere coordinates, locking the final 3D form directly from the 2D cutouts without arbitrary boolean degeneration.
