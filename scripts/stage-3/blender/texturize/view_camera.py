import bpy
from mathutils import Vector

VIEWS = {
    "front": (Vector((0, 1, 0)), Vector((1, 0, 0)), Vector((0, 0, 1))),
    "back": (Vector((0, -1, 0)), Vector((-1, 0, 0)), Vector((0, 0, 1))),
    "right": (Vector((-1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))),
    "left": (Vector((1, 0, 0)), Vector((0, -1, 0)), Vector((0, 0, 1))),
    "top": (Vector((0, 0, -1)), Vector((1, 0, 0)), Vector((0, 1, 0))),
    "bottom": (Vector((0, 0, 1)), Vector((1, 0, 0)), Vector((0, -1, 0))),
}


def create_ortho_camera(scene):
    data = bpy.data.cameras.new("OrthoViewCamera")
    data.type = "ORTHO"
    data.clip_start = 0.001
    data.clip_end = 100.0
    camera = bpy.data.objects.new("OrthoViewCamera", data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    return camera
