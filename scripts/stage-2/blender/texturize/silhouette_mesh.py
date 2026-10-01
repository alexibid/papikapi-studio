import bpy
import numpy

SILHOUETTE_FACES = 900


def silhouette_mesh(source):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    copy = bpy.data.objects.new("SilhouetteCopy", source.data.copy())
    bpy.context.scene.collection.objects.link(copy)
    modifier = copy.modifiers.new("Reduce", "DECIMATE")
    modifier.ratio = min(1.0, SILHOUETTE_FACES / len(source.data.polygons))
    bpy.context.view_layer.update()
    evaluated = copy.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    points = [vertex.co.copy() for vertex in mesh.vertices]
    triangles = numpy.array([list(polygon.vertices) for polygon in mesh.polygons if len(polygon.vertices) == 3])
    evaluated.to_mesh_clear()
    bpy.data.objects.remove(copy, do_unlink=True)
    return points, triangles
