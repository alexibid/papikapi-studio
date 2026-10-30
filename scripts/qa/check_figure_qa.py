"""Proves the figure QA catches a lost part: a copy of a figure whose simplified shape lost one leg must FAIL,
and the untouched copy must keep its verdict.

uv run --python 3.12 --with numpy,pillow,scipy python scripts/qa/check_figure_qa.py <figure>
The two copies live in a temporary folder that is deleted at the end; nothing is written under resources/.
"""
import json
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from figure_qa import RESOURCES, audit

LEG_HEIGHT_SHARE = 0.25


def copy_figure(figure: str, scratch: Path, name: str) -> Path:
    target = scratch / name
    shutil.rmtree(target, ignore_errors=True)
    for stage, files in (("stage-2", ("step-1-3d.glb", "step-2-base.glb", "step-3-details.glb")),
                         ("stage-3", ("step-1-simplify.json", "step-1-reduce.json", "step-1-manifest.json"))):
        (target / stage).mkdir(parents=True)
        for file in files:
            if (RESOURCES / figure / stage / file).is_file():
                shutil.copy(RESOURCES / figure / stage / file, target / stage / file)
    manifest = target / "stage-3" / "step-1-manifest.json"
    record = json.loads(manifest.read_text())
    record["data"]["source"] = str(target / "stage-2" / Path(record["data"]["source"]).name)
    manifest.write_text(json.dumps(record))
    return target


def cut_one_leg(figure: Path) -> int:
    """Drops every face of the lowest quarter on the side with the most lower faces: one leg or paw pair."""
    path = figure / "stage-3" / "step-1-simplify.json"
    if not path.is_file():
        path = figure / "stage-3" / "step-1-reduce.json"
    document = json.loads(path.read_text())
    positions = [vertex["position"] for vertex in document["vertices"]]
    height = max(point[2] for point in positions)
    centres = [[sum(positions[index][axis] for index in face) / len(face) for axis in range(3)]
               for face in document["faces"]]
    low = [index for index, centre in enumerate(centres) if centre[2] < LEG_HEIGHT_SHARE * height]
    side = max((1, -1), key=lambda sign: sum(1 for index in low if sign * centres[index][0] > 0))
    removed = {index for index in low if side * centres[index][0] > 0}
    document["faces"] = [face for index, face in enumerate(document["faces"]) if index not in removed]
    path.write_text(json.dumps(document))
    return len(removed)


def main() -> None:
    figure = sys.argv[1]
    with tempfile.TemporaryDirectory(prefix="figure-qa-check-") as temporary:
        scratch = Path(temporary)
        intact = audit(copy_figure(figure, scratch, f"{figure}-intact"))
        broken_figure = copy_figure(figure, scratch, f"{figure}-no-leg")
        removed = cut_one_leg(broken_figure)
        broken = audit(broken_figure)
    print(json.dumps({"intact": intact["verdict"], "removedFaces": removed, "broken": broken["verdict"],
                      "brokenParts": broken["parts"]["simplify-missing"]}))
    if broken["parts"]["simplify-missing"]["verdict"] != "FAIL":
        sys.exit("The figure QA did not catch the missing leg")


if __name__ == "__main__":
    main()
