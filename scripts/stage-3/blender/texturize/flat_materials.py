import os
import bpy


def create_flat_material(name: str, texture_path: str):
    image = bpy.data.images.load(texture_path, check_existing=True)
    material = bpy.data.materials.new(f"Flat_{name}")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    texture.interpolation = "Linear"
    texture.extension = "EXTEND"

    emission = nodes.new("ShaderNodeEmission")
    output = nodes.new("ShaderNodeOutputMaterial")

    links.new(texture.outputs["Color"], emission.inputs["Color"])
    links.new(emission.outputs["Emission"], output.inputs["Surface"])
    return material


def attach_materials_and_export(surface, names: list, flat_dir: str, pattern: str, output_glb: str):
    mesh = bpy.data.meshes.new("Reduce_Flat")
    surface.to_mesh(mesh)
    surface.free()

    for name in names:
        path = os.path.join(flat_dir, pattern.format(name=name))
        mesh.materials.append(create_flat_material(name, path))

    for polygon in mesh.polygons:
        polygon.use_smooth = False

    item = bpy.data.objects.new("Reduce_Flat", mesh)
    bpy.context.scene.collection.objects.link(item)

    bpy.ops.object.select_all(action="DESELECT")
    item.select_set(True)
    bpy.context.view_layer.objects.active = item

    bpy.ops.export_scene.gltf(
        filepath=output_glb,
        export_format="GLB",
        use_selection=True,
    )
