#!/usr/bin/env python3
import argparse
import json
import os
import subprocess
import sys
import numpy as np
from PIL import Image, ImageDraw

BLENDER_EXEC = "/Applications/Blender.app/Contents/MacOS/Blender"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
RENDER_PANEL_SCRIPT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "blender", "texturize", "render_panel.py"))


def parse_arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-name", type=str, required=True)
    parser.add_argument("--resources-dir", type=str, default="resources")
    parser.add_argument("--resolution", type=int, default=1024)
    return parser.parse_args()


def load_bounds(views_dir):
    views_json = os.path.join(views_dir, "views.json")
    with open(views_json) as handle:
        data = json.load(handle)
    low = np.array(data["boundsMin"], dtype=float)
    high = np.array(data["boundsMax"], dtype=float)
    centre = np.array(data["centre"], dtype=float)
    return low, high, centre


def get_view_vectors(view_name):
    if view_name == "front":
        direction = np.array([0.0, 1.0, 0.0])
        right = np.array([1.0, 0.0, 0.0])
        up = np.array([0.0, 0.0, 1.0])
    elif view_name == "back":
        direction = np.array([0.0, -1.0, 0.0])
        right = np.array([-1.0, 0.0, 0.0])
        up = np.array([0.0, 0.0, 1.0])
    elif view_name == "left":
        direction = np.array([1.0, 0.0, 0.0])
        right = np.array([0.0, -1.0, 0.0])
        up = np.array([0.0, 0.0, 1.0])
    elif view_name == "right":
        direction = np.array([-1.0, 0.0, 0.0])
        right = np.array([0.0, 1.0, 0.0])
        up = np.array([0.0, 0.0, 1.0])
    elif view_name == "three-quarter":
        pos = np.array([1.0, -1.0, 0.8])
        direction = (-pos) / np.linalg.norm(pos)
        raw_right = np.cross(direction, np.array([0.0, 0.0, 1.0]))
        right = raw_right / np.linalg.norm(raw_right)
        raw_up = np.cross(right, direction)
        up = raw_up / np.linalg.norm(raw_up)
    else:
        raise ValueError(f"Unknown view {view_name}")
    return direction.tolist(), right.tolist(), up.tolist()


def render_panel(model_path, output_path, resolution, ortho_scale, centre, direction, right, up, distance):
    payload = json.dumps({
        "model_path": os.path.abspath(model_path),
        "output_path": os.path.abspath(output_path),
        "resolution": resolution,
        "ortho_scale": ortho_scale,
        "centre": centre,
        "direction": direction,
        "right": right,
        "up": up,
        "distance": distance,
    })
    cmd = [BLENDER_EXEC, "--background", "--python", RENDER_PANEL_SCRIPT, "--", payload]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"Blender render failed: {proc.stderr}")


def inspect_alpha_margin(image_path):
    img = Image.open(image_path).convert("RGBA")
    arr = np.array(img)
    alpha = arr[:, :, 3] > 10
    ys, xs = np.where(alpha)
    if len(xs) == 0:
        return False, [0, 0, 0, 0], {"left": 0.0, "right": 0.0, "top": 0.0, "bottom": 0.0}
    w, h = img.size
    x_min, x_max = int(xs.min()), int(xs.max())
    y_min, y_max = int(ys.min()), int(ys.max())
    m_left = x_min / w
    m_right = (w - 1 - x_max) / w
    m_top = y_min / h
    m_bottom = (h - 1 - y_max) / h
    min_m = min(m_left, m_right, m_top, m_bottom)
    touches = (x_min == 0 or x_max == w - 1 or y_min == 0 or y_max == h - 1)
    valid = (min_m >= 0.03) and not touches
    margins = {
        "left": round(float(m_left), 4),
        "right": round(float(m_right), 4),
        "top": round(float(m_top), 4),
        "bottom": round(float(m_bottom), 4),
    }
    return valid, [x_min, y_min, x_max, y_max], margins


