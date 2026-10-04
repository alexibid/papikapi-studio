import bpy
from mathutils import Matrix, Vector

VIEWS = {
    "front": (Vector((0, 1, 0)), Vector((1, 0, 0)), Vector((0, 0, 1))),
    "back": (Vector((0, -1, 0)), Vector((-1, 0, 0)), Vector((0, 0, 1))),
    "right": (Vector((-1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))),
    "left": (Vector((1, 0, 0)), Vector((0, -1, 0)), Vector((0, 0, 1))),
    "top": (Vector((0, 0, -1)), Vector((1, 0, 0)), Vector((0, 1, 0))),
    "bottom": (Vector((0, 0, 1)), Vector((1, 0, 0)), Vector((0, -1, 0))),
}


def world_bounds(meshes):
    corners = [obj.matrix_world @ Vector(coord) for obj in meshes for coord in obj.bound_box]
    low = Vector(min(coord[i] for coord in corners) for i in range(3))
    high = Vector(max(coord[i] for coord in corners) for i in range(3))
    return low, high


def create_ortho_camera(scene):
    data = bpy.data.cameras.new("OrthoViewCamera")
    data.type = "ORTHO"
    data.clip_start = 0.001
    data.clip_end = 100.0
    camera = bpy.data.objects.new("OrthoViewCamera", data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    return camera


def configure_view_camera(camera, view_name: str, low: Vector, high: Vector, margin: float = 0.0):
    direction, right, up = VIEWS[view_name]
    centre = (low + high) / 2.0
    extent_u = abs(right.dot(high - low))
    extent_v = abs(up.dot(high - low))
    camera.data.ortho_scale = max(extent_u, extent_v) * (1.0 + margin)
    distance = (high - low).length * 2.0
    rotation = Matrix((right, up, -direction)).transposed()
    camera.matrix_world = Matrix.Translation(centre - direction * distance) @ rotation.to_4x4()
