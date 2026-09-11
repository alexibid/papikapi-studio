# Master Pipeline Architecture & Manufacturing Routing

**System:** Automated Digital 3D Papercraft Factory[span_0](start_span)[span_0](end_span)  
**Document Standard:** Hybrid arc42 / ISO 9001 Process Routing[span_1](start_span)[span_1](end_span)  
**Revision:** 2.3[span_2](start_span)[span_2](end_span)  
**Language:** English[span_3](start_span)[span_3](end_span)

---

## 1. Master Production Chain Overview

This factory transforms a creative text prompt (such as "Cute Low-Poly Baby Lion") into two synchronized products[span_4](start_span)[span_4](end_span):

1. **A physical papercraft kit:** Printable A4 sheets with numbered parts, fold lines, and glue tabs[span_5](start_span)[span_5](end_span).
2. **A digital 3D folding guide:** An interactive web screen where users watch the paper model fold together step by step[span_6](start_span)[span_6](end_span).

### Production Line Status

- **Stations 01 to 06:** `WIP` (Work in Progress — currently being implemented and calibrated)[span_7](start_span)[span_7](end_span).
- **Stations 07 to 10:** `ON HOLD` (Planned — scheduled once the upstream 3D mesh is locked)[span_8](start_span)[span_8](end_span).

````text
====================================================================================================
                                FACTORY WORKFLOW & STATUS DASHBOARD
====================================================================================================

 [ USER PROMPT ]  --> "Cute Low-Poly Baby Lion"
        |
        v
 [STATION 01] ------> BLUEPRINT DRAWER (Gemini 6-View Grid)                 [STATUS: WIP]
        |
        v
 [STATION 02] ------> SILHOUETTE CUTTER (Background Remover)                [STATUS: WIP]
        |
        v
 [STATION 03] ------> COLOR PALETTE READER (Color Extractor)                [STATUS: WIP]
        |
        v
 [STATION 04] ------> 3D SOLID MAKER (TripoSR 3D Builder)                   [STATUS: WIP]
        |
        v
 [STATION 05] ------> FLAT TILE CARVER (Low-Poly Sculptor)                  [STATUS: WIP]
        |
        v
 [STATION 06] ------> SURFACE COLOR PAINTER (Facet Colorizer)               [STATUS: WIP]
        |
 ================================= PRODUCTION MILESTONE BOUNDARY ===================================
        |
        v
 [STATION 07] ------> BOX UNFOLDER (Paper Pattern & Tab Generator)          [STATUS: ON HOLD]
        |
        v
 [STATION 08] ------> PAGE LAYOUT OPTIMIZER (A4 Sheet Packer)              [STATUS: ON HOLD]
        |
        +-----------------------------------+-----------------------------------+
        |                                                                       |
        v                                                                       v
 [STATION 09: PHYSICAL KIT]                                             [STATION 10: DIGITAL TWIN]
 PDF CRAFT BOOKLET MAKER                                                3D FOLDING WEB COACH (Three.js)
 [STATUS: ON HOLD]                                                      [STATUS: ON HOLD]
 Output: Ready-to-Print A4 Booklet                                      Output: Interactive Folding Guide
====================================================================================================
```[span_9](start_span)[span_9](end_span)

---

## 2. Station-by-Station Routing Specifications

### Station 01: Blueprint Drawer
* **Technical ID:** `SYS-STN-01`[span_10](start_span)[span_10](end_span)
* **Current Status:** `WIP`[span_11](start_span)[span_11](end_span)
* **What it does:** Uses AI (Gemini) to generate a drawing of the character viewed from 6 synchronized perspectives (Front, Back, Left, Right, Top, and Bottom) on a single sheet[span_12](start_span)[span_12](end_span).
* **Why we need it:** To construct an accurate 3D model, the factory must observe the character from all sides under uniform, shadowless lighting[span_13](start_span)[span_13](end_span).

```text
  [ User Text Prompt ]
           |
           v
  +-------------------------------------------------------------+
  | SYS-STN-01: BLUEPRINT DRAWER                 [STATUS: WIP]  |
  | - Reads the text idea.                                      |
  | - Sets flat studio lighting with no ground shadows.         |
  | - Draws all 6 viewpoints on a single reference sheet.       |
  +-------------------------------------------------------------+
           |
           v
  [ Output: 6-View Reference Sheet Image ]
