import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.interpolate import poly_3d_calc


def import_optimized_model(path: str):
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [item for item in bpy.context.scene.objects if item.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"No mesh found in {path}")
    bpy.ops.object.select_all(action="DESELECT")
    for item in meshes:
        item.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    if len(meshes) > 1:
        bpy.ops.object.join()
    figure = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return figure


def atlas_of(figure) -> np.ndarray:
    for slot in figure.material_slots:
        if not slot.material or not slot.material.node_tree:
            continue
        for node in slot.material.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image:
                width, height = node.image.size
                pixels = np.empty(width * height * 4, dtype=np.float32)
                node.image.pixels.foreach_get(pixels)
                return pixels.reshape(height, width, 4)[:, :, :3]
    raise RuntimeError("The optimized model has no colour texture")


def sample_bilinear(texture: np.ndarray, uv: np.ndarray) -> np.ndarray:
    height, width = texture.shape[:2]
    x = np.clip(uv[:, 0] * width - 0.5, 0, width - 1.001)
    y = np.clip(uv[:, 1] * height - 0.5, 0, height - 1.001)
    x0, y0 = x.astype(int), y.astype(int)
    fx, fy = (x - x0)[:, None], (y - y0)[:, None]
    return (
        texture[y0, x0] * (1 - fx) * (1 - fy)
        + texture[y0, x0 + 1] * fx * (1 - fy)
        + texture[y0 + 1, x0] * (1 - fx) * fy
        + texture[y0 + 1, x0 + 1] * fx * fy
    )


def sample_nearest_surface(figure, points: np.ndarray) -> np.ndarray:
    """Colour of the optimized atlas at the point of the optimized surface nearest to each texel."""
    atlas = atlas_of(figure)
    surface = bmesh.new()
    surface.from_mesh(figure.data)
    bmesh.ops.triangulate(surface, faces=surface.faces)
    surface.faces.ensure_lookup_table()
    tree = BVHTree.FromBMesh(surface)
    uv_layer = surface.loops.layers.uv.active
    uvs = np.empty((len(points), 2))
    for index, point in enumerate(points):
        location, _, face_index, _ = tree.find_nearest(Vector(point))
        face = surface.faces[face_index]
        weights = poly_3d_calc([vert.co for vert in face.verts], location)
        uvs[index] = sum(
            (np.array(loop[uv_layer].uv[:]) * weight for loop, weight in zip(face.loops, weights)),
            np.zeros(2),
        )
    surface.free()
    return sample_bilinear(atlas, uvs)
