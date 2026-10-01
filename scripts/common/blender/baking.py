import bmesh
import bpy


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_model(glb_path):
    bpy.ops.import_scene.gltf(filepath=glb_path)
    meshes = [item for item in bpy.context.scene.objects if item.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"No mesh found in {glb_path}")
    bpy.ops.object.select_all(action="DESELECT")
    for item in meshes:
        item.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.join()
    merged = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return merged


def remove_metal(source):
    for material in source.data.materials:
        if not material or not material.node_tree:
            continue
        bsdf = material.node_tree.nodes.get("Principled BSDF")
        if bsdf and "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = 0.0


def link_object(name, mesh):
    item = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(item)
    return item


def triangulate(target):
    builder = bmesh.new()
    builder.from_mesh(target.data)
    bmesh.ops.triangulate(builder, faces=builder.faces, quad_method="BEAUTY")
    builder.to_mesh(target.data)
    builder.free()
    for polygon in target.data.polygons:
        polygon.use_smooth = False


def build_cage(target, extrusion):
    mesh = target.data.copy()
    mesh.name = f"{target.name}_Cage"
    for vertex in mesh.vertices:
        vertex.co = vertex.co + vertex.normal * extrusion
    mesh.update()
    return link_object(mesh.name, mesh)


def create_image(name, width, height, colour):
    image = bpy.data.images.new(name, width, height, alpha=False)
    image.generated_color = colour
    image.colorspace_settings.name = "sRGB"
    return image


def attach_image_material(target, name, image):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    nodes.active = texture
    target.data.materials.append(material)
    return material


def show_texture_as_colour(material):
    nodes = material.node_tree.nodes
    texture = next(node for node in nodes if node.bl_idname == "ShaderNodeTexImage")
    material.node_tree.links.new(texture.outputs["Color"], nodes["Principled BSDF"].inputs["Base Color"])


def configure_bake(cage, settings, length):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = settings["bake_samples"]
    bake = scene.render.bake
    bake.use_selected_to_active = True
    bake.use_cage = True
    bake.cage_object = cage
    bake.max_ray_distance = settings["max_ray_distance_ratio"] * length
    bake.margin = settings["bleed_px"]
    bake.margin_type = "EXTEND"
    bake.use_pass_direct = False
    bake.use_pass_indirect = False
    bake.use_pass_color = True
    bake.use_clear = False


def bake_colour(source, target, cage, settings, length):
    configure_bake(cage, settings, length)
    bpy.ops.object.select_all(action="DESELECT")
    source.select_set(True)
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.bake(type="DIFFUSE")