```[span_14](start_span)[span_14](end_span)

* **Input:** Text prompt describing the character[span_15](start_span)[span_15](end_span).
* **Output:** A single image showing the 6 viewpoints[span_16](start_span)[span_16](end_span).
* **Next Station Rule:** All 6 views must show the same character in identical proportions, pose, and scale[span_17](start_span)[span_17](end_span).

---

### Station 02: Silhouette Cutter
* **Technical ID:** `SYS-STN-02`[span_18](start_span)[span_18](end_span)
* **Current Status:** `WIP`[span_19](start_span)[span_19](end_span)
* **What it does:** Automatically cuts around the character, stripping away background walls, ground surfaces, and cast shadows[span_20](start_span)[span_20](end_span).
* **Why we need it:** If the floor or shadows remain, downstream 3D reconstruction tools mistakenly turn them into solid geometry, warping the toy[span_21](start_span)[span_21](end_span).

```text
  [ 6-View Reference Sheet Image ]
           |
           v
  +-------------------------------------------------------------+
  | SYS-STN-02: SILHOUETTE CUTTER                [STATUS: WIP]  |
  | - Identifies the outer boundary of the character.           |
  | - Removes backgrounds, floors, and shadows.                 |
  | - Leaves only the clean figure on a transparent canvas.     |
  +-------------------------------------------------------------+
           |
           v
  [ Output: Clean Cutout Image with Transparent Background ]
```[span_22](start_span)[span_22](end_span)

* **Input:** The 6-view image from Station 01[span_23](start_span)[span_23](end_span).
* **Output:** Cutout image where only the subject is visible on a transparent background[span_24](start_span)[span_24](end_span).
* **Next Station Rule:** Background transparency must be complete with zero shadow artifacts[span_25](start_span)[span_25](end_span).

---

### Station 03: Color Palette Reader
* **Technical ID:** `SYS-STN-03`[span_26](start_span)[span_26](end_span)
* **Current Status:** `WIP`[span_27](start_span)[span_27](end_span)
* **What it does:** Scans the clean character cutout and groups all pixels into a set of clean, solid swatches (e.g., main body, mane, belly, nose)[span_28](start_span)[span_28](end_span).
* **Why we need it:** Papercraft requires crisp, solid colors on each face rather than blurry photo textures or random pixel noise[span_29](start_span)[span_29](end_span).

```text
  [ Clean Cutout Image ]
           |
           v
  +-------------------------------------------------------------+
  | SYS-STN-03: COLOR PALETTE READER             [STATUS: WIP]  |
  | - Scans all visible pixels across the character.            |
  | - Groups colors into main solid tones (e.g., orange, brown).|
  | - Builds a reusable palette list for assembly.              |
  +-------------------------------------------------------------+
           |
           v
  [ Output: Identified Color Swatch List ]
```[span_30](start_span)[span_30](end_span)

* **Input:** Clean cutout image from Station 02[span_31](start_span)[span_31](end_span).
* **Output:** A list of primary and secondary colors identified for the model[span_32](start_span)[span_32](end_span).
* **Next Station Rule:** Colors must be distinct so different parts of the toy are easy to differentiate[span_33](start_span)[span_33](end_span).

---

### Station 04: 3D Solid Maker
* **Technical ID:** `SYS-STN-04`[span_34](start_span)[span_34](end_span)
* **Current Status:** `WIP`[span_35](start_span)[span_35](end_span)
* **What it does:** Converts the flat cutout views into a continuous, watertight 3D digital sculpture (using TripoSR)[span_36](start_span)[span_36](end_span).
* **Why we need it:** You cannot fold a 2D drawing[span_37](start_span)[span_37](end_span). Creating a real 3D solid digital body first resolves measurement mismatches and guarantees the toy can exist in physical space[span_38](start_span)[span_38](end_span).

```text
  [ Clean Cutout Image ]
           |
           v
  +-------------------------------------------------------------+
  | SYS-STN-04: 3D SOLID MAKER (TripoSR)         [STATUS: WIP]  |
  | - Reconstructs depth and volume from the flat drawings.     |
  | - Fills in hidden angles to form a complete figure.         |
  | - Produces a solid 3D digital statue with no surface holes. |
  +-------------------------------------------------------------+
           |
           v
  [ Output: Raw 3D Digital Sculpture ]
