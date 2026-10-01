import bpy
import numpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from art_bleed import bleed_into_image
from art_camera import CameraFit, art_mask, view_basis
from art_registration import ArtMapping, basis, refine
from silhouette_mesh import silhouette_mesh

ART_UV_NAME = "ArtUV"
FACING_MINIMUM = 0.5
OCCLUSION_OFFSET = 1e-4


def load_art(path):
    image = bpy.data.images.load(path)
    width, height = image.size
    return image, numpy.array(image.pixels[:]).reshape(height, width, 4)


def visible_polygons(source, direction):
    towards = Vector(direction)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    tree = BVHTree.FromObject(source, depsgraph)
    visible = []
    for polygon in source.data.polygons:
        if polygon.normal.dot(towards) < FACING_MINIMUM:
            continue
        if tree.ray_cast(polygon.center + polygon.normal * OCCLUSION_OFFSET, towards)[0] is None:
            visible.append(polygon.index)
    return visible


def trellis_texels(source):
    nodes = source.data.materials[0].node_tree.nodes
    image = next(node for node in nodes if node.bl_idname == "ShaderNodeTexImage").image
    width, height = image.size
    return numpy.array(image.pixels[:]).reshape(height, width, image.channels)[:, :, :3]


def polygon_samples(source, polygons):
    grid = trellis_texels(source)
    layer = source.data.uv_layers[0]
    rows, columns = grid.shape[:2]
    positions, colours = [], []
    for index in polygons:
        polygon = source.data.polygons[index]
        uv = numpy.array([layer.data[loop].uv for loop in polygon.loop_indices]).mean(axis=0)
        positions.append(tuple(polygon.center))
        colours.append(grid[int(uv[1] * (rows - 1)), int(uv[0] * (columns - 1))])
    return numpy.array(positions), numpy.array(colours)


def vertex_positions(mesh):
    positions = numpy.empty(len(mesh.vertices) * 3)
    mesh.vertices.foreach_get("co", positions)
    return positions.reshape(-1, 3)


def add_art_uv(source, mapping, parameters, size):
    mesh = source.data
    original = mesh.uv_layers.active
    layer = mesh.uv_layers.new(name=ART_UV_NAME)
    loops = numpy.empty(len(mesh.loops), dtype=int)
    mesh.loops.foreach_get("vertex_index", loops)
    columns, rows = mapping.pixels(parameters, vertex_positions(mesh))
    uv = numpy.stack([columns / size[0], rows / size[1]], axis=1)[loops]
    layer.data.foreach_set("uv", uv.ravel())
    mesh.uv_layers.active = original
    original.active_render = True


def art_material(image):
    material = bpy.data.materials.new("ArtProjection")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    coordinates = nodes.new("ShaderNodeUVMap")
    coordinates.uv_map = ART_UV_NAME
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    texture.extension = "EXTEND"
    material.node_tree.links.new(coordinates.outputs["UV"], texture.inputs["Vector"])
    material.node_tree.links.new(texture.outputs["Color"], nodes["Principled BSDF"].inputs["Base Color"])
    nodes["Principled BSDF"].inputs["Metallic"].default_value = 0.0
    return material


def assign_art_material(source, image, polygons):
    source.data.materials.append(art_material(image))
    index = len(source.data.materials) - 1
    for polygon_index in polygons:
        source.data.polygons[polygon_index].material_index = index


def project_art(source, art_path):
    image, pixels = load_art(art_path)
    bleed_into_image(image, pixels)
    points, triangles = silhouette_mesh(source)
    azimuth, elevation, score = CameraFit(points, triangles, pixels).fit()
    silhouette_points = numpy.array([tuple(point) for point in points])
    _, box = art_mask(pixels)
    mapping = ArtMapping(silhouette_points, box, image.size, numpy.linalg.norm(silhouette_points - silhouette_points.mean(axis=0), axis=1).max())
    start = [azimuth, elevation, 1.0, 0.0, 0.0, 0.0]
    mapping.fix_bounds(start, silhouette_points)
    polygons = visible_polygons(source, view_basis(azimuth, elevation)[0])
    samples, reference = polygon_samples(source, polygons)
    parameters, cost = refine(mapping, pixels, samples, reference, start)
    add_art_uv(source, mapping, parameters, image.size)
    visible = visible_polygons(source, basis(parameters[0], parameters[1])[0])
    assign_art_material(source, image, visible)
    return {
        "azimuth": round(float(parameters[0]), 1),
        "elevation": round(float(parameters[1]), 1),
        "silhouetteScore": round(float(score), 3),
        "colourDisagreement": round(float(cost), 4),
        "visibleShare": round(len(visible) / len(source.data.polygons), 3),
    }
