import json
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parents[3] / "stage-3" / "blender" / "key_points"))

import bpy
from appendages import remove_appendages
from figure_base import cut_figure_base
from mesh_quality import enclosed_volume, open_and_non_manifold_edges
from model_loader import load_grounded_mesh
from surface_repair import repair_surface

RESULT_MARKER = "PAPERCRAFT_RESULT "
ERROR_MARKER = "PAPERCRAFT_ERROR "


def read_settings():
    return json.loads(sys.argv[sys.argv.index("--") + 1])


def export_glb(surface, output_path, materials=None):
    mesh = bpy.data.meshes.new("Figure")
    surface.to_mesh(mesh)
    if materials:
        for mat in materials:
            mesh.materials.append(mat)
    item = bpy.data.objects.new("Figure", mesh)
    bpy.context.scene.collection.objects.link(item)
    bpy.ops.object.select_all(action="DESELECT")
    item.select_set(True)
    bpy.context.view_layer.objects.active = item
    bpy.ops.export_scene.gltf(filepath=output_path, export_format="GLB", use_selection=True, export_materials="EXPORT")


def build_base(settings, margin):
    surface, length, _ = load_grounded_mesh(settings)
    materials = list(bpy.data.materials)
    repair_surface(surface)
    statistics = cut_figure_base(surface, margin)
    volume_before = enclosed_volume(surface)
    statistics.update(remove_appendages(surface, length, settings))
    repair_surface(surface)
    statistics["appendage_volume_percent"] = round(100 * (volume_before - enclosed_volume(surface)) / volume_before, 3)
    open_edges, non_manifold = open_and_non_manifold_edges(surface)
    return {
        "surface": surface,
        "materials": materials,
        "statistics": statistics,
        "open": open_edges,
        "nonManifold": non_manifold,
        "margin": margin,
    }


def is_airtight(attempt):
    return attempt["open"] == 0 and attempt["nonManifold"] == 0


def first_airtight(settings):
    attempts = []
    for margin in settings["base_cut_margin_ratios"]:
        attempt = build_base(settings, margin)
        if is_airtight(attempt):
            return attempt
        attempts.append(attempt)
    return min(attempts, key=lambda attempt: attempt["open"] + attempt["nonManifold"])


def describe(attempt):
    statistics = attempt["statistics"]
    return {
        "faces": len(attempt["surface"].faces),
        "openEdges": attempt["open"],
        "nonManifoldEdges": attempt["nonManifold"],
        "airtight": is_airtight(attempt),
        "removedIslands": statistics["removed_islands"],
        "removedAppendages": statistics["appendages"],
        "appendageFaces": statistics["appendageFaces"],
        "appendageVolumePercent": statistics["appendage_volume_percent"],
        "loops": statistics["loops"],
        "widthMm": round(statistics["width"] * 1000, 1),
        "lengthMm": round(statistics["length"] * 1000, 1),
        "marginRatio": attempt["margin"],
    }


def main():
    settings = read_settings()
    attempt = first_airtight(settings)
    export_glb(attempt["surface"], settings["output_glb"], attempt.get("materials"))
    print(RESULT_MARKER + json.dumps(describe(attempt)))


if __name__ == "__main__":
    try:
        main()
    except Exception as failure:
        traceback.print_exc()
        print(ERROR_MARKER + json.dumps(str(failure)))
        sys.exit(1)
