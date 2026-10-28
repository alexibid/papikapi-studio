import json
import math
import os
import sys
import tempfile

import bmesh
import bpy
import numpy as np
from mathutils import Vector

RESULT_MARKER = "PAPERCRAFT_RESULT "
SEARCH_SIZE = 256
COMPARE_SIZE = 128
WELD_DISTANCE = 1e-5
FINAL_SIZE = 768
AZIMUTHS = range(0, 360, 10)
ELEVATIONS = (5, 15, 25, 35, 45, 55)


def read_settings() -> dict:
    return json.loads(sys.argv[sys.argv.index("--") + 1])


def join_meshes():
    meshes = [item for item in bpy.context.scene.objects if item.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for item in meshes:
        item.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    if len(meshes) > 1:
        bpy.ops.object.join()
    merged = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return merged


def island_faces(surface):
    seen, islands = set(), []
    for start in surface.faces:
        if start.index in seen:
            continue
        stack, members = [start], []
        seen.add(start.index)
        while stack:
            face = stack.pop()
            members.append(face)
            for edge in face.edges:
                for neighbour in edge.link_faces:
                    if neighbour.index not in seen:
                        seen.add(neighbour.index)
                        stack.append(neighbour)
        islands.append(members)
    return islands


def drop_stray_islands(item, minimum_share=0.03):
    surface = bmesh.new()
    surface.from_mesh(item.data)
    bmesh.ops.remove_doubles(surface, verts=surface.verts, dist=WELD_DISTANCE)
    surface.faces.ensure_lookup_table()
    islands = island_faces(surface)
    areas = [sum(face.calc_area() for face in members) for members in islands]
    largest = max(areas)
    stray = [members for members, area in zip(islands, areas) if area < minimum_share * largest]
    bmesh.ops.delete(surface, geom=[face for members in stray for face in members], context="FACES")
    surface.to_mesh(item.data)
    surface.free()
    return {"islands": len(islands), "strayIslands": len(stray), "strayAreaShare": round(1 - (sum(a for a in areas if a >= minimum_share * largest) / sum(areas)), 4)}


def import_model(path: str):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    item = join_meshes()
    fragments = drop_stray_islands(item)
    corners = [item.matrix_world @ Vector(c) for c in item.bound_box]
    low = Vector((min(c[i] for c in corners) for i in range(3)))
    high = Vector((max(c[i] for c in corners) for i in range(3)))
    dimensions = [round(high[i] - low[i], 4) for i in range(3)]
    return (low + high) / 2, (high - low).length, {**fragments, "dimensions": dimensions, "faces": len(item.data.polygons)}


def configure_scene(size: int):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.film_transparent = True
    scene.render.resolution_x = scene.render.resolution_y = size
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.display.shading.light = "FLAT"
    scene.display.shading.color_type = "TEXTURE"
    scene.display.shading.show_cavity = False
    scene.view_settings.view_transform = "Standard"
    camera = bpy.data.objects.new("FitCamera", bpy.data.cameras.new("FitCamera"))
    camera.data.type = "ORTHO"
    scene.collection.objects.link(camera)
    scene.camera = camera
    return scene, camera


def aim_camera(camera, centre, extent, azimuth, elevation):
    a, e = math.radians(azimuth), math.radians(elevation)
    direction = Vector((math.cos(e) * math.sin(a), -math.cos(e) * math.cos(a), math.sin(e)))
    camera.location = centre + direction * extent * 2
    camera.rotation_euler = (centre - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.ortho_scale = extent * 1.05
    camera.data.clip_start, camera.data.clip_end = 0.01, extent * 6


def render_rgba(scene, size: int) -> np.ndarray:
    scene.render.resolution_x = scene.render.resolution_y = size
    path = os.path.join(tempfile.gettempdir(), "trellis_fit_render.png")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    image = bpy.data.images.load(path)
    pixels = np.empty(size * size * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    bpy.data.images.remove(image)
    return np.flipud(pixels.reshape(size, size, 4))


def normalised_mask(mask: np.ndarray) -> np.ndarray:
    rows, cols = np.nonzero(mask)
    if len(rows) == 0:
        return np.zeros((COMPARE_SIZE, COMPARE_SIZE), dtype=bool)
    crop = mask[rows.min():rows.max() + 1, cols.min():cols.max() + 1]
    side = max(crop.shape)
    square = np.zeros((side, side), dtype=np.uint8)
    square[:crop.shape[0], :crop.shape[1]] = crop
    from_index = (np.arange(COMPARE_SIZE) * side / COMPARE_SIZE).astype(int)
    return square[np.ix_(from_index, from_index)] > 0


def overlap(first: np.ndarray, second: np.ndarray) -> float:
    union = np.logical_or(first, second).sum()
    return float(np.logical_and(first, second).sum() / union) if union else 0.0


def read_art_mask(path: str) -> np.ndarray:
    image = bpy.data.images.load(path)
    width, height = image.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    bpy.data.images.remove(image)
    return np.flipud(pixels.reshape(height, width, 4))[:, :, 3] > 0.5


def search_best_view(scene, camera, centre, extent, art_mask):
    best = {"iou": -1.0, "azimuth": 0, "elevation": 0}
    for elevation in ELEVATIONS:
        for azimuth in AZIMUTHS:
            aim_camera(camera, centre, extent, azimuth, elevation)
            score = overlap(normalised_mask(render_rgba(scene, SEARCH_SIZE)[:, :, 3] > 0.5), art_mask)
            if score > best["iou"]:
                best = {"iou": score, "azimuth": azimuth, "elevation": elevation}
    return best


def save_views(scene, camera, centre, extent, best, output_dir, label, size):
    offsets = {"fit": 0, "right": 90, "back": 180, "left": 270}
    for name, offset in offsets.items():
        aim_camera(camera, centre, extent, best["azimuth"] + offset, best["elevation"] if name == "fit" else 20)
        scene.render.filepath = os.path.join(output_dir, f"{label}-{name}.png")
        scene.render.resolution_x = scene.render.resolution_y = size
        bpy.ops.render.render(write_still=True)


def main():
    settings = read_settings()
    centre, extent, geometry = import_model(settings["glb"])
    scene, camera = configure_scene(SEARCH_SIZE)
    art_mask = normalised_mask(read_art_mask(settings["art"]))
    best = search_best_view(scene, camera, centre, extent, art_mask)
    os.makedirs(settings["output_dir"], exist_ok=True)
    save_views(scene, camera, centre, extent, best, settings["output_dir"], settings["label"], int(settings.get("final_size", FINAL_SIZE)))
    print(RESULT_MARKER + json.dumps({**best, **geometry}))


main()
