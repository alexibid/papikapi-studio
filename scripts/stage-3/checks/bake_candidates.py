import json
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from tail_metrics import model_tail

APP = Path(__file__).resolve().parents[3]
BLENDER = "/Applications/Blender.app/Contents/MacOS/Blender"
AUDIT = Path.home() / ".agents/skills/visual-qa/scripts/audit_regions.py"
FIT = APP / "scripts/stage-2/checks/trellis_fit.py"
CUT = APP / "scripts/stage-2/blender/base/cut_base.py"
BAKE = APP / "scripts/stage-3/art_bake/bake.py"
RESULT = "PAPERCRAFT_RESULT "
CUT_SETTINGS = {"weld_distance_ratio": 1e-05, "contact_height_ratio": 0.02, "base_cut_margin_ratios": [0.003, 0.01, 0.02, 0.035, 0.05]}


def blender_result(script: Path, settings: dict) -> dict:
    run = subprocess.run([BLENDER, "-b", "-P", str(script), "--", json.dumps(settings)], capture_output=True, text=True)
    lines = [line for line in run.stdout.splitlines() if line.startswith(RESULT)]
    if not lines:
        raise RuntimeError(f"{script.name}: {run.stdout[-300:]}")
    return json.loads(lines[-1][len(RESULT):])


def plinth_coloured_pixels(gate_dir: Path) -> int:
    total = 0
    for view in ("fit", "right", "back", "left"):
        image = cv2.imread(str(gate_dir / f"baked-base-{view}.png"), cv2.IMREAD_UNCHANGED)
        hsv = cv2.cvtColor(image[:, :, :3], cv2.COLOR_BGR2HSV_FULL)
        hue = hsv[:, :, 0].astype(np.float32) * 360 / 256
        total += int(((hue >= 5) & (hue <= 40) & (hsv[:, :, 1] >= 77) & (hsv[:, :, 2] >= 77) & (image[:, :, 3] > 10)).sum())
    return total


def process(folder: Path, label: str, art: Path, art_upscaled: Path, reference: Path, regions: Path) -> dict:
    glb = folder / f"{label}.glb"
    fit = blender_result(FIT, {"glb": str(glb), "art": str(art), "output_dir": str(folder / "fit-tmp"), "label": label, "final_size": 256})
    work = folder / "baked" / label
    baked = work / "baked.glb"
    subprocess.run([sys.executable, str(BAKE), "--glb", str(glb), "--art", str(art_upscaled), "--azimuth", str(fit["azimuth"]), "--elevation", str(fit["elevation"]),
                    "--output", str(baked), "--texture", str(work / "atlas.png"), "--out", str(work)], check=True, capture_output=True)
    base = work / "baked-base.glb"
    cut = blender_result(CUT, {"input_glb": str(baked), "output_glb": str(base), **CUT_SETTINGS})
    gate_dir = work / "gate"
    gate = subprocess.run([sys.executable, str(AUDIT), "--glb", str(base), "--art", str(reference), "--regions", str(regions), "--out", str(gate_dir),
                           "--size", "3000", "--camera", str(fit["azimuth"]), str(fit["elevation"])], capture_output=True, text=True)
    report = json.loads((gate_dir / "baked-base-detail-gate.json").read_text())
    tail = model_tail([str(gate_dir / "baked-base-right.png"), str(gate_dir / "baked-base-left.png")])
    return {"label": label, "camera": [fit["azimuth"], fit["elevation"]], "airtight": cut["airtight"], "gate": report["gate"], "blocking": report["blocking"],
            "tail": tail, "plinthColouredPixels": plinth_coloured_pixels(gate_dir)}


def main():
    folder, art, art_upscaled, reference, regions = (Path(arg) for arg in sys.argv[1:6])
    for label in sys.argv[6:]:
        try:
            print(json.dumps(process(folder, label, art, art_upscaled, reference, regions)), flush=True)
        except Exception as failure:
            print(json.dumps({"label": label, "error": str(failure)[:300]}), flush=True)


main()
