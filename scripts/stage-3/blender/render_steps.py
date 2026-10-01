import json
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import bpy

from papercraft_mesh import build_papercraft
from step_scene import StepScene

RESULT_MARKER = "PAPERCRAFT_RESULT "
ERROR_MARKER = "PAPERCRAFT_ERROR "


def read_settings():
    return json.loads(sys.argv[sys.argv.index("--") + 1])


def main():
    settings = read_settings()
    net = json.loads(Path(settings["input_net"]).read_text())
    bpy.ops.wm.read_factory_settings(use_empty=True)
    output_dir = Path(settings["output_dir"])
    output_dir.mkdir(parents=True, exist_ok=True)
    scene = StepScene(build_papercraft(net["mesh"]), net["pieces"], settings["image_size_px"])
    renders = {"cover": scene.render_cover(str(output_dir / "cover.png")), "steps": []}
    for piece in net["pieces"]:
        image = str(output_dir / f"step-{piece['number']:02d}.png")
        renders["steps"].append(scene.render_step(piece["number"], image))
    Path(settings["output_renders"]).write_text(json.dumps(renders))
    print(RESULT_MARKER + json.dumps({"steps": len(renders["steps"])}))


try:
    main()
except Exception as failure:
    traceback.print_exc()
    print(ERROR_MARKER + json.dumps(str(failure)))
    sys.exit(1)