```[span_39](start_span)[span_39](end_span)

* **Input:** Clean cutout image from Station 02[span_40](start_span)[span_40](end_span).
* **Output:** A complete watertight 3D digital sculpture file[span_41](start_span)[span_41](end_span).
* **Next Station Rule:** The 3D model must be completely closed with zero open holes or internal intersecting faces[span_42](start_span)[span_42](end_span).

---

### Station 05: Flat Tile Carver
* **Technical ID:** `SYS-STN-05`[span_43](start_span)[span_43](end_span)
* **Current Status:** `WIP`[span_44](start_span)[span_44](end_span)
* **What it does:** Simplifies the smooth, curved 3D sculpture into flat geometric panels (low-poly tiles) inside Blender[span_45](start_span)[span_45](end_span). The level of detail adapts dynamically to the quality and features generated by the Gemini prompt[span_46](start_span)[span_46](end_span).
* **Why we need it:** Paper cannot bend across smooth spherical curves; it only folds along straight edges between flat surfaces[span_47](start_span)[span_47](end_span). Every face must be a flat piece of paper[span_48](start_span)[span_48](end_span).

```text
  [ Raw 3D Digital Sculpture ]
           |
           v
  +-------------------------------------------------------------+
  | SYS-STN-05: FLAT TILE CARVER (Blender)       [STATUS: WIP]  |
  | - Analyzes the character's main shape and features.         |
  | - Replaces thousands of smooth curves with flat tiles.      |
  | - Ensures every single polygon is 100% flat like cardstock. |
  +-------------------------------------------------------------+
           |
           v
  [ Output: Low-Poly 3D Model with Flat Facets ]
```[span_49](start_span)[span_49](end_span)

* **Input:** Raw 3D model from Station 04[span_50](start_span)[span_50](end_span).
* **Output:** Low-poly 3D model composed entirely of flat geometric tiles[span_51](start_span)[span_51](end_span).
* **Next Station Rule:** Every face must be strictly planar and large enough to be cut and folded by hand[span_52](start_span)[span_52](end_span).

---

### Station 06: Surface Color Painter
* **Technical ID:** `SYS-STN-06`[span_53](start_span)[span_53](end_span)
* **Current Status:** `WIP`[span_54](start_span)[span_54](end_span)
* **What it does:** Paints each flat tile of the low-poly 3D model with a single, uniform color taken from the palette reader[span_55](start_span)[span_55](end_span).
* **Why we need it:** It gives the toy its modern, geometric papercraft look and ensures that printed paper parts match the 3D digital guide on screen[span_56](start_span)[span_56](end_span).

```text
  [ Low-Poly 3D Model ] + [ Color Swatch List ]
           |
           v
  +-------------------------------------------------------------+
  | SYS-STN-06: SURFACE COLOR PAINTER            [STATUS: WIP]  |
  | - Maps each flat tile to its matching body part.            |
  | - Fills each face with a single uniform color.              |
  | - Prepares the model for both unfolding and web display.    |
  +-------------------------------------------------------------+
           |
           v
  [ Output: Colored Low-Poly 3D Model ]
