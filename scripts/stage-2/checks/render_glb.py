# Blender script. Usage: blender -b --python render_glb.py -- <model.glb> <output-prefix> [vertex]
# Pass `vertex` to show the vertex colours instead of the texture.
# Renders a GLB from two sides and from above (<prefix>-0.png, <prefix>-1.png, <prefix>-2.png).
import math
import sys

import bpy
from mathutils import Vector

path, prefix, *options = sys.argv[sys.argv.index("--") + 1 :]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)
scene = bpy.context.scene
scene.render.engine = "BLENDER_WORKBENCH"
scene.display.shading.light = "STUDIO"
scene.display.shading.color_type = "VERTEX" if "vertex" in options else "TEXTURE"
scene.display.shading.light = "FLAT" if "vertex" in options else "STUDIO"
scene.display.shading.single_color = (0.8, 0.8, 0.8)
scene.render.resolution_x = scene.render.resolution_y = 700
scene.world = bpy.data.worlds.new("w")
scene.world.color = (0.9, 0.9, 0.9)
meshes = [o for o in scene.objects if o.type == "MESH"]
corners = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
centre = sum(corners, Vector()) / len(corners)
size = max(max(c[i] for c in corners) - min(c[i] for c in corners) for i in range(3))
camera = bpy.data.objects.new("c", bpy.data.cameras.new("c"))
scene.collection.objects.link(camera)
scene.camera = camera
camera.data.type = "ORTHO"
camera.data.ortho_scale = size * 1.2
for index, (azimuth, elevation) in enumerate(((35, 25), (215, 25), (0, 89))):
    a, e = math.radians(azimuth), math.radians(elevation)
    camera.location = centre + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * size * 3
    camera.rotation_euler = (centre - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = f"{prefix}-{index}.png"
    bpy.ops.render.render(write_still=True)
