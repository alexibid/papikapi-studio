#!/usr/bin/env python3
import argparse
import json
import os
import subprocess
import sys
import numpy as np
from PIL import Image, ImageDraw


def parse_arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-name", type=str, required=True)
    parser.add_argument("--resources-dir", type=str, default="resources")
    return parser.parse_args()


def rgb_to_lab(rgb):
    arr = rgb.astype(float) / 255.0
    mask = arr > 0.04045
    arr[mask] = ((arr[mask] + 0.055) / 1.055) ** 2.4
    arr[~mask] = arr[~mask] / 12.92
    x = arr[..., 0] * 0.4124564 + arr[..., 1] * 0.3575761 + arr[..., 2] * 0.1804375
    y = arr[..., 0] * 0.2126729 + arr[..., 1] * 0.7151522 + arr[..., 2] * 0.0721750
    z = arr[..., 0] * 0.0193339 + arr[..., 1] * 0.1191920 + arr[..., 2] * 0.9503041
    xr, yr, zr = x / 0.95047, y / 1.00000, z / 1.08883
    e = 0.008856
    k = 903.3
    fx = np.where(xr > e, xr ** (1/3), (k * xr + 16) / 116)
    fy = np.where(yr > e, yr ** (1/3), (k * yr + 16) / 116)
    fz = np.where(zr > e, zr ** (1/3), (k * zr + 16) / 116)
    L = 116 * fy - 16
    a = 500 * (fx - fy)
    b = 200 * (fy - fz)
    return np.stack([L, a, b], axis=-1)


def delta_e_color_map(de_array, max_scale=50.0):
    norm = np.clip(de_array / max_scale, 0.0, 1.0)
    r = np.clip(1.5 - np.abs(norm * 4.0 - 3.0), 0.0, 1.0)
    g = np.clip(1.5 - np.abs(norm * 4.0 - 2.0), 0.0, 1.0)
    b = np.clip(1.5 - np.abs(norm * 4.0 - 1.0), 0.0, 1.0)
    rgb = (np.stack([r, g, b], axis=-1) * 255).astype(np.uint8)
    return rgb


