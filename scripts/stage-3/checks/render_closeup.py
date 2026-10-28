"""Blender: close-up render of one region of a GLB, to compare small details (eyes, nose, mouth) between steps.

blender -b -P render_closeup.py -- <input.glb> <output.png> <azimuth_deg> <centre_x> <centre_z> <size>
centre_x, centre_z and size are fractions of the figure's bounding box (0..1, x across the camera, z up).
"""
import math
import sys

import bpy
from mathutils import Vector

RESOLUTION = 1024
ELEVATION = 8
BACKGROUND = (0.898, 0.898, 0.898, 1.0)


def setup_scene():
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 32
    scene.render.resolution_x = scene.render.resolution_y = RESOLUTION
    scene.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("Studio")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = BACKGROUND
    scene.world = world
    return scene


def bounds(meshes):
    corners = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    low = Vector([min(c[axis] for c in corners) for axis in range(3)])
    high = Vector([max(c[axis] for c in corners) for axis in range(3)])
    return low, high


def main():
    arguments = sys.argv[sys.argv.index("--") + 1:]
    input_glb, output_png = arguments[:2]
    azimuth, centre_x, centre_z, size = (float(value) for value in arguments[2:6])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = setup_scene()
    bpy.ops.import_scene.gltf(filepath=input_glb)
    meshes = [obj for obj in scene.objects if obj.type == "MESH"]
    low, high = bounds(meshes)
    extent = high - low
    angle, tilt = math.radians(azimuth), math.radians(ELEVATION)
    direction = Vector((math.sin(angle) * math.cos(tilt), -math.cos(angle) * math.cos(tilt), math.sin(tilt)))
    across = Vector((math.cos(angle), math.sin(angle), 0.0))
    middle = (low + high) / 2
    target = Vector((middle.x, middle.y, low.z)) + across * (centre_x - 0.5) * max(extent.x, extent.y)
    target.z = low.z + centre_z * extent.z
    camera = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = size * extent.z
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.location = target + direction * extent.length * 2
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = output_png
    bpy.ops.render.render(write_still=True)


main()
