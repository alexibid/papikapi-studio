"""Edge-collapse decimation shrinks convex shapes. Moving every vertex a small, uniform distance along its normal
gives the volume back without changing the silhouette's proportions."""
import bmesh
from mathutils import Matrix, Vector

from mesh_quality import enclosed_volume

RESTORE_PASSES = 4


def surface_area(surface):
    return sum(face.calc_area() for face in surface.faces)


def offset_along_normals(surface, distance):
    surface.normal_update()
    moves = [(vertex, vertex.normal.copy()) for vertex in surface.verts]
    for vertex, normal in moves:
        vertex.co += normal * distance
    surface.normal_update()


def reseat_on_ground(surface):
    lowest = min(vertex.co.z for vertex in surface.verts)
    bmesh.ops.transform(surface, matrix=Matrix.Translation(Vector((0.0, 0.0, -lowest))), verts=surface.verts)


def restore_volume(surface, target_volume):
    for _ in range(RESTORE_PASSES):
        missing = target_volume - enclosed_volume(surface)
        offset_along_normals(surface, missing / max(surface_area(surface), 1e-12))
    reseat_on_ground(surface)
    surface.normal_update()
