"""Blender: mesh closure report and turntable renders of a GLB exactly as delivered (materials untouched).

blender -b -P inspect_glb.py -- <input.glb> <output_dir> [albedo]
"albedo" renders the base colour texture unlit, to read the colours TRELLIS baked without any shading.
"""
import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

AZIMUTHS = (0, 30, 60, 90, 180, 270, 330)
ELEVATION = 8
RESOLUTION = 1024
BACKGROUND = (0.898, 0.898, 0.898, 1.0)
WELD_DISTANCE = 1e-6


def mesh_report(meshes: list) -> dict:
    report = {"faces": 0, "boundaryEdges": 0, "nonManifoldEdges": 0, "islands": 0}
    for obj in meshes:
        mesh = bmesh.new()
        mesh.from_mesh(obj.data)
        # glTF splits vertices along UV seams; weld by position so seams are not counted as holes.
        bmesh.ops.remove_doubles(mesh, verts=mesh.verts, dist=WELD_DISTANCE)
        report["faces"] += len(mesh.faces)
        report["boundaryEdges"] += sum(1 for edge in mesh.edges if edge.is_boundary)
        report["nonManifoldEdges"] += sum(1 for edge in mesh.edges if not edge.is_manifold and not edge.is_boundary)
        report["islands"] += count_islands(mesh)
        mesh.free()
    report["closed"] = report["boundaryEdges"] == 0 and report["nonManifoldEdges"] == 0
    return report


def count_islands(mesh) -> int:
    unvisited = set(mesh.verts)
    islands = 0
    while unvisited:
        islands += 1
        stack = [unvisited.pop()]
        while stack:
            vert = stack.pop()
            for edge in vert.link_edges:
                neighbour = edge.other_vert(vert)
                if neighbour in unvisited:
                    unvisited.remove(neighbour)
                    stack.append(neighbour)
    return islands


def setup_scene():
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 32
    scene.render.resolution_x = scene.render.resolution_y = RESOLUTION
    scene.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("Studio")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = BACKGROUND
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0
    scene.world = world
    return scene


def show_albedo() -> None:
    for material in bpy.data.materials:
        nodes, links = material.node_tree.nodes, material.node_tree.links
        principled = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
        texture = principled.inputs["Base Color"].links[0].from_node
        emission = nodes.new("ShaderNodeEmission")
        links.new(texture.outputs["Color"], emission.inputs["Color"])
        output = next(node for node in nodes if node.type == "OUTPUT_MATERIAL")
        links.new(emission.outputs["Emission"], output.inputs["Surface"])


def frame_camera(scene, meshes: list) -> tuple:
    corners = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    centre = sum(corners, Vector()) / len(corners)
    radius = max((corner - centre).length for corner in corners)
    camera = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = radius * 2.1
    scene.collection.objects.link(camera)
    scene.camera = camera
    return camera, centre, radius


def render_turntable(scene, camera, centre: Vector, radius: float, output_dir: str) -> None:
    for azimuth in AZIMUTHS:
        angle, tilt = math.radians(azimuth), math.radians(ELEVATION)
        direction = Vector((math.sin(angle) * math.cos(tilt), -math.cos(angle) * math.cos(tilt), math.sin(tilt)))
        camera.location = centre + direction * radius * 4
        camera.rotation_euler = (centre - camera.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(output_dir, f"az{azimuth:03d}.png")
        bpy.ops.render.render(write_still=True)


def main():
    arguments = sys.argv[sys.argv.index("--") + 1:]
    input_glb, output_dir = arguments[:2]
    os.makedirs(output_dir, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = setup_scene()
    bpy.ops.import_scene.gltf(filepath=input_glb)
    meshes = [obj for obj in scene.objects if obj.type == "MESH"]
    report = mesh_report(meshes)
    with open(os.path.join(output_dir, "mesh-report.json"), "w") as stream:
        json.dump(report, stream, indent=2)
    print("MESH_REPORT", json.dumps(report))
    if "albedo" in arguments[2:]:
        show_albedo()
    camera, centre, radius = frame_camera(scene, meshes)
    render_turntable(scene, camera, centre, radius, output_dir)


main()