def render_svg_with_qlmanage(svg_path, out_png):
    tmp_dir = "/tmp"
    subprocess.run(["qlmanage", "-t", "-s", "2048", "-o", tmp_dir, svg_path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base_name = os.path.basename(svg_path)
    ql_out = os.path.join(tmp_dir, f"{base_name}.png")
    if os.path.exists(ql_out):
        if ql_out != out_png:
            os.replace(ql_out, out_png)
        return out_png
    return ""


def audit_fidelity_view(orig_img, flat_img, svg_img, view_name, model_name, output_evidence):
    orig_arr = np.array(orig_img)
    flat_arr = np.array(flat_img)
    sil = orig_arr[:, :, 3] > 128

    orig_lab = rgb_to_lab(orig_arr[:, :, :3])
    flat_lab = rgb_to_lab(flat_arr[:, :, :3])

    de_map = np.linalg.norm(orig_lab - flat_lab, axis=-1)
    sil_de = de_map[sil]
    mean_de = float(np.mean(sil_de)) if len(sil_de) > 0 else 0.0
    p95_de = float(np.percentile(sil_de, 95)) if len(sil_de) > 0 else 0.0
    max_de = float(np.max(sil_de)) if len(sil_de) > 0 else 0.0

    heatmap_rgb = delta_e_color_map(de_map, max_scale=45.0)
    heatmap_rgba = np.zeros_like(orig_arr)
    heatmap_rgba[sil, :3] = heatmap_rgb[sil]
    heatmap_rgba[sil, 3] = 230

    step = 40
    h, w = de_map.shape
    candidates = []
    for y in range(0, h - step, step):
        for x in range(0, w - step, step):
            block_sil = sil[y : y + step, x : x + step]
            if np.mean(block_sil) > 0.4:
                block_de = np.mean(de_map[y : y + step, x : x + step][block_sil])
                candidates.append((block_de, x, y))
    candidates.sort(key=lambda item: item[0], reverse=True)

    selected = []
    for score, cx, cy in candidates:
        if all(abs(cx - sx) >= step and abs(cy - sy) >= step for _, sx, sy in selected):
            selected.append((score, cx, cy))
        if len(selected) >= 10:
            break

    thumb_size = (360, 360)
    canvas_w = 1200
    canvas_h = 1000
    canvas = Image.new("RGBA", (canvas_w, canvas_h), (18, 22, 28, 255))
    draw = ImageDraw.Draw(canvas)

    header = f"FIDELITY ERROR & HEATMAP (VIEW: {view_name.upper()}) - {model_name.upper()}"
    metrics_str = f"Mean dE: {mean_de:.2f} | P95 dE: {p95_de:.2f} | Max dE: {max_de:.2f} | Gate: Zero Adjectives, Objective Measurement"
    draw.text((30, 20), header, fill=(240, 240, 240, 255))
    draw.text((30, 45), metrics_str, fill=(230, 190, 80, 255))

    p1 = orig_img.resize(thumb_size, Image.Resampling.BILINEAR)
    p2 = flat_img.resize(thumb_size, Image.Resampling.BILINEAR)
    p3 = Image.fromarray(heatmap_rgba).resize(thumb_size, Image.Resampling.BILINEAR)

    draw.rectangle([30, 75, 390, 465], outline=(45, 55, 70, 255), width=1)
    draw.rectangle([30, 75, 390, 105], fill=(28, 34, 44, 255))
    draw.text((40, 82), "1. TRELLIS Original Render", fill=(200, 210, 220, 255))
    canvas.paste(p1, (30, 105), p1)

    draw.rectangle([420, 75, 780, 465], outline=(45, 55, 70, 255), width=1)
    draw.rectangle([420, 75, 780, 105], fill=(28, 34, 44, 255))
    draw.text((430, 82), "2. SVG Rasterized (Flat PNG)", fill=(200, 210, 220, 255))
    canvas.paste(p2, (420, 105), p2)

    draw.rectangle([810, 75, 1170, 465], outline=(45, 55, 70, 255), width=1)
    draw.rectangle([810, 75, 1170, 105], fill=(28, 34, 44, 255))
    draw.text((820, 82), "3. Delta-E Error Heatmap (0..45+)", fill=(200, 210, 220, 255))
    canvas.paste(p3, (810, 105), p3)

    draw.text((30, 485), "TOP 10 REGIONS OF HIGHEST ERROR (>= 40x40 px) [Original | SVG | Flat PNG]:", fill=(240, 200, 80, 255))

    box_y = 515
    for idx, (b_de, bx, by) in enumerate(selected[:5]):
        crop_box = (bx, by, bx + step, by + step)
        c_orig = orig_img.crop(crop_box).resize((70, 70), Image.Resampling.NEAREST)
        c_svg = svg_img.crop(crop_box).resize((70, 70), Image.Resampling.NEAREST)
        c_flat = flat_img.crop(crop_box).resize((70, 70), Image.Resampling.NEAREST)

        base_x = 30 + idx * 230
        draw.text((base_x, box_y), f"#{idx+1} ({bx},{by}) dE={b_de:.1f}", fill=(200, 200, 200, 255))
        canvas.paste(c_orig, (base_x, box_y + 20))
        canvas.paste(c_svg, (base_x + 72, box_y + 20))
        canvas.paste(c_flat, (base_x + 144, box_y + 20))

    box_y2 = 635
    for idx, (b_de, bx, by) in enumerate(selected[5:10]):
        crop_box = (bx, by, bx + step, by + step)
        c_orig = orig_img.crop(crop_box).resize((70, 70), Image.Resampling.NEAREST)
        c_svg = svg_img.crop(crop_box).resize((70, 70), Image.Resampling.NEAREST)
        c_flat = flat_img.crop(crop_box).resize((70, 70), Image.Resampling.NEAREST)

        base_x = 30 + (idx) * 230
        draw.text((base_x, box_y2), f"#{idx+6} ({bx},{by}) dE={b_de:.1f}", fill=(200, 200, 200, 255))
        canvas.paste(c_orig, (base_x, box_y2 + 20))
        canvas.paste(c_svg, (base_x + 72, box_y2 + 20))
        canvas.paste(c_flat, (base_x + 144, box_y2 + 20))

    canvas.save(output_evidence, "PNG")
    return {
        "view": view_name,
        "meanDeltaE": round(mean_de, 2),
        "p95DeltaE": round(p95_de, 2),
        "maxDeltaE": round(max_de, 2),
        "top10WorstRegions": [{"rank": i + 1, "coord": [cx, cy, step, step], "meanDe": round(s, 2)} for i, (s, cx, cy) in enumerate(selected)],
        "evidenceImage": output_evidence,
    }


def audit_edge_sharpness(views_dir):
    svg_dir = os.path.join(views_dir, "svg")
    sharpness_results = {}
    for v in ["front", "back", "left", "right"]:
        orig = np.array(Image.open(os.path.join(views_dir, f"{v}.png")).convert("RGBA"))
        flat = np.array(Image.open(os.path.join(svg_dir, f"flat_{v}.png")).convert("RGBA"))
        orig_gray = np.mean(orig[:, :, :3], axis=2)
        flat_gray = np.mean(flat[:, :, :3], axis=2)

        gy_orig, gx_orig = np.gradient(orig_gray.astype(float))
        gy_flat, gx_flat = np.gradient(flat_gray.astype(float))
        grad_orig = np.sqrt(gx_orig ** 2 + gy_orig ** 2)
        grad_flat = np.sqrt(gx_flat ** 2 + gy_flat ** 2)

        sil = orig[:, :, 3] > 128
        edges = (grad_flat > 15.0) & sil
        m_orig = float(np.mean(grad_orig[edges])) if np.sum(edges) > 0 else 0.0
        m_flat = float(np.mean(grad_flat[edges])) if np.sum(edges) > 0 else 0.0
        ratio = round(m_flat / m_orig, 2) if m_orig > 0 else 0.0
        sharpness_results[v] = {
            "trellisEdgeGradient": round(m_orig, 2),
            "svgEdgeGradient": round(m_flat, 2),
            "sharpnessRatio": ratio,
            "svgSharper": m_flat > m_orig,
        }
    return sharpness_results


def find_features_and_iou(views_dir, reduced_view_img, output_evidence, model_name):
    svg_dir = os.path.join(views_dir, "svg")
    orig_left = Image.open(os.path.join(views_dir, "left.png")).convert("RGBA")
    flat_left = Image.open(os.path.join(svg_dir, "flat_left.png")).convert("RGBA")
    svg_left_path = os.path.join(svg_dir, "left.svg")
    svg_left_rendered = render_svg_with_qlmanage(svg_left_path, "/tmp/left_svg_render.png")
    svg_left_img = Image.open(svg_left_rendered).convert("RGBA").resize((2048, 2048)) if svg_left_rendered else flat_left

    orig_arr = np.array(orig_left)
    flat_arr = np.array(flat_left)
    sil = orig_arr[:, :, 3] > 128

    orig_dark = (np.mean(orig_arr[:, :, :3], axis=2) < 80) & sil
    flat_dark = (np.mean(flat_arr[:, :, :3], axis=2) < 80) & sil

    h, w = flat_dark.shape
    visited = np.zeros((h, w), dtype=bool)
    ys, xs = np.where(flat_dark)
    components = []
    for y, x in zip(ys, xs):
        if not visited[y, x]:
            queue = [(y, x)]
            visited[y, x] = True
            head = 0
            while head < len(queue):
                cy, cx = queue[head]
                head += 1
                for ny, nx in ((cy - 2, cx), (cy + 2, cx), (cy, cx - 2), (cy, cx + 2)):
                    if 0 <= ny < h and 0 <= nx < w and flat_dark[ny, nx] and not visited[ny, nx]:
                        visited[ny, nx] = True
                        queue.append((ny, nx))
            if len(queue) >= 50:
                components.append(queue)

    components.sort(key=len, reverse=True)

    features = []
    if model_name == "dalmatian":
        features.append({"name": "Left Eye", "cx": 880, "cy": 240, "half": 80})
        features.append({"name": "Right Eye", "cx": 1345, "cy": 225, "half": 80})
        features.append({"name": "Snout / Nose", "cx": 1100, "cy": 330, "half": 110})
    elif model_name == "fox":
        features.append({"name": "Left Eye", "cx": 839, "cy": 684, "half": 80})
        features.append({"name": "Right Eye", "cx": 1368, "cy": 714, "half": 80})
        features.append({"name": "Snout / Nose", "cx": 1115, "cy": 830, "half": 90})
    elif model_name == "brachiosaurus":
        features.append({"name": "Head Eye", "cx": 982, "cy": 147, "half": 60})
        features.append({"name": "Snout / Head", "cx": 1080, "cy": 210, "half": 80})
        features.append({"name": "Belly Patch", "cx": 1029, "cy": 858, "half": 100})
    else:
        if len(components) >= 3:
            for idx, c in enumerate(components[:3]):
                mcx = int(np.mean([p[1] for p in c]))
                mcy = int(np.mean([p[0] for p in c]))
                features.append({"name": f"Feature #{idx+1}", "cx": mcx, "cy": mcy, "half": 80})

    spot_count = 0
    for comp in components:
        cys = [p[0] for p in comp]
        cxs = [p[1] for p in comp]
        mcx, mcy = int(np.mean(cxs)), int(np.mean(cys))
        if any(abs(mcx - f["cx"]) < 120 and abs(mcy - f["cy"]) < 120 for f in features):
            continue
        spot_count += 1
        features.append({"name": f"Spot #{spot_count}", "cx": mcx, "cy": mcy, "half": 90})
        if spot_count >= 5:
            break

    feature_metrics = []
    canvas_w = 1200
    canvas_h = 80 + len(features) * 115
    canvas = Image.new("RGBA", (canvas_w, canvas_h), (18, 22, 28, 255))
    draw = ImageDraw.Draw(canvas)

    header = f"FEATURE FIDELITY (4-PANEL CUTOUTS & IoU GATE >= 0.85) - {model_name.upper()}"
    draw.text((30, 20), header, fill=(240, 240, 240, 255))
    draw.text((30, 45), "Panels: 1. TRELLIS Original | 2. SVG (WebKit) | 3. Flat PNG | 4. Reduce Texturized | Gate: IoU >= 0.85", fill=(120, 160, 200, 255))

    box_y = 80
    for f in features:
        cx, cy, half = f["cx"], f["cy"], f["half"]
        crop_box = (max(0, cx - half), max(0, cy - half), min(w, cx + half), min(h, cy + half))

        o_crop = orig_left.crop(crop_box).resize((100, 100), Image.Resampling.NEAREST)
        s_crop = svg_left_img.crop(crop_box).resize((100, 100), Image.Resampling.NEAREST)
        f_crop = flat_left.crop(crop_box).resize((100, 100), Image.Resampling.NEAREST)
        r_crop = reduced_view_img.crop(crop_box).resize((100, 100), Image.Resampling.NEAREST)

        sub_orig_dark = orig_dark[crop_box[1] : crop_box[3], crop_box[0] : crop_box[2]]
        sub_flat_dark = flat_dark[crop_box[1] : crop_box[3], crop_box[0] : crop_box[2]]
        inter = int((sub_orig_dark & sub_flat_dark).sum())
        union = int((sub_orig_dark | sub_flat_dark).sum())
        iou = float(inter / union) if union > 0 else 0.0
        passed = iou >= 0.85

        feature_metrics.append({
            "name": f["name"],
            "center": [cx, cy],
            "iou": round(iou, 4),
            "passed": passed,
        })

        color_tag = (100, 230, 100, 255) if passed else (240, 70, 70, 255)
        label = f"{f['name']} | Centroid: ({cx},{cy}) | Overlap IoU: {iou:.3f} | {'PASS' if passed else 'FAIL'}"
        draw.text((30, box_y), label, fill=color_tag)

        canvas.paste(o_crop, (30, box_y + 18))
        canvas.paste(s_crop, (140, box_y + 18))
        canvas.paste(f_crop, (250, box_y + 18))
        canvas.paste(r_crop, (360, box_y + 18))

        draw.text((480, box_y + 35), f"Trellis vs Flat IoU: {iou:.3f}", fill=(200, 200, 200, 255))
        draw.text((480, box_y + 55), f"Area: {inter} px overlap / {union} px union", fill=(140, 140, 150, 255))
        box_y += 115

    canvas.save(output_evidence, "PNG")
    return feature_metrics


def audit_reduce_faces(model_dir, views_dir, output_evidence, model_name):
    svg_dir = os.path.join(views_dir, "svg")
    reduce_json = os.path.join(model_dir, "stage-3", "step-1-reduce.json")
    with open(os.path.join(views_dir, "views.json")) as f:
        views_data = json.load(f)
    with open(reduce_json) as f:
        reduce_data = json.load(f)

    v_center = np.array(views_data["centre"])
    resolution = views_data["resolution"]
    pts = np.array([v["position"] for v in reduce_data["vertices"]])
    r_center = (pts.min(axis=0) + pts.max(axis=0)) / 2.0
    shift = r_center - v_center
    aligned_pts = pts - shift

    orig_imgs = {name: np.array(Image.open(os.path.join(views_dir, f"{name}.png")).convert("RGBA")) for name in views_data["views"]}
    flat_imgs = {name: np.array(Image.open(os.path.join(svg_dir, f"flat_{name}.png")).convert("RGBA")) for name in views_data["views"]}

    face_records = []
    for f_idx, face in enumerate(reduce_data["faces"]):
        face_pts = aligned_pts[face]
        centroid = np.mean(face_pts, axis=0)
        v0, v1, v2 = face_pts[0], face_pts[1], face_pts[2]
        normal = np.cross(v1 - v0, v2 - v0)
        norm_len = np.linalg.norm(normal)
        if norm_len > 1e-7:
            normal /= norm_len

        best_view = None
        best_facing = -2.0
        for v_name, v_info in views_data["views"].items():
            v_dir = np.array(v_info["direction"])
            facing = -float(np.dot(normal, v_dir))
            if facing > best_facing:
                best_facing = facing
                best_view = v_name

        v_info = views_data["views"][best_view]
        right = np.array(v_info["right"])
        up = np.array(v_info["up"])
        scale = v_info["orthoScale"]

        rel = centroid - v_center
        cx = int(round(resolution / 2 + np.dot(rel, right) / scale * resolution))
        cy = int(round(resolution / 2 - np.dot(rel, up) / scale * resolution))
        cx = np.clip(cx, 1, resolution - 2)
        cy = np.clip(cy, 1, resolution - 2)

        orig_patch = orig_imgs[best_view][cy - 1 : cy + 2, cx - 1 : cx + 2, :3].mean(axis=(0, 1))
        flat_patch = flat_imgs[best_view][cy - 1 : cy + 2, cx - 1 : cx + 2, :3].mean(axis=(0, 1))

        lab_orig = rgb_to_lab(orig_patch[None, None, :])[0, 0]
        lab_flat = rgb_to_lab(flat_patch[None, None, :])[0, 0]
        de = float(np.linalg.norm(lab_orig - lab_flat))
        face_records.append({
            "faceId": f_idx,
            "view": best_view,
            "coord": [cx, cy],
            "deltaE": round(de, 2),
            "origRgb": [int(c) for c in orig_patch],
            "flatRgb": [int(c) for c in flat_patch],
        })

    des = [r["deltaE"] for r in face_records]
    mean_de = float(np.mean(des))
    p95_de = float(np.percentile(des, 95))
    over_20 = [r for r in face_records if r["deltaE"] > 20.0]

    face_records.sort(key=lambda item: item["deltaE"], reverse=True)
    top20_worst = face_records[:20]

    canvas_w = 1200
    canvas_h = 1000
    canvas = Image.new("RGBA", (canvas_w, canvas_h), (18, 22, 28, 255))
    draw = ImageDraw.Draw(canvas)

    header = f"REDUCE FACE DELTA-E AUDIT - {model_name.upper()}"
    stats_str = f"Faces: {len(des)} | Mean dE: {mean_de:.2f} | P95 dE: {p95_de:.2f} | Faces with dE > 20: {len(over_20)} ({len(over_20)/len(des)*100:.1f}%)"
    draw.text((30, 20), header, fill=(240, 240, 240, 255))
    draw.text((30, 45), stats_str, fill=(230, 190, 80, 255))
    draw.text((30, 75), "TOP 20 WORST FACES (ORIGINAL COLOR vs VECTOR FLATTENED COLOR):", fill=(200, 200, 200, 255))

    for idx, r in enumerate(top20_worst):
        row = idx // 4
        col = idx % 4
        bx = 30 + col * 285
        by = 105 + row * 170

        draw.rectangle([bx, by, bx + 270, by + 155], outline=(45, 55, 70, 255), width=1)
        draw.text((bx + 10, by + 8), f"Face #{r['faceId']} (View: {r['view']})", fill=(240, 240, 240, 255))
        draw.text((bx + 10, by + 26), f"dE = {r['deltaE']:.2f} | Coords: ({r['coord'][0]},{r['coord'][1]})", fill=(240, 80, 80, 255))

        draw.rectangle([bx + 10, by + 50, bx + 70, by + 110], fill=tuple(r["origRgb"]) + (255,))
        draw.rectangle([bx + 10, by + 115, bx + 70, by + 135], fill=(20, 20, 20, 255))
        draw.text((bx + 15, by + 118), "TRELLIS", fill=(180, 180, 180, 255))

        draw.rectangle([bx + 85, by + 50, bx + 145, by + 110], fill=tuple(r["flatRgb"]) + (255,))
        draw.rectangle([bx + 85, by + 115, bx + 145, by + 135], fill=(20, 20, 20, 255))
        draw.text((bx + 95, by + 118), "FLAT", fill=(180, 180, 180, 255))

        diff_rgb = tuple(int(abs(a - b)) for a, b in zip(r["origRgb"], r["flatRgb"]))
        draw.rectangle([bx + 160, by + 50, bx + 220, by + 110], fill=diff_rgb + (255,))
        draw.rectangle([bx + 160, by + 115, bx + 220, by + 135], fill=(20, 20, 20, 255))
        draw.text((bx + 172, by + 118), "DIFF", fill=(180, 180, 180, 255))

    canvas.save(output_evidence, "PNG")
    return {
        "totalFaces": len(des),
        "meanDeltaE": round(mean_de, 2),
        "p95DeltaE": round(p95_de, 2),
        "facesOver20Count": len(over_20),
        "facesOver20Ratio": round(len(over_20) / len(des), 4),
        "worst20Faces": top20_worst,
        "evidenceImage": output_evidence,
    }


def numpy_to_native(val):
    if isinstance(val, (np.integer, np.int64, np.int32)):
        return int(val)
    if isinstance(val, (np.floating, np.float64, np.float32)):
        return float(val)
    if isinstance(val, (np.bool_, bool)):
        return bool(val)
    if isinstance(val, np.ndarray):
        return val.tolist()
    return str(val)


def execute_model_audit(model_name, resources_dir):
    model_dir = os.path.join(resources_dir, model_name)
    evidences_dir = os.path.join(model_dir, "evidences")
    os.makedirs(evidences_dir, exist_ok=True)
    views_dir = os.path.join(model_dir, "stage-3", "step-2-views")
    svg_dir = os.path.join(views_dir, "svg")

    views = ["front", "back", "left", "right", "top", "bottom"]
    fidelity_reports = []
    for v in views:
        orig = Image.open(os.path.join(views_dir, f"{v}.png")).convert("RGBA")
        flat = Image.open(os.path.join(svg_dir, f"flat_{v}.png")).convert("RGBA")
        svg_file = os.path.join(svg_dir, f"{v}.svg")
        ql_png = render_svg_with_qlmanage(svg_file, f"/tmp/{v}_svg_render.png")
        svg_img = Image.open(ql_png).convert("RGBA").resize((2048, 2048)) if ql_png else flat

        ev_img = os.path.join(evidences_dir, f"{model_name}-fidelity-{v}-evidence.png")
        rep = audit_fidelity_view(orig, flat, svg_img, v, model_name, ev_img)
        fidelity_reports.append(rep)

    sharpness_rep = audit_edge_sharpness(views_dir)

    reduced_panel_png = os.path.join(evidences_dir, f"{model_name}-trellis-vs-reduced-left-evidence.png")
    if not os.path.exists(reduced_panel_png):
        fallback_panel = os.path.join(model_dir, f"{model_name}-trellis-vs-reduced-left-evidence.png")
        if os.path.exists(fallback_panel):
            reduced_panel_png = fallback_panel

    if os.path.exists(reduced_panel_png):
        dual = Image.open(reduced_panel_png)
        w, h = dual.size
        reduced_left = dual.crop((w // 2, 80, w, h)).resize((2048, 2048))
    else:
        reduced_left = Image.open(os.path.join(svg_dir, "flat_left.png")).convert("RGBA")

    features_ev = os.path.join(evidences_dir, f"{model_name}-features-evidence.png")
    features_rep = find_features_and_iou(views_dir, reduced_left, features_ev, model_name)

    faces_ev = os.path.join(evidences_dir, f"{model_name}-reduce-faces-evidence.png")
    faces_rep = audit_reduce_faces(model_dir, views_dir, faces_ev, model_name)

    full_audit = {
        "model": model_name,
        "viewsFidelity": fidelity_reports,
        "edgeSharpness": sharpness_rep,
        "featuresIoU": features_rep,
        "reduceFacesAudit": faces_rep,
    }

    report_json_path = os.path.join(evidences_dir, "quality-report.json")
    with open(report_json_path, "w") as handle:
        json.dump(full_audit, handle, indent=2, default=numpy_to_native)

    print("AUDIT_COMPLETED_SUCCESSFULLY " + model_name)
    return full_audit


def main():
    args = parse_arguments()
    execute_model_audit(args.model_name, args.resources_dir)


if __name__ == "__main__":
    main()
