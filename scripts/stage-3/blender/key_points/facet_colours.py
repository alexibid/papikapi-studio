import bpy
import numpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

INSET_WEIGHTS = (0.5, 0.75)
COLOUR_ATTRIBUTE = "FacetColour"


def base_texture_pixels():
    images = [image for image in bpy.data.images if image.size[0] > 0 and image.has_data]
    if not images:
        return None
    image = max(images, key=lambda candidate: candidate.size[0] * candidate.size[1])
    width, height = image.size
    return numpy.array(image.pixels[:], dtype=numpy.float32).reshape(height, width, 4)[:, :, :3]


def read_texel(pixels, uv):
    height, width = pixels.shape[:2]
    column = min(width - 1, max(0, int((uv[0] % 1.0) * width)))
    row = min(height - 1, max(0, int((uv[1] % 1.0) * height)))
    return pixels[row, column]


def triangle_colour(triangle, uv_layer, pixels):
    corners = [loop[uv_layer].uv for loop in triangle.loops]
    centre = sum(corners, Vector((0.0, 0.0))) / 3
    samples = [centre] + [centre.lerp(corner, 0.5) for corner in corners]
    return numpy.mean([read_texel(pixels, sample) for sample in samples], axis=0)


def reference_colours(reference, pixels):
    uv_layer = reference.loops.layers.uv.active
    if uv_layer is None:
        return None
    return [triangle_colour(triangle, uv_layer, pixels) for triangle in reference.faces]


def face_sample_points(face):
    centre = face.calc_center_median()
    points = [centre]
    for weight in INSET_WEIGHTS:
        points.extend(centre.lerp(vertex.co, weight) for vertex in face.verts)
    return points


def most_representative(colours):
    colours = numpy.array(colours)
    distances = numpy.linalg.norm(colours[:, None] - colours[None, :], axis=2).sum(axis=1)
    return colours[int(numpy.argmin(distances))]


def facet_colour(face, tree, colours):
    hits = [tree.find_nearest(point)[2] for point in face_sample_points(face)]
    return most_representative([colours[index] for index in hits])


def to_hex(colour):
    red, green, blue = (int(round(channel * 255)) for channel in colour)
    return f"#{red:02x}{green:02x}{blue:02x}"


def transfer_facet_colours(surface, reference, pixels):
    colours = reference_colours(reference, pixels)
    if colours is None:
        return []
    reference.faces.index_update()
    tree = BVHTree.FromBMesh(reference)
    return [to_hex(facet_colour(face, tree, colours)) for face in surface.faces]


def srgb_to_linear(channel):
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def hex_to_linear_rgba(code):
    red, green, blue = (int(code[index : index + 2], 16) / 255 for index in (1, 3, 5))
    return (srgb_to_linear(red), srgb_to_linear(green), srgb_to_linear(blue), 1.0)


def paint_polygons(mesh, colours):
    attribute = mesh.color_attributes.new(COLOUR_ATTRIBUTE, "FLOAT_COLOR", "CORNER")
    for polygon, code in zip(mesh.polygons, colours):
        for corner in polygon.loop_indices:
            attribute.data[corner].color = hex_to_linear_rgba(code)
    mesh.color_attributes.active_color = attribute
