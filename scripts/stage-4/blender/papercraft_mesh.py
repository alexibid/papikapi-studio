import bpy

PAPERCRAFT_NAME = "Papercraft"


def mesh_to_document(mesh):
    return {
        "vertices": [list(vertex.co) for vertex in mesh.vertices],
        "faces": [list(polygon.vertices) for polygon in mesh.polygons],
    }


def build_papercraft(document):
    mesh = bpy.data.meshes.new(PAPERCRAFT_NAME)
    mesh.from_pydata(document["vertices"], [], document["faces"])
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = False
    item = bpy.data.objects.new(PAPERCRAFT_NAME, mesh)
    bpy.context.scene.collection.objects.link(item)
    return item


def rebuild_canonically(item):
    document = mesh_to_document(item.data)
    mesh = item.data
    bpy.data.objects.remove(item, do_unlink=True)
    bpy.data.meshes.remove(mesh)
    return build_papercraft(document)
