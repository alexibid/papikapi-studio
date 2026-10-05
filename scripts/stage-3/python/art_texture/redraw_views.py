import json
import shutil
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import cv2

from view_selection import redrawn_view

RESULT_MARKER = "PAPERCRAFT_RESULT "
ERROR_MARKER = "PAPERCRAFT_ERROR "


def read_settings():
    return json.loads(sys.argv[sys.argv.index("--") + 1])


def process_views(settings):
    views_dir, sheets_dir, output = Path(settings["views_dir"]), Path(settings["sheets_dir"]), Path(settings["output_dir"])
    output.mkdir(parents=True, exist_ok=True)
    document = json.loads((views_dir / "views.json").read_text())
    shutil.copy(views_dir / "views.json", output / "views.json")
    report = {}
    for name, view in document["views"].items():
        sheet_path = sheets_dir / f"{name}.jpg"
        if not sheet_path.exists():
            shutil.copy(views_dir / view["file"], output / view["file"])
            continue
        original = cv2.imread(str(views_dir / view["file"]), cv2.IMREAD_UNCHANGED)
        image, index, score = redrawn_view(original, cv2.imread(str(sheet_path)), settings["columns"], settings["rows"])
        cv2.imwrite(str(output / view["file"]), image)
        report[name] = {"candidate": index, "overlap": round(score, 4)}
    return {"views": report}


try:
    print(RESULT_MARKER + json.dumps(process_views(read_settings())))
except Exception as failure:
    traceback.print_exc()
    print(ERROR_MARKER + json.dumps(str(failure)))
    sys.exit(1)