```[span_57](start_span)[span_57](end_span)

* **Inputs:** Flat-faceted 3D model from Station 05 + Color list from Station 03[span_58](start_span)[span_58](end_span).
* **Output:** A fully colored low-poly 3D model[span_59](start_span)[span_59](end_span).
* **Next Station Rule:** Every visible polygon must have an assigned solid color with no unpainted gaps[span_60](start_span)[span_60](end_span).

---

### Station 07: Box Unfolder
* **Technical ID:** `SYS-STN-07`[span_61](start_span)[span_61](end_span)
* **Current Status:** `ON HOLD`[span_62](start_span)[span_62](end_span)
* **What it does:** Unfolds the 3D model into flat paper pieces, adding glue flaps, identification numbers, and fold lines (mountain folds and valley folds)[span_63](start_span)[span_63](end_span).
* **Why we need it:** Without glue tabs and numbered matching edges, assembling a 3D paper model from loose facets is an impossible guessing game[span_64](start_span)[span_64](end_span).

```text
  [ Colored Low-Poly 3D Model ]
           |
           v
  +-------------------------------------------------------------+
  | SYS-STN-07: BOX UNFOLDER                  [STATUS: ON HOLD] |
  | - Cuts seams along edges to open the 3D shell flat.         |
  | - Adds angled glue tabs to joining edges.                   |
  | - Marks mountain folds (fold out) and valley folds (in).    |
  | - Adds matching numbers so users know what glues where.     |
  | - Builds the step-by-step folding order for the 3D guide.   |
  +-------------------------------------------------------------+
           |
           +------------------------------------+
           |                                    |
           v                                    v
  [ Output: Flat Unfolded Paper Pieces ]   [ Output: Folding Step-by-Step Order ]
```[span_65](start_span)[span_65](end_span)

* **Input:** Colored low-poly 3D model from Station 06[span_66](start_span)[span_66](end_span).
* **Outputs:**
  1. Flat 2D vector pieces with tabs and fold markings[span_67](start_span)[span_67](end_span).
  2. The step-by-step folding sequence for the 3D player[span_68](start_span)[span_68](end_span).
* **Next Station Rule:** Every glue tab must have a corresponding numbered edge on another piece[span_69](start_span)[span_69](end_span).

---

### Station 08: Page Layout Optimizer
* **Technical ID:** `SYS-STN-08`[span_70](start_span)[span_70](end_span)
* **Current Status:** `ON HOLD`[span_71](start_span)[span_71](end_span)
* **What it does:** Rotates and packs all the loose paper pieces onto standard A4 sheets like puzzle pieces to minimize paper usage[span_72](start_span)[span_72](end_span).
* **Why we need it:** Arranging parts randomly wastes paper and ink[span_73](start_span)[span_73](end_span). Smart packing keeps pieces organized, leaves safe cutting margins, and respects home printer limits[span_74](start_span)[span_74](end_span).

```text
  [ Flat Unfolded Paper Pieces ]
           |
           v
  +-------------------------------------------------------------+
  | SYS-STN-08: PAGE LAYOUT OPTIMIZER         [STATUS: ON HOLD] |
  | - Rotates and arranges loose pieces onto A4 sheets.         |
  | - Leaves safe space between parts so scissors cut cleanly.  |
  | - Keeps parts within printable page margins.                |
  +-------------------------------------------------------------+
           |
           v
  [ Output: Packed A4 Pattern Pages ]
```[span_75](start_span)[span_75](end_span)

* **Input:** Flat unfolded pieces from Station 07[span_76](start_span)[span_76](end_span).
* **Output:** A set of organized, packed A4 pages ready for printing[span_77](start_span)[span_77](end_span).
* **Next Station Rule:** No pieces may overlap, and all parts must remain inside printer boundary margins[span_78](start_span)[span_78](end_span).

---

### Station 09: PDF Craft Booklet Maker
* **Technical ID:** `SYS-STN-09`[span_79](start_span)[span_79](end_span)
* **Current Status:** `ON HOLD`[span_80](start_span)[span_80](end_span)
* **What it does:** Combines the packed A4 pattern sheets, assembly tips, fold instructions, and a QR code for the 3D coach into a single printable PDF document[span_81](start_span)[span_81](end_span).
* **Why we need it:** Users need one clean file they can open and print immediately on home cardstock without specialized software[span_82](start_span)[span_82](end_span).

```text
  [ Packed A4 Pattern Pages ] + [ Project Instructions & Info ]
           |
           v
  +-------------------------------------------------------------+
  | SYS-STN-09: PDF CRAFT BOOKLET MAKER       [STATUS: ON HOLD] |
  | - Builds Cover Page: Picture of the finished model & tips.  |
  | - Builds Page 2: Folding guide & QR code to 3D simulator.   |
  | - Appends pattern pages with parts ready to cut and glue.   |
  +-------------------------------------------------------------+
           |
           v
  [ PHYSICAL PRODUCT: Ready-to-Print Papercraft PDF Booklet ]
