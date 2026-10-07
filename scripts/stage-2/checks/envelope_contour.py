# Blender script. Usage: blender -b --python envelope_contour.py -- <settings.json> <output.glb>
# Writes the body envelope (the shape that survives the opening) as a GLB made of voxel faces, so it can be seen.
import json
import sys

sys.path.insert(0, "scripts/stage-2/blender/base")
sys.path.insert(0, "scripts/stage-3/blender/key_points")
import bpy
import numpy
from envelope import VoxelGrid, dilate, erode, repeated, solid_voxels
from model_loader import load_grounded_mesh
from surface_repair import repair_surface

settings = json.loads(sys.argv[sys.argv.index("--") + 1])
output_path = sys.argv[sys.argv.index("--") + 2]
surface, length, _ = load_grounded_mesh(settings)
repair_surface(surface)
to_mm = settings["target_size_mm"] / length
grid = VoxelGrid(surface, settings["envelope_cell_mm"] / to_mm)
radius = round(settings["min_feature_mm"] / 2 / settings["envelope_cell_mm"])
opened = repeated(dilate, repeated(erode, solid_voxels(surface, grid), radius), radius)


def boundary_quads(mask, cell, origin):
    vertices, faces = [], []
    padded = numpy.pad(mask, 1)
    for axis in range(3):
        for sign in (1, -1):
            neighbour = numpy.roll(padded, -sign, axis=axis)
            exposed = numpy.argwhere(padded & ~neighbour) - 1
            for index in exposed:
                corner = [index[a] + (1 if (a == axis and sign == 1) else 0) for a in range(3)]
                others = [a for a in range(3) if a != axis]
                quad = []
                for du, dv in ((0, 0), (1, 0), (1, 1), (0, 1)):
                    point = list(corner)
                    point[others[0]] += du
                    point[others[1]] += dv
                    quad.append(len(vertices))
                    vertices.append(tuple(origin[a] + point[a] * cell for a in range(3)))
                faces.append(quad if sign == 1 else quad[::-1])
    return vertices, faces


vertices, faces = boundary_quads(opened, grid.cell, grid.origin)
mesh = bpy.data.meshes.new("Envelope")
mesh.from_pydata(vertices, [], faces)
item = bpy.data.objects.new("Envelope", mesh)
bpy.context.scene.collection.objects.link(item)
bpy.ops.object.select_all(action="DESELECT")
item.select_set(True)
bpy.ops.export_scene.gltf(filepath=output_path, export_format="GLB", use_selection=True)
print("CONTOUR voxels", int(opened.sum()), "faces", len(faces))
