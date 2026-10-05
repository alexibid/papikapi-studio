import bmesh
from mathutils import Vector

from box_voxels import voxel_occupancy
from surface_repair import close_holes

SLAB_REFERENCE_HEIGHT = 0.2


def layer_footprints(surface, cell):
    grid, _ = voxel_occupancy(surface, cell)
    return grid.sum(axis=(0, 1))


def count_slab_layers(footprints, ratio, max_layers):
    reference = footprints[int(len(footprints) * SLAB_REFERENCE_HEIGHT)]
    layers = 0
    while layers < len(footprints) and footprints[layers] > ratio * reference:
        layers += 1
    return layers if layers <= max_layers else 0


def trim_below(surface, level):
    geometry = list(surface.verts) + list(surface.edges) + list(surface.faces)
    bmesh.ops.bisect_plane(
        surface,
        geom=geometry,
        dist=1e-7,
        plane_co=(0, 0, level),
        plane_no=(0, 0, 1),
        clear_inner=True,
    )
    close_holes(surface)
    bmesh.ops.translate(surface, vec=(0, 0, -level), verts=surface.verts)
    surface.normal_update()


def remove_slab(surface, length, offset, settings):
    cell = length / settings["box_voxel_resolution"]
    max_layers = settings["box_slab_max_thickness_ratio"] * settings["box_voxel_resolution"]
    layers = count_slab_layers(layer_footprints(surface, cell), settings["box_slab_footprint_ratio"], max_layers)
    if layers == 0:
        return offset
    level = layers * cell
    trim_below(surface, level)
    return offset + Vector((0, 0, -level))
