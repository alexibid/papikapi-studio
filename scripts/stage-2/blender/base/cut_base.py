import json
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent / "key_points"))

import bpy
from figure_base import cut_figure_base
from mesh_quality import open_and_non_manifold_edges
from model_loader import load_grounded_mesh
from surface_repair import repair_surface

RESULT_MARKER = "PAPERCRAFT_RESULT "
ERROR_MARKER = "PAPERCRAFT_ERROR "


def read_settings():
    return json.loads(sys.argv[sys.argv.index("--") + 1])


def export_glb(surface, output_path):
    mesh = bpy.data.meshes.new("Figure")
    surface.to_mesh(mesh)
    item = bpy.data.objects.new("Figure", mesh)
    bpy.context.scene.collection.objects.link(item)
    bpy.ops.object.select_all(action="DESELECT")
    item.select_set(True)
    bpy.context.view_layer.objects.active = item
    bpy.ops.export_scene.gltf(filepath=output_path, export_format="GLB", use_selection=True, export_materials="NONE")


def main():
    settings = read_settings()
    surface, _, _ = load_grounded_mesh(settings)
    repair_surface(surface)
    statistics = cut_figure_base(surface, settings["base_cut_lift_ratio"])
    repair_surface(surface)
    open_edges, non_manifold = open_and_non_manifold_edges(surface)
    export_glb(surface, settings["output_glb"])
    print(
        RESULT_MARKER
        + json.dumps(
            {
                "faces": len(surface.faces),
                "openEdges": open_edges,
                "nonManifoldEdges": non_manifold,
                "airtight": open_edges == 0 and non_manifold == 0,
                "removedIslands": statistics["removed_islands"],
                "loops": statistics["loops"],
                "widthMm": round(statistics["width"] * 1000, 1),
                "lengthMm": round(statistics["length"] * 1000, 1),
            }
        )
    )


try:
    main()
except Exception as failure:
    traceback.print_exc()
    print(ERROR_MARKER + json.dumps(str(failure)))
    sys.exit(1)
