import bmesh
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

from view_choice import ViewChooser

PLACED = (0.86, 0.86, 0.84, 1.0)
CURRENT = (0.97, 0.56, 0.22, 1.0)
COVER = (0.93, 0.89, 0.82, 1.0)
WHITE = (1.0, 1.0, 1.0)
ELEVATION = 0.35
FRAMING = 1.04


class StepScene:
    def __init__(self, source, pieces, size):
        self.source = source
        self.pieces = pieces
        self.piece_of_face = {face_id: piece["number"] for piece in pieces for face_id in piece["faceIds"]}
        corners = [source.matrix_world @ Vector(corner) for corner in source.bound_box]
        self.centre = sum(corners, Vector()) / len(corners)
        self.radius = max((corner - self.centre).length for corner in corners)
        self.materials = [self.material("placed", PLACED), self.material("current", CURRENT), self.material("cover", COVER)]
        self.camera = self.build_camera()
        self.configure(size)
        source.hide_render = True

    @staticmethod
    def material(name, color):
        material = bpy.data.materials.new(name)
        material.diffuse_color = color
        return material

    def configure(self, size):
        scene = bpy.context.scene
        scene.render.engine = "BLENDER_WORKBENCH"
        scene.render.resolution_x = size
        scene.render.resolution_y = size
        scene.render.film_transparent = False
        scene.view_settings.view_transform = "Standard"
        scene.display.shading.light = "STUDIO"
        scene.display.shading.color_type = "MATERIAL"
        scene.display.shading.show_object_outline = True
        scene.display.shading.show_cavity = False
        if scene.world is None:
            scene.world = bpy.data.worlds.new("World")
        scene.world.color = WHITE
        scene.camera = self.camera

    def build_camera(self):
        data = bpy.data.cameras.new("StepCamera")
        data.type = "ORTHO"
        data.ortho_scale = 2 * self.radius * FRAMING
        camera = bpy.data.objects.new("StepCamera", data)
        bpy.context.scene.collection.objects.link(camera)
        return camera

    def frame(self, face_ids):
        world = self.source.matrix_world
        mesh = self.source.data
        points = [world @ mesh.vertices[index].co for face_id in face_ids for index in mesh.polygons[face_id].vertices]
        low = Vector([min(point[axis] for point in points) for axis in range(3)])
        high = Vector([max(point[axis] for point in points) for axis in range(3)])
        centre = (low + high) / 2
        radius = max((point - centre).length for point in points)
        self.camera.data.ortho_scale = 2 * radius * FRAMING
        return centre

    def aim(self, direction, centre):
        view = direction.normalized()
        self.camera.location = centre + view * self.radius * 4
        self.camera.rotation_euler = (-view).to_track_quat("-Z", "Y").to_euler()
        bpy.context.view_layer.update()
        return view

    def build_object(self, visible_faces, material_of):
        mesh_builder = bmesh.new()
        mesh_builder.from_mesh(self.source.data)
        mesh_builder.faces.ensure_lookup_table()
        hidden = [face for face in mesh_builder.faces if face.index not in visible_faces]
        for face in mesh_builder.faces:
            face.material_index = material_of(face.index)
        bmesh.ops.delete(mesh_builder, geom=hidden, context="FACES")
        mesh = bpy.data.meshes.new("StepMesh")
        mesh_builder.to_mesh(mesh)
        mesh_builder.free()
        for material in self.materials:
            mesh.materials.append(material)
        item = bpy.data.objects.new("StepMesh", mesh)
        item.matrix_world = self.source.matrix_world
        bpy.context.scene.collection.objects.link(item)
        return item

    def shoot(self, item, image):
        bpy.context.scene.render.filepath = image
        bpy.ops.render.render(write_still=True)
        mesh = item.data
        bpy.data.objects.remove(item, do_unlink=True)
        bpy.data.meshes.remove(mesh)

    def render_cover(self, image):
        item = self.build_object(set(self.piece_of_face), lambda face_id: 2)
        self.aim(Vector((0.6, -1.0, ELEVATION)), self.frame(set(self.piece_of_face)))
        self.shoot(item, image)
        return image

    def project(self, cut, view, chooser):
        mesh = self.source.data
        edge = mesh.edges[cut["edge"]]
        world = self.source.matrix_world
        points = [world_to_camera_view(bpy.context.scene, self.camera, world @ mesh.vertices[index].co) for index in edge.vertices]
        visible = chooser.edge_visible(cut["edge"], cut["face"], view)
        return {"number": cut["number"], "a": [points[0].x, points[0].y], "b": [points[1].x, points[1].y], "visible": visible}

    def render_step(self, number, image):
        piece = self.pieces[number - 1]
        visible = {face_id for face_id, owner in self.piece_of_face.items() if owner <= number}
        item = self.build_object(visible, lambda face_id: 1 if self.piece_of_face.get(face_id) == number else 0)
        chooser = ViewChooser(self.source, visible)
        view = self.aim(chooser.best(piece["faceIds"]), self.frame(visible))
        glue = [self.project(cut, view, chooser) for cut in piece["cuts"] if cut["tab"]]
        self.shoot(item, image)
        return {"number": number, "image": image, "glue": glue}