def create_dual_panel_evidence(t_path, r_path, output_path, view_name, model_name):
    t_img = Image.open(t_path).convert("RGBA")
    r_img = Image.open(r_path).convert("RGBA")
    w, h = t_img.size

    canvas = Image.new("RGBA", (w * 2, h + 80), (18, 22, 28, 255))
    draw = ImageDraw.Draw(canvas)

    header = f"{model_name.upper()} - {view_name.upper()} VIEW COMPARISON (TRELLIS vs REDUCED TEXTURED)"
    draw.text((30, 20), header, fill=(240, 240, 240, 255))
    draw.text((30, 48), "Left: Original TRELLIS (high-poly baked) | Right: Reduced Texturized (Bézier vector projection)", fill=(120, 160, 200, 255))

    canvas.paste(t_img, (0, 80), t_img)
    canvas.paste(r_img, (w, 80), r_img)
    draw.line([(w, 80), (w, h + 80)], fill=(45, 55, 70, 255), width=2)
    canvas.save(output_path, "PNG")


def execute(model_name, resources_dir, resolution):
    model_dir = os.path.join(resources_dir, model_name)
    evidences_dir = os.path.join(model_dir, "evidences")
    os.makedirs(evidences_dir, exist_ok=True)

    views_dir = os.path.join(model_dir, "stage-2", "stage-2-step-3-views")
    if not os.path.exists(views_dir):
        views_dir = os.path.join(model_dir, "stage-3", "step-2-views")

    trellis_glb = os.path.join(model_dir, "stage-2", "step-3-base.glb")
    reduced_glb = os.path.join(model_dir, "stage-3", "step-2-texturize.glb")

    low, high, centre = load_bounds(views_dir)
    dimensions = high - low
    diag = float(np.linalg.norm(dimensions))
    distance = diag * 2.5

    views = ["front", "back", "left", "right", "three-quarter"]
    report = {"model": model_name, "views": {}, "allFullyInFrame": True}

    for view_name in views:
        direction, right, up = get_view_vectors(view_name)
        extent_u = abs(float(np.dot(right, dimensions)))
        extent_v = abs(float(np.dot(up, dimensions)))
        base_extent = max(extent_u, extent_v)

        margin_ratio = 0.08
        passed = False
        t_tmp = f"/tmp/{model_name}_{view_name}_t.png"
        r_tmp = f"/tmp/{model_name}_{view_name}_r.png"
        final_img = os.path.join(evidences_dir, f"{model_name}-trellis-vs-reduced-{view_name}-evidence.png")

        for attempt in range(5):
            ortho_scale = base_extent * (1.0 + margin_ratio)
            render_panel(trellis_glb, t_tmp, resolution, ortho_scale, centre.tolist(), direction, right, up, distance)
            render_panel(reduced_glb, r_tmp, resolution, ortho_scale, centre.tolist(), direction, right, up, distance)

            t_ok, t_bbox, t_margins = inspect_alpha_margin(t_tmp)
            r_ok, r_bbox, r_margins = inspect_alpha_margin(r_tmp)

            if t_ok and r_ok:
                passed = True
                create_dual_panel_evidence(t_tmp, r_tmp, final_img, view_name, model_name)
                report["views"][view_name] = {
                    "fullyInFrame": True,
                    "attempt": attempt + 1,
                    "marginRatio": round(margin_ratio, 4),
                    "trellis": {"bbox": t_bbox, "margins": t_margins},
                    "reduced": {"bbox": r_bbox, "margins": r_margins},
                    "outputFile": final_img,
                }
                print(f"Evidence {view_name}: PASS on attempt {attempt + 1} (margin {margin_ratio:.3f})")
                break
            else:
                margin_ratio += 0.04

        if not passed:
            report["allFullyInFrame"] = False
            raise RuntimeError(f"Framing verification failed for {view_name} after 5 attempts")

    report_path = os.path.join(evidences_dir, "evidence-report.json")
    with open(report_path, "w") as handle:
        json.dump(report, handle, indent=2)

    print("Evidence generation completed successfully.")
    print(json.dumps(report, indent=2))
    return report


def main():
    args = parse_arguments()
    execute(args.model_name, args.resources_dir, args.resolution)


if __name__ == "__main__":
    main()
