import json
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import cv2
import numpy as np

from atlas import atlas_uv, build_atlas, region_raster
from camera_choice import choose_registration
from mesh_regions import aligned_area_ratio, grouped_regions, load_mesh, plane_regions
from organic_texture import is_reliable, organic_art, organic_fallback, organic_palette
from palette import build_palette, dominant_colours
from pixel_grid import sample_cells
from plane_refine import refine_planes, write_aligned_mesh
from rectify import RectifiedPatch, face_id_image, patch_size, rectify_region, region_coverage, visible_regions
from region_textures import (
    art_texture, fill_from_neighbours, head_cell_size, transferred_texture,
)
from silhouette_fit import fit_silhouette
from svg_writer import region_svg
from trellis_views import TrellisViews

RESULT_MARKER = "PAPERCRAFT_RESULT "
ERROR_MARKER = "PAPERCRAFT_ERROR "
PATCH_PIXELS_PER_LENGTH = 900.0
MINIMUM_COLOUR_SHARE = 0.006
FALLBACK_MINIMUM_SHARE = 0.02
CAMERA_ONLY_ITERATIONS = 1500


def read_settings():
    return json.loads(sys.argv[sys.argv.index("--") + 1])


def trellis_patch(region, views, mesh, pixels_per_metre):
    size = patch_size(region, pixels_per_metre)
    inside = region_coverage(region, mesh, size)
    return RectifiedPatch(views.patch(region, size), inside.copy(), inside)


def art_patches_of(camera, regions, mesh, art, pixels_per_metre):
    ids = face_id_image(camera, mesh)
    return [(region, rectify_region(art, camera, mesh, region, ids, pixels_per_metre)) for region in visible_regions(camera, regions)]


def palette_from(textures_cells):
    colours = [lab for grid in textures_cells for lab in grid.lab[grid.sampled & grid.pure]]
    centres, weights = build_palette(colours)
    return dominant_colours(centres, weights, MINIMUM_COLOUR_SHARE)


def organic_textures(art_patches, regions, views, redrawn, mesh, pixels_per_metre):
    reliable = [(region, patch) for region, patch in art_patches if is_reliable(patch)]
    palette = organic_palette([patch for _, patch in reliable])
    textures = {region.index: organic_art(region, patch, palette) for region, patch in reliable}
    for region in regions:
        if region.index not in textures:
            textures[region.index] = organic_fallback(
                region, trellis_patch(region, redrawn, mesh, pixels_per_metre),
                trellis_patch(region, views, mesh, pixels_per_metre), palette,
            )
    return textures, palette


def pixel_textures(art_patches, regions, views, redrawn, mesh, pixels_per_metre, settings):
    cell_size = head_cell_size(regions, settings["head_cells"])
    palette, weights = palette_from([sample_cells(region, patch, cell_size) for region, patch in art_patches])
    allowed = np.flatnonzero(weights / weights.sum() >= FALLBACK_MINIMUM_SHARE)
    cell_px = cell_size * pixels_per_metre
    textures = {region.index: art_texture(region, patch, cell_size, palette, cell_px) for region, patch in art_patches}
    fallbacks = {
        region.index: transferred_texture(
            region, trellis_patch(region, redrawn, mesh, pixels_per_metre),
            trellis_patch(region, views, mesh, pixels_per_metre), cell_size, palette, allowed,
        )
        for region in regions
    }
    for region in regions:
        if region.index not in textures:
            fallback = fallbacks[region.index]
            fallback.resolved = np.zeros_like(fallback.resolved)
            textures[region.index] = fallback
    complete_textures(mesh, textures, fallbacks)
    return textures, palette, cell_size


def build_textures(settings):
    mesh = load_mesh(settings["input_mesh"])
    regions = plane_regions(mesh)
    art = cv2.imread(settings["input_art"], cv2.IMREAD_UNCHANGED)
    views = TrellisViews(settings["views_dir"], mesh.ground_offset)
    redrawn = TrellisViews(settings["redrawn_views_dir"], mesh.ground_offset)
    pixels_per_metre = PATCH_PIXELS_PER_LENGTH / mesh.length
    registration = choose_registration(fit_silhouette(mesh, art[:, :, 3], art.shape[0]), regions, mesh, art, views, pixels_per_metre)
    camera = registration.camera
    pixel = aligned_area_ratio(mesh) >= settings["pixel_min_aligned_ratio"]
    if pixel:
        mesh, camera, _ = refine_planes(mesh, camera, art)
        regions = plane_regions(mesh)
    else:
        _, camera, _ = refine_planes(mesh, camera, art, CAMERA_ONLY_ITERATIONS, False)
        regions = grouped_regions(mesh, settings["organic_group_angle_deg"], settings["organic_group_deviation_ratio"], settings["organic_group_extent_ratio"])
    write_aligned_mesh(settings["input_mesh"], mesh, settings["output_mesh"])
    seen = art_patches_of(camera, regions, mesh, art, pixels_per_metre)
    if pixel:
        textures, palette, cell_size = pixel_textures(seen, regions, views, redrawn, mesh, pixels_per_metre, settings)
        return mesh, textures, palette, registration, cell_size, "pixel"
    textures, palette = organic_textures(seen, regions, views, redrawn, mesh, pixels_per_metre)
    return mesh, textures, palette, registration, 0.0, "organic"


def complete_textures(mesh, textures, fallbacks):
    for index, texture in textures.items():
        missing = ~texture.resolved & texture.grid.member
        texture.indices[missing] = fallbacks[index].indices[missing]
        texture.resolved = texture.resolved | texture.grid.member
        texture.indices = fill_from_neighbours(np.where(texture.resolved, texture.indices, -1), np.ones_like(texture.grid.member))
        texture.resolved = texture.indices >= 0


def write_outputs(settings, mesh, textures, palette):
    output = Path(settings["output_dir"])
    (output / "svg").mkdir(parents=True, exist_ok=True)
    rasters = {index: region_raster(texture, palette) for index, texture in textures.items()}
    atlas, placements = build_atlas(rasters)
    cv2.imwrite(str(output / "atlas.png"), cv2.cvtColor(atlas, cv2.COLOR_RGBA2BGRA))
    owner = {face: index for index, texture in textures.items() for face in texture.region.face_ids}
    atlas_size = (atlas.shape[1], atlas.shape[0])
    faces = [
        [atlas_uv(textures[owner[number]], placements[owner[number]], atlas_size, mesh.vertices[vertex]) for vertex in face]
        for number, face in enumerate(mesh.faces)
    ]
    (output / "faces_uv.json").write_text(json.dumps({"faces": faces, "atlas": "atlas.png"}))
    for index, texture in textures.items():
        (output / "svg" / f"region-{index:02d}.svg").write_text(region_svg(texture, palette))
    return len(rasters)


def main():
    settings = read_settings()
    mesh, textures, palette, registration, cell_size, mode = build_textures(settings)
    count = write_outputs(settings, mesh, textures, palette)
    shapes = sum(len(texture.shapes) for texture in textures.values())
    print(RESULT_MARKER + json.dumps({
        "mode": mode, "regions": count, "palette": len(palette), "smoothShapes": shapes,
        "cellSizeMm": round(cell_size * 300 / mesh.length, 2),
        "silhouetteIou": round(registration.iou, 4),
        "azimuthDeg": round(float(np.degrees(registration.camera.azimuth)), 1),
    }))


try:
    main()
except Exception as failure:
    traceback.print_exc()
    print(ERROR_MARKER + json.dumps(str(failure)))
    sys.exit(1)
