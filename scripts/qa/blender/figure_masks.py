"""Figure QA (Blender side): solid volumes and silhouette masks of the three shapes of one figure.

blender -b -P figure_masks.py -- '{"raw_glb", "base_glb", "reduce_json", "output_dir", "resolution"}'
Shapes, all in the frame of the simplified figure (the grounded base):
- raw: the TRELLIS output above the base-cut plane (what the cut must keep);
- base: the stage-2 figure after the base cut;
- reduce: the stage-3 simplified figure.
Only the base is moved by the cut (a translation), so the raw is aligned on the top of the figure. Volumes are
measured by vertical columns through the outer surface (TRELLIS meshes can be hollow and have holes).
"""
import json
import math
import os
import sys
import traceback
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

KEY_POINTS = Path(__file__).parents[2] / "stage-3" / "blender" / "key_points"
sys.path.insert(0, str(KEY_POINTS))

from model_loader import load_grounded_mesh
from outer_shell import keep_outer_surface

sys.path.insert(0, str(Path(__file__).parent))
from column_volume import column_volume
from mesh_quality import enclosed_volume
from watertight_remesh import watertight_copy

RESULT_MARKER = "PAPERCRAFT_RESULT "
ERROR_MARKER = "PAPERCRAFT_ERROR "
VIEWS = {"front": (0, 10), "right": (90, 10), "back": (180, 10), "left": (270, 10), "three-quarter": (30, 25),
         "top": (0, 89)}
WELD_RATIO = 1e-05
CONTACT_RATIO = 0.02
INNER_WALL_SHARE = 0.3
COLUMNS = 256
OPEN_COLUMNS_LIMIT = 0.1
MIN_PART_SHARE = 0.1
VOXEL_RATIO = 0.0025
GROUND_CLEARANCE_RATIO = 0.003
ALIGN_SAMPLES = 20000
ALIGN_PASSES = 8
VOTE_BASE = 150
VOTE_RAW = 20000
VOTE_CELL_RATIO = 0.002
GONE_RATIO = 0.01
SHEET_FLATNESS = 0.002


def read_settings():
    return json.loads(sys.argv[sys.argv.index("--") + 1])


def grounded(path):
    surface, length, _ = load_grounded_mesh({"input_glb": path, "weld_distance_ratio": WELD_RATIO,
                                             "contact_height_ratio": CONTACT_RATIO})
    return surface, length


def reduce_surface(path):
    """The simplified figure is stored in the frame of the grounded base, the same frame `grounded` gives."""
    document = json.load(open(path))
    surface = bmesh.new()
    verts = [surface.verts.new(vertex["position"]) for vertex in document["vertices"]]
    for face in document["faces"]:
        surface.faces.new([verts[index] for index in face])
    surface.normal_update()
    return surface


def move(surface, offset):
    bmesh.ops.transform(surface, matrix=Matrix.Translation(offset), verts=surface.verts)


