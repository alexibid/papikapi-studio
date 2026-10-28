"""Figure QA: does the simplified figure keep its volume and all its parts (paws, wheels, tail, ears...)?

uv run --python 3.12 --with numpy,pillow,scipy python scripts/qa/figure_qa.py [figure ...]
Two checks per figure, both on solid shapes, never on facets or shading:
- volume of the simplified figure (stage 3) against the shape it was made from: <=1% PASS, <=2% WARN, else FAIL;
- parts, from six silhouettes: the base cut must keep everything TRELLIS made above the cut plane and add nothing
  (no plinth leftover), and the simplification must keep everything the base has and add nothing. The largest
  missing or extra piece decides.
Evidence goes to resources/<figure>/qa/figure-qa/; the summary to resources/qa-summary/figure-qa.json.
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

APP = Path(__file__).resolve().parents[2]
RESOURCES = APP / "resources"
BLENDER = "/Applications/Blender.app/Contents/MacOS/Blender"
MASKS_SCRIPT = APP / "scripts" / "qa" / "blender" / "figure_masks.py"
RESULT_MARKER = "PAPERCRAFT_RESULT "
ERROR_MARKER = "PAPERCRAFT_ERROR "
RESOLUTION = 512
VOLUME_PASS, VOLUME_WARN = 1.0, 2.0
PART_WARN, PART_FAIL = 0.004, 0.01
EDGE_TOLERANCE_PX = 3
COMPARISONS = {"cut": ("raw", "base"), "simplify": ("base", "reduce")}


def base_of(figure: Path) -> Path:
    """The exact shape stage 3 simplified, as its manifest recorded it."""
    manifest = json.loads((figure / "stage-3" / "step-1-manifest.json").read_text())
    source = Path(manifest.get("data", {}).get("source", ""))
    fallback = figure / "stage-2" / "step-3-base.glb"
    for candidate in (source, fallback):
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(f"No stage-2 base for {figure.name} (expected {fallback.name})")


def raw_of(figure: Path) -> Path:
    """The TRELLIS output; older runs only kept the picked variant."""
    candidates = [figure / "stage-2" / "step-2-3d.glb", *sorted((figure / "stage-2").glob("step-2-3d-pick-*.glb"))]
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(f"No TRELLIS output for {figure.name}")


def simplify_of(figure: Path) -> Path:
    for name in ("step-1-simplify.json", "step-1-reduce.json"):
        candidate = figure / "stage-3" / name
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(f"No simplified mesh for {figure.name}")


def run_blender(figure: Path, output: Path) -> dict:
    settings = {"raw_glb": str(raw_of(figure)), "base_glb": str(base_of(figure)),
                "reduce_json": str(simplify_of(figure)),
                "output_dir": str(output / "masks"), "resolution": RESOLUTION}
    outcome = subprocess.run([BLENDER, "-b", "-P", str(MASKS_SCRIPT), "--", json.dumps(settings)],
                             capture_output=True, text=True)
    lines = (outcome.stdout + outcome.stderr).splitlines()
    for line in lines:
        if ERROR_MARKER in line:
            raise RuntimeError(json.loads(line.split(ERROR_MARKER, 1)[1]))
    for line in lines:
        if RESULT_MARKER in line:
            return json.loads(line.split(RESULT_MARKER, 1)[1])
    raise RuntimeError(f"Blender exited with code {outcome.returncode} without a result")


def mask(output: Path, shape: str, view: str) -> np.ndarray:
    return np.asarray(Image.open(output / "masks" / f"{shape}-{view}.png").convert("L")) > 127


def largest_missing(reference: np.ndarray, test: np.ndarray) -> tuple:
    """Biggest piece of the reference the test does not cover, ignoring a thin band along the outline."""
    missing = ndimage.binary_opening(reference & ~test, iterations=EDGE_TOLERANCE_PX)
    parts, count = ndimage.label(missing)
    if not count:
        return 0.0, None
    sizes = ndimage.sum(missing, parts, np.arange(1, count + 1))
    biggest = int(np.argmax(sizes)) + 1
    rows, cols = np.nonzero(parts == biggest)
    return float(sizes.max() / max(reference.sum(), 1)), [int(cols.mean()), int(rows.mean())]


def save_overlay(output: Path, name: str, reference: np.ndarray, test: np.ndarray) -> None:
    image = np.full(reference.shape + (3,), 229, dtype=np.uint8)
    image[test] = (120, 120, 120)
    image[reference & ~test] = (220, 30, 30)
    Image.fromarray(image).save(output / f"{name}.png")


def check_parts(output: Path, views: list) -> dict:
    """Per comparison, the worst missing piece (a part lost) and the worst extra piece (something added, such as a
    plinth leftover under the feet), over all views."""
    found = {}
    for comparison, (reference_name, test_name) in COMPARISONS.items():
        for kind, (first, second) in {"missing": (reference_name, test_name), "extra": (test_name, reference_name)}.items():
            worst = {"share": 0.0, "view": None, "at": None}
            for view in views:
                reference, test = mask(output, first, view), mask(output, second, view)
                share, centre = largest_missing(reference, test)
                if share > worst["share"]:
                    worst = {"share": round(share, 4), "view": view, "at": centre}
                    save_overlay(output, f"{comparison}-{kind}-worst", reference, test)
            worst["verdict"] = verdict(worst["share"], PART_WARN, PART_FAIL)
            found[f"{comparison}-{kind}"] = worst
    return found


def verdict(value: float, warn: float, fail: float) -> str:
    return "FAIL" if value > fail else "WARN" if value > warn else "PASS"


def audit(figure: Path) -> dict:
    output = figure / "qa" / "figure-qa"
    output.mkdir(parents=True, exist_ok=True)
    shapes = run_blender(figure, output)
    parts = check_parts(output, shapes["views"])
    volume = {"changePercent": shapes["volumeChangePercent"], "method": shapes["method"],
              "verdict": verdict(abs(shapes["volumeChangePercent"]), VOLUME_PASS, VOLUME_WARN)}
    verdicts = [volume["verdict"]] + [part["verdict"] for part in parts.values()]
    report = {"figure": figure.name, "faces": shapes["reduceFaces"], "volume": volume, "parts": parts,
              "openColumns": shapes["openColumns"],
              "verdict": "FAIL" if "FAIL" in verdicts else "WARN" if "WARN" in verdicts else "PASS"}
    (output / "report.json").write_text(json.dumps(report, indent=2))
    return report


def figures(names: list) -> list:
    chosen = [RESOURCES / name for name in names] if names else sorted(RESOURCES.iterdir())
    return [figure for figure in chosen if (figure / "stage-3" / "step-1-simplify.json").is_file() or (figure / "stage-3" / "step-1-reduce.json").is_file()]


def main() -> None:
    reports = []
    for figure in figures(sys.argv[1:]):
        try:
            report = audit(figure)
        except Exception as failure:
            report = {"figure": figure.name, "verdict": "ERROR", "error": str(failure)}
        reports.append(report)
        print(json.dumps(report), flush=True)
    summary = RESOURCES / "qa-summary"
    summary.mkdir(exist_ok=True)
    (summary / "figure-qa.json").write_text(json.dumps(reports, indent=2))


if __name__ == "__main__":
    main()