```[span_83](start_span)[span_83](end_span)

* **Inputs:** Packed A4 sheets from Station 08 + assembly instructions and QR link[span_84](start_span)[span_84](end_span).
* **Output:** A finished, multi-page PDF booklet ready to print on home cardstock[span_85](start_span)[span_85](end_span).
* **Next Station Rule:** The file must print at 100% scale without shrinking or clipping page borders[span_86](start_span)[span_86](end_span).

---

### Station 10: 3D Folding Web Coach
* **Technical ID:** `SYS-STN-10`[span_87](start_span)[span_87](end_span)
* **Current Status:** `ON HOLD`[span_88](start_span)[span_88](end_span)
* **What it does:** An interactive 3D web screen (built with Three.js) that demonstrates how to assemble the toy, folding pieces along their seams step by step[span_89](start_span)[span_89](end_span).
* **Why we need it:** When paper instructions get confusing, users can spin the 3D model with a finger or mouse, zoom in, and see exactly which piece to fold next[span_90](start_span)[span_90](end_span).

```text
  [ Colored 3D Model ] + [ Folding Step-by-Step Order ]
           |
           v
  +-------------------------------------------------------------+
  | SYS-STN-10: 3D FOLDING WEB COACH (Three.js)[STATUS: ON HOLD]|
  | - Displays the pieces flat, then animates each fold.        |
  | - Rotates faces along their shared edges into 3D position.  |
  | - Gives users simple controls: Next Step, Previous Step.   |
  | - Allows 360-degree viewing and inspection from any angle.  |
  +-------------------------------------------------------------+
           |
           v
  [ DIGITAL PRODUCT: Interactive 3D Web Assembly Assistant ]
```[span_91](start_span)[span_91](end_span)

* **Inputs:** Colored 3D model from Station 06 + folding step order from Station 07[span_92](start_span)[span_92](end_span).
* **Output:** An interactive 3D web application accessible via mobile phone or computer browser[span_93](start_span)[span_93](end_span).
* **Next Station Rule:** Animation must play smoothly and demonstrate the correct fold direction for every step[span_94](start_span)[span_94](end_span).

---

## 3. Product Calibration Profiles

The factory adjusts how it processes parts depending on whether the toy is calibrated for children or teenagers[span_95](start_span)[span_95](end_span):

* **Child Profile (Ages 4 to 11):**
  * **Geometry:** Fewer, broader geometric tiles for quick and friendly building[span_96](start_span)[span_96](end_span).
  * **Glue Flaps:** Extra-wide flaps (8 to 10 mm) that work well with common school glue sticks[span_97](start_span)[span_97](end_span).
  * **Fold Angles:** Gentle, open fold angles so fingers can easily press pieces together[span_98](start_span)[span_98](end_span).
  * **Build Experience:** Fast assembly designed to be completed in 30 to 45 minutes[span_99](start_span)[span_99](end_span).

* **Teen Profile (Ages 12+):**
  * **Geometry:** Finer, sharper geometric facets that capture more anatomical shape and expression[span_100](start_span)[span_100](end_span).
  * **Glue Flaps:** Standard precision flaps (4 to 5 mm) suitable for liquid glue or craft tape[span_101](start_span)[span_101](end_span).
  * **Fold Angles:** Allows sharper, tighter angles for intricate polygonal features[span_102](start_span)[span_102](end_span).
  * **Build Experience:** A rewarding craft project designed for deeper focus and detail[span_103](start_span)[span_103](end_span).
````
