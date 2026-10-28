"""TRELLIS.2 meshes are hollow: every wall is two surfaces a few millimetres apart. Decimating that collapses
the walls and loses the volume, so only the outer surface is kept.

A face is enclosed when no ray from it escapes to infinity. The ground counts as closed (rays going down are
blocked): the base cut leaves the paws open at the bottom, and the inner wall must not see out through them.
The inner wall is one large connected block of enclosed faces (about half of a hollow TRELLIS surface); smaller
enclosed blocks are outer surface in crevices (inside an ear, between an arm and the body) and are kept, so a
figure that is not hollow keeps every face. A large enclosed block is only an inner wall when the outer wall is
a few millimetres away along its normals; the underside of a truck between its wheels is enclosed too, but far
from any other surface, and stays."""
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

RAY_DIRECTIONS = [Vector(direction).normalized() for direction in (
    (1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1),
    (1, 1, 1), (1, 1, -1), (1, -1, 1), (1, -1, -1), (-1, 1, 1), (-1, 1, -1), (-1, -1, 1), (-1, -1, -1),
)]
START_OFFSET_RATIO = 1e-5
MAX_WALL_GAP_RATIO = 0.006
GAP_SAMPLES = 400
UPWARD_DIRECTIONS = [direction for direction in RAY_DIRECTIONS if direction.z >= 0]


def escapes(tree, point, offset):
    return any(tree.ray_cast(point + direction * offset, direction)[0] is None for direction in UPWARD_DIRECTIONS)


def enclosed_faces(surface, length):
    tree = BVHTree.FromBMesh(surface)
    offset = length * START_OFFSET_RATIO
    return {face for face in surface.faces if not escapes(tree, face.calc_center_median(), offset)}


def connected_blocks(faces):
    remaining, blocks = set(faces), []
    while remaining:
        start = remaining.pop()
        stack, block = [start], [start]
        while stack:
            for edge in stack.pop().edges:
                for neighbour in edge.link_faces:
                    if neighbour in remaining:
                        remaining.remove(neighbour)
                        stack.append(neighbour)
                        block.append(neighbour)
        blocks.append(block)
    return blocks


def wall_gap(tree, block, length):
    """Median distance from the block to the nearest other surface along its normals (either side)."""
    offset = length * START_OFFSET_RATIO
    gaps = []
    for face in block[::max(1, len(block) // GAP_SAMPLES)]:
        centre, normal = face.calc_center_median(), face.normal
        hits = [tree.ray_cast(centre + direction * offset, direction)[3] for direction in (normal, -normal)]
        gaps.append(min((hit for hit in hits if hit is not None), default=float("inf")))
    return sorted(gaps)[len(gaps) // 2]


def is_inner_wall(tree, block, total_area, length, min_inner_share):
    large = sum(face.calc_area() for face in block) >= min_inner_share * total_area
    return large and wall_gap(tree, block, length) <= MAX_WALL_GAP_RATIO * length


def keep_outer_surface(surface, length, min_inner_share):
    """Deletes the inner wall and returns its share of the surface area."""
    total_area = sum(face.calc_area() for face in surface.faces)
    tree = BVHTree.FromBMesh(surface)
    inner = [face for block in connected_blocks(enclosed_faces(surface, length))
             if is_inner_wall(tree, block, total_area, length, min_inner_share) for face in block]
    inner_area = sum(face.calc_area() for face in inner)
    if inner:
        bmesh.ops.delete(surface, geom=inner, context="FACES")
    loose = [vertex for vertex in surface.verts if not vertex.link_faces]
    if loose:
        bmesh.ops.delete(surface, geom=loose, context="VERTS")
    surface.normal_update()
    return inner_area / total_area