def align_raw(raw, base, length):
    """Moves the raw TRELLIS shape onto the base. The cut only translates and keeps the raw vertices, so the true
    offset is the one most base/raw vertex pairs agree on (a vote, which needs no first guess); it is then refined
    by pairing each base vertex with its nearest raw vertex and removing the median offset."""
    move(raw, voted_offset(raw, base, length))
    samples = [vertex.co.copy() for vertex in base.verts][::max(1, len(base.verts) // ALIGN_SAMPLES)]
    for _ in range(ALIGN_PASSES):
        index = KDTree(len(raw.verts))
        for position, vertex in enumerate(raw.verts):
            index.insert(vertex.co, position)
        index.balance()
        offsets = [point - index.find(point)[0] for point in samples]
        move(raw, Vector([sorted(offset[axis] for offset in offsets)[len(offsets) // 2] for axis in range(3)]))


def voted_offset(raw, base, length):
    rng = np.random.default_rng(0)
    base_points = np.array([list(vertex.co) for vertex in base.verts])
    raw_points = np.array([list(vertex.co) for vertex in raw.verts])
    base_points = base_points[rng.choice(len(base_points), min(VOTE_BASE, len(base_points)), replace=False)]
    raw_points = raw_points[rng.choice(len(raw_points), min(VOTE_RAW, len(raw_points)), replace=False)]
    cell = length * VOTE_CELL_RATIO
    votes = {}
    for point in base_points:
        for key in map(tuple, np.round((point - raw_points) / cell).astype(np.int64)):
            votes[key] = votes.get(key, 0) + 1
    best = max(votes, key=votes.get)
    return Vector([axis * cell for axis in best])


def clip_below(surface, level):
    geometry = surface.verts[:] + surface.edges[:] + surface.faces[:]
    bmesh.ops.bisect_plane(surface, geom=geometry, plane_co=(0, 0, level), plane_no=(0, 0, 1), clear_inner=True)


def connected_parts(surface):
    return connected_parts_of(surface.faces)


def keep_body(surface):
    """Without the plinth, TRELLIS leftovers (panels, posts standing on the plinth) float free; the cut is right to
    drop them. Only pieces of at least MIN_PART_SHARE of the body's area count as parts of the figure."""
    parts = [(sum(face.calc_area() for face in part), part) for part in connected_parts(surface)]
    largest = max(area for area, _ in parts)
    loose = [face for area, part in parts if area < MIN_PART_SHARE * largest for face in part]
    if loose:
        bmesh.ops.delete(surface, geom=loose, context="FACES")


def drop_flat_sheets(raw, base, length):
    """TRELLIS sometimes adds flat panels (shadow or glass planes) glued to the figure; the cut is right to remove
    them. Raw pieces the base does not have and that are perfectly flat (no thickness at all) are not parts."""
    tree = BVHTree.FromBMesh(base)
    gone = [face for face in raw.faces if tree.find_nearest(face.calc_center_median())[3] > length * GONE_RATIO]
    sheets = [face for piece in connected_parts_of(gone) if flatness(piece) < SHEET_FLATNESS for face in piece]
    if sheets:
        bmesh.ops.delete(raw, geom=sheets, context="FACES")
    return len(sheets)


def connected_parts_of(faces):
    remaining, parts = set(faces), []
    while remaining:
        start = remaining.pop()
        stack, part = [start], [start]
        while stack:
            for edge in stack.pop().edges:
                for neighbour in edge.link_faces:
                    if neighbour in remaining:
                        remaining.remove(neighbour)
                        stack.append(neighbour)
                        part.append(neighbour)
        parts.append(part)
    return parts


def flatness(faces):
    """Smallest over largest spread of the piece's corners: 0 for a plane, larger for anything with thickness."""
    points = np.array([list(vertex.co) for face in faces for vertex in face.verts])
    spreads = np.linalg.svd(points - points.mean(axis=0), compute_uv=False)
    return float(spreads[-1] / max(spreads[0], 1e-12)) if len(spreads) == 3 else 0.0


def solid_volume(surface, length):
    """Volume of the outer solid; hollow TRELLIS walls are reduced to their outer surface first."""
    work = surface.copy()
    keep_outer_surface(work, length, INNER_WALL_SHARE)
    volume, open_columns = column_volume(work, COLUMNS)
    work.free()
    return volume, open_columns


def clear_imports():
    """Loading a GLB leaves its object in the scene; only the three aligned shapes may appear in the masks."""
    for item in list(bpy.data.objects):
        bpy.data.objects.remove(item, do_unlink=True)


def union_volume(surface, length):
    """Figures made of overlapping blocks break the column count; a voxel remesh merges them into one solid."""
    closed = watertight_copy(surface, length * VOXEL_RATIO)
    volume = enclosed_volume(closed)
    closed.free()
    return volume


def compare_volumes(base, reduce, length):
    base_volume, base_open = solid_volume(base, length)
    reduce_volume, reduce_open = solid_volume(reduce, length)
    method = "columns"
    if max(base_open, reduce_open) > OPEN_COLUMNS_LIMIT:
        base_volume, reduce_volume, method = union_volume(base, length), union_volume(reduce, length), "voxel-union"
    return {"baseVolume": base_volume, "reduceVolume": reduce_volume, "method": method,
            "volumeChangePercent": round(100 * (reduce_volume - base_volume) / base_volume, 2),
            "openColumns": {"base": round(base_open, 4), "reduce": round(reduce_open, 4)}}


def add_object(name, surface):
    mesh = bpy.data.meshes.new(name)
    surface.to_mesh(mesh)
    item = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(item)
    return item


def mask_scene(resolution):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = scene.render.resolution_y = resolution
    scene.display.shading.light = "FLAT"
    scene.display.shading.color_type = "SINGLE"
    scene.display.shading.single_color = (1.0, 1.0, 1.0)
    scene.display.shading.background_type = "VIEWPORT"
    scene.display.shading.background_color = (0.0, 0.0, 0.0)
    scene.view_settings.view_transform = "Standard"
    scene.render.image_settings.color_mode = "BW"
    camera = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
    camera.data.type = "ORTHO"
    scene.collection.objects.link(camera)
    scene.camera = camera
    return scene, camera


def render_masks(objects, frame_surface, settings):
    scene, camera = mask_scene(settings["resolution"])
    low = Vector([min(v.co[axis] for v in frame_surface.verts) for axis in range(3)])
    high = Vector([max(v.co[axis] for v in frame_surface.verts) for axis in range(3)])
    centre, radius = (low + high) / 2, (high - low).length / 2
    camera.data.ortho_scale = radius * 2.3
    for view, (azimuth, elevation) in VIEWS.items():
        angle, tilt = math.radians(azimuth), math.radians(elevation)
        direction = Vector((math.sin(angle) * math.cos(tilt), -math.cos(angle) * math.cos(tilt), math.sin(tilt)))
        camera.location = centre + direction * radius * 4
        camera.rotation_euler = (centre - camera.location).to_track_quat("-Z", "Y").to_euler()
        for name, item in objects.items():
            for other in objects.values():
                other.hide_render = other is not item
            scene.render.filepath = os.path.join(settings["output_dir"], f"{name}-{view}.png")
            bpy.ops.render.render(write_still=True)


def main():
    settings = read_settings()
    os.makedirs(settings["output_dir"], exist_ok=True)
    base, length = grounded(settings["base_glb"])
    raw, _ = grounded(settings["raw_glb"])
    align_raw(raw, base, length)
    clip_below(raw, length * GROUND_CLEARANCE_RATIO)
    keep_body(raw)
    sheets = drop_flat_sheets(raw, base, length)
    reduce = reduce_surface(settings["reduce_json"])
    volumes = compare_volumes(base, reduce, length)
    clear_imports()
    objects = {"raw": add_object("raw", raw), "base": add_object("base", base), "reduce": add_object("reduce", reduce)}
    render_masks(objects, base, settings)
    print(RESULT_MARKER + json.dumps({"lengthMm": round(length * 1000, 1), **volumes,
                                      "reduceFaces": len(reduce.faces), "flatSheetFaces": sheets,
                                      "views": list(VIEWS)}))


if __name__ == "__main__":
    try:
        main()
    except Exception as failure:
        traceback.print_exc()
        print(ERROR_MARKER + json.dumps(str(failure)))
        sys.exit(1)
