from box_cells import occupied_cells
from box_planes import box_planes
from box_surface import build_cell_surface, merge_coplanar_faces
from box_voxels import voxel_occupancy
from box_yaw import estimate_yaw, rotate_about_vertical


def fit_box_union(surface, length, settings):
    yaw = estimate_yaw(surface)
    rotate_about_vertical(surface, -yaw)
    cell = length / settings["box_voxel_resolution"]
    grid, low = voxel_occupancy(surface, cell)
    planes = box_planes(grid, low, cell, settings)
    union = build_cell_surface(occupied_cells(grid, planes, low, cell), planes)
    merge_coplanar_faces(union)
    rotate_about_vertical(surface, yaw)
    rotate_about_vertical(union, yaw)
    return union
