import json
import os
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import bmesh
import bpy
from flat_materials import attach_materials_and_export
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from surface_builder import build_surface_from_reduce_json
from uv_projector import assign_orthogonal_uvs
from view_selector import choose_best_views

RESULT_MARKER = "PAPERCRAFT_RESULT "
ERROR_MARKER = "PAPERCRAFT_ERROR "


def read_settings() -> dict:
    return json.loads(sys.argv[sys.argv.index("--") + 1])


def execute_projection(settings: dict) -> dict:
    reduce_json = settings["reduce_json"]
    views_dir = settings["views_dir"]
    flat_dir = settings.get("flat_dir") or os.path.join(views_dir, "svg")
    output_glb = settings["output_glb"]
    min_facing = float(settings.get("min_facing", 0.2))
    flat_pattern = settings.get("flat_pattern", "flat_{name}.png")

    with open(os.path.join(views_dir, "views.json")) as handle:
        views_data = json.load(handle)

    surface, shift = build_surface_from_reduce_json(reduce_json, views_data)
    tree = BVHTree.FromBMesh(surface)
    reach = (Vector(views_data["boundsMax"]) - Vector(views_data["boundsMin"])).length * 1.5

    names, chosen, hidden = choose_best_views(surface, views_data, tree, reach, min_facing)
    assign_orthogonal_uvs(surface, views_data, names, chosen)

    surface.normal_update()

    attach_materials_and_export(surface, names, flat_dir, flat_pattern, output_glb)

    usage = {name: int(chosen.count(i)) for i, name in enumerate(names)}
    return {
        "faces": len(chosen),
        "viewsUsage": usage,
        "hiddenFaces": hidden,
        "outputGlb": output_glb,
    }


def main():
    settings = read_settings()
    result = execute_projection(settings)
    print(RESULT_MARKER + json.dumps(result))


if __name__ == "__main__":
    try:
        main()
    except Exception as failure:
        traceback.print_exc()
        print(ERROR_MARKER + json.dumps(str(failure)))
        sys.exit(1)
