import json
import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

NEIGHBOUR_PASSES = 12


def import_base_mesh(path: str):
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"No mesh found in {path}")
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


def texture_pixels(item):
    for slot in item.material_slots:
        if not slot.material or not slot.material.node_tree:
            continue
        for node in slot.material.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image:
                width, height = node.image.size
                data = np.array(node.image.pixels[:], dtype=np.float32)
                return data.reshape(height, width, node.image.channels)[:, :, :3]
    raise RuntimeError("The base model has no colour texture")


def bilinear(texture, uv):
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


def build_reduce_surface(reduce_json: str):
    with open(reduce_json) as handle:
        document = json.load(handle)
    offset = Vector(document.get("groundOffset", (0, 0, 0)))
    surface = bmesh.new()
    verts = [surface.verts.new(Vector(v["position"]) - offset) for v in document["vertices"]]
    for face in document["faces"]:
        surface.faces.new([verts[i] for i in face])
    surface.verts.index_update()
    surface.faces.index_update()
    surface.faces.ensure_lookup_table()
    return surface


def lab_of(rgb):
    from color_space import srgb_to_lab
    return srgb_to_lab(np.atleast_2d(rgb))


def medoid(rgb, weights):
    lab = lab_of(rgb)
    distance = np.linalg.norm(lab[:, None] - lab[None], axis=2)
    return rgb[np.argmin((distance * weights[None]).sum(axis=1))]


def fill_missing(surface, colours):
    known = [c is not None for c in colours]
    for _ in range(NEIGHBOUR_PASSES):
        if all(known):
            break
        updated = list(colours)
        for face in surface.faces:
            if known[face.index]:
                continue
            around = [colours[n.index] for edge in face.edges for n in edge.link_faces
                      if n is not face and known[n.index]]
            if around:
                updated[face.index] = np.mean(around, axis=0)
        for i, c in enumerate(updated):
            if c is not None:
                known[i] = True
        colours = updated
    return [c if c is not None else np.array([0.5, 0.5, 0.5]) for c in colours]


def facet_colours(base_glb: str, reduce_json: str):
    """Cor (sRGB) de cada face da reducao = cor da textura da base nas faces originais que ela cobre."""
    base = import_base_mesh(base_glb)
    texture = texture_pixels(base)
    mesh = base.data
    mesh.calc_loop_triangles()
    uvs = mesh.uv_layers.active.data
    surface = build_reduce_surface(reduce_json)
    tree = BVHTree.FromBMesh(surface)
    samples = [[] for _ in surface.faces]
    for tri in mesh.loop_triangles:
        coords = [mesh.vertices[i].co for i in tri.vertices]
        _, _, index, _ = tree.find_nearest((coords[0] + coords[1] + coords[2]) / 3)
        if index is None:
            continue
        corners = np.array([uvs[l].uv[:] for l in tri.loops])
        centre = corners.mean(axis=0)
        points = np.array([centre] + [centre + (c - centre) * 0.5 for c in corners])
        samples[index].append((bilinear(texture, points).mean(axis=0), tri.area))
    colours = []
    for found in samples:
        if not found:
            colours.append(None)
            continue
        colours.append(medoid(np.array([c for c, _ in found]), np.array([a for _, a in found])))
    bpy.data.objects.remove(base)
    return surface, fill_missing(surface, colours)
