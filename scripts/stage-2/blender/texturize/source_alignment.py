import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ITERATIONS = 40
TRIM_FRACTION = 0.6
BODY_START_RATIO = 0.35
CONVERGED_METRES = 1e-5


def vertical_range(points):
    heights = [point.z for point in points]
    return min(heights), max(heights)


def upper_part(points, start_ratio):
    low, high = vertical_range(points)
    return [point for point in points if point.z >= low + start_ratio * (high - low)]


def centre(points):
    return sum(points, Vector()) / len(points)


def initial_shift(source_points, target_points):
    source_top = upper_part(source_points, 0.5)
    target_top = upper_part(target_points, 0.5)
    shift = centre(target_top) - centre(source_top)
    shift.z = vertical_range(target_points)[1] - vertical_range(source_points)[1]
    return shift


def source_tree(source):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    return BVHTree.FromObject(source, depsgraph)


def refinement_step(tree, body_points, shift):
    offsets = []
    for point in body_points:
        nearest, _, _, _ = tree.find_nearest(point - shift)
        offsets.append((nearest + shift) - point)
    offsets.sort(key=lambda offset: offset.length)
    kept = offsets[: max(1, int(len(offsets) * TRIM_FRACTION))]
    return -centre(kept)


def aligning_shift(source, target_points):
    source_points = [vertex.co.copy() for vertex in source.data.vertices]
    shift = initial_shift(source_points, target_points)
    tree = source_tree(source)
    body_points = upper_part(target_points, BODY_START_RATIO)
    for _ in range(ITERATIONS):
        correction = refinement_step(tree, body_points, shift)
        shift = shift + correction
        if correction.length < CONVERGED_METRES:
            break
    return shift


def align_source(source, target_points):
    source.location = source.location + aligning_shift(source, target_points)
    bpy.ops.object.select_all(action="DESELECT")
    source.select_set(True)
    bpy.context.view_layer.objects.active = source
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
