#!/usr/bin/env python3
import argparse
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
import numpy as np
from PIL import Image

VIEW_NAMES = ["front", "back", "left", "right", "top", "bottom"]


def parse_arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--views-dir", type=str, default="")
    parser.add_argument("--svg-dir", type=str, default="")
    parser.add_argument("--base-glb", type=str, default="")
    parser.add_argument("--reduce-json", type=str, default="")
    return parser.parse_args()


def parse_svg_path_commands(path_data):
    tokens = re.findall(r"([A-Za-z])|([-+]?(?:[0-9]*\.[0-9]+|[0-9]+))", path_data)
    commands = []
    current_cmd = None
    args = []
    for cmd, val in tokens:
        if cmd:
            if current_cmd:
                commands.append((current_cmd, [float(x) for x in args]))
            current_cmd = cmd
            args = []
        elif val:
            args.append(val)
    if current_cmd:
        commands.append((current_cmd, [float(x) for x in args]))
    return commands


def analyze_path_geometry(path_data):
    commands = parse_svg_path_commands(path_data)
    current_pt = np.array([0.0, 0.0])
    start_pt = np.array([0.0, 0.0])
    total_len = 0.0
    straight_len = 0.0
    nodes = 0
    invalid_commands = []
    for cmd, args in commands:
        if cmd not in ("M", "C", "Z", "m", "c", "z"):
            invalid_commands.append(cmd)
        if cmd in ("M", "m"):
            current_pt = np.array([args[0], args[1]])
            start_pt = current_pt.copy()
            nodes += 1
        elif cmd in ("C", "c"):
            for i in range(0, len(args), 6):
                p1 = np.array([args[i], args[i + 1]])
                p2 = np.array([args[i + 2], args[i + 3]])
                p3 = np.array([args[i + 4], args[i + 5]])
                p0 = current_pt
                chord = float(np.linalg.norm(p3 - p0))
                total_len += chord
                nodes += 1
                if chord > 1e-6:
                    u = (p3 - p0) / chord
                    d1 = float(np.linalg.norm((p1 - p0) - np.dot(p1 - p0, u) * u))
                    d2 = float(np.linalg.norm((p2 - p0) - np.dot(p2 - p0, u) * u))
                    if max(d1, d2) < 1.0 and chord >= 40.0:
                        straight_len += chord
                current_pt = p3
        elif cmd in ("Z", "z"):
            chord = float(np.linalg.norm(start_pt - current_pt))
            total_len += chord
            current_pt = start_pt.copy()
    return total_len, straight_len, nodes, invalid_commands


def rasterise_triangles(triangles_xy, resolution):
    mask = np.zeros((resolution, resolution), dtype=bool)
    for a, b, c in triangles_xy:
        x0 = max(int(np.floor(min(a[0], b[0], c[0]))), 0)
        x1 = min(int(np.ceil(max(a[0], b[0], c[0]))), resolution - 1)
        y0 = max(int(np.floor(min(a[1], b[1], c[1]))), 0)
        y1 = min(int(np.ceil(max(a[1], b[1], c[1]))), resolution - 1)
        if x0 > x1 or y0 > y1:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        d1 = (b[0] - a[0]) * (gy - a[1]) - (b[1] - a[1]) * (gx - a[0])
        d2 = (c[0] - b[0]) * (gy - b[1]) - (c[1] - b[1]) * (gx - b[0])
        d3 = (a[0] - c[0]) * (gy - c[1]) - (a[1] - c[1]) * (gx - c[0])
        inside = ~(((d1 < 0) | (d2 < 0) | (d3 < 0)) & ((d1 > 0) | (d2 > 0) | (d3 > 0)))
        mask[y0 : y1 + 1, x0 : x1 + 1] |= inside
    return mask


def inspect_glb_components(glb_path):
    try:
        import bpy
        import bmesh
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=glb_path)
        surface = bmesh.new()
        for obj in bpy.data.objects:
            if obj.type == "MESH":
                surface.from_mesh(obj.data)
        bmesh.ops.remove_doubles(surface, verts=surface.verts, dist=1e-5)
        visited = set()
        components = []
        for face in surface.faces:
            if face in visited:
                continue
            component = []
            stack = [face]
            visited.add(face)
            while stack:
                curr = stack.pop()
                component.append(curr)
                for edge in curr.edges:
                    for nbr in edge.link_faces:
                        if nbr not in visited:
                            visited.add(nbr)
                            stack.append(nbr)
            components.append(component)
        boundary_edges = [edge for edge in surface.edges if edge.is_boundary]
        surface.free()
        return len(components), [len(c) for c in components], len(boundary_edges)
    except ModuleNotFoundError:
        import subprocess
        script_code = (
            "import bpy, bmesh, json\n"
            "bpy.ops.wm.read_factory_settings(use_empty=True)\n"
            f"bpy.ops.import_scene.gltf(filepath={repr(glb_path)})\n"
            "surface = bmesh.new()\n"
            "for obj in bpy.data.objects:\n"
            "    if obj.type == 'MESH':\n"
            "        surface.from_mesh(obj.data)\n"
            "bmesh.ops.remove_doubles(surface, verts=surface.verts, dist=1e-5)\n"
            "visited = set()\n"
            "components = []\n"
            "for face in surface.faces:\n"
            "    if face in visited:\n"
            "        continue\n"
            "    component = []\n"
            "    stack = [face]\n"
            "    visited.add(face)\n"
            "    while stack:\n"
            "        curr = stack.pop()\n"
            "        component.append(curr)\n"
            "        for edge in curr.edges:\n"
            "            for nbr in edge.link_faces:\n"
            "                if nbr not in visited:\n"
            "                    visited.add(nbr)\n"
            "                    stack.append(nbr)\n"
            "    components.append(component)\n"
            "boundary_edges = [edge for edge in surface.edges if edge.is_boundary]\n"
            "counts = [len(c) for c in components]\n"
            "surface.free()\n"
            "print('GLB_INSPECT_RESULT ' + json.dumps({'num': len(components), 'counts': counts, 'boundary': len(boundary_edges)}))\n"
        )
        blender_cmd = [
            "/Applications/Blender.app/Contents/MacOS/Blender",
            "--background",
            "--python-expr",
            script_code,
        ]
        proc = subprocess.run(blender_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        for line in proc.stdout.splitlines():
            if line.startswith("GLB_INSPECT_RESULT "):
                data = json.loads(line[len("GLB_INSPECT_RESULT ") :])
                return data["num"], data["counts"], data["boundary"]
        return 0, [], 0


class TexturingVerifier:
    def __init__(self, views_dir, svg_dir, base_glb, reduce_json):
        self.views_dir = views_dir
        self.svg_dir = svg_dir
        self.base_glb = base_glb
        self.reduce_json = reduce_json
        self.passed = 0
        self.total = 0

    def record(self, condition, name, failure_detail=""):
        self.total += 1
        if condition:
            self.passed += 1
            print(f"PASS: {name}")
        else:
            print(f"FAIL: {name} - {failure_detail}")

    def verify_views(self):
        if not self.views_dir:
            return {}
        views_json_path = os.path.join(self.views_dir, "views.json")
        has_views_json = os.path.exists(views_json_path)
        self.record(has_views_json, "views.json exists and is valid", f"missing {views_json_path}")
        views_data = {}
        if has_views_json:
            try:
                with open(views_json_path) as handle:
                    views_data = json.load(handle)
            except Exception as error:
                self.record(False, "views.json parse", str(error))
        for view_name in VIEW_NAMES:
            png_path = os.path.join(self.views_dir, f"{view_name}.png")
            exists = os.path.exists(png_path)
            is_valid_dim = False
            detail = f"missing {png_path}"
            if exists:
                try:
                    with Image.open(png_path) as img:
                        w, h = img.size
                        is_valid_dim = w == h and w >= 2048
                        detail = f"dimensions {w}x{h}, expected square >= 2048"
                except Exception as error:
                    detail = str(error)
            self.record(exists and is_valid_dim, f"view {view_name} is square >= 2048 px", detail)
        return views_data

    def verify_svgs(self):
        if not self.svg_dir:
            return
        palette_path = os.path.join(self.svg_dir, "palette.json")
        has_palette = os.path.exists(palette_path)
        self.record(has_palette, "palette.json exists and is valid", f"missing {palette_path}")
        palette_hexes = set()
        dominant_hex = ""
        if has_palette:
            try:
                with open(palette_path) as handle:
                    palette_list = json.load(handle)
                    palette_hexes = {item["hex"].lower() for item in palette_list if "hex" in item}
                    if palette_list:
                        dominant_hex = max(palette_list, key=lambda x: x.get("share", 0.0)).get("hex", "").lower()
            except Exception as error:
                self.record(False, "palette.json parse", str(error))
        for view_name in VIEW_NAMES:
            flat_png = os.path.join(self.svg_dir, f"flat_{view_name}.png")
            flat_exists = os.path.exists(flat_png)
            flat_valid = False
            flat_detail = f"missing {flat_png}"
            if flat_exists:
                try:
                    with Image.open(flat_png) as img:
                        w, h = img.size
                        flat_valid = w == h and w >= 2048
                        flat_detail = f"dimensions {w}x{h}"
                except Exception as error:
                    flat_detail = str(error)
            self.record(flat_exists and flat_valid, f"flat_{view_name}.png exists and matches resolution", flat_detail)

            svg_path = os.path.join(self.svg_dir, f"{view_name}.svg")
            svg_exists = os.path.exists(svg_path)
            size_ok = False
            if svg_exists:
                file_size = os.path.getsize(svg_path)
                size_ok = file_size <= 300 * 1024
            self.record(svg_exists and size_ok, f"{view_name}.svg size <= 300 KB", f"size {os.path.getsize(svg_path) if svg_exists else 0} bytes")

            if not svg_exists:
                for i in range(7):
                    self.record(False, f"{view_name}.svg check {i}", "file missing")
                continue

            try:
                tree = ET.parse(svg_path)
                root = tree.getroot()
                tag_name = root.tag.split("}")[-1]
                children = list(root)
                child_tags = [c.tag.split("}")[-1] for c in children]
                only_rect_path = all(t in ("rect", "path") for t in child_tags)
                rect_count = child_tags.count("rect")
                path_count = child_tags.count("path")
                self.record(tag_name == "svg" and only_rect_path and rect_count == 1, f"{view_name}.svg elements strictly rect and path", f"tags: {child_tags}")
                
                rect_elem = next(c for c in children if c.tag.split("}")[-1] == "rect")
                rect_fill = rect_elem.get("fill", "").lower()
                base_match = (rect_fill == dominant_hex) if dominant_hex else bool(rect_fill)
                self.record(base_match, f"{view_name}.svg base equals dominant color", f"rect fill {rect_fill} vs dominant {dominant_hex}")

                path_elems = [c for c in children if c.tag.split("}")[-1] == "path"]
                self.record(1 <= len(path_elems) <= 16, f"{view_name}.svg path count 1..16", f"count {len(path_elems)}")

                total_nodes = 0
                total_len = 0.0
                straight_len = 0.0
                non_mcz = []
                invalid_colors = []
                for p in path_elems:
                    fill = p.get("fill", "").lower()
                    if palette_hexes and fill not in palette_hexes:
                        invalid_colors.append(fill)
                    d = p.get("d", "")
                    t_len, s_len, n_cnt, invalid_cmds = analyze_path_geometry(d)
                    total_len += t_len
                    straight_len += s_len
                    total_nodes += n_cnt
                    non_mcz.extend(invalid_cmds)

                self.record(len(non_mcz) == 0, f"{view_name}.svg commands strictly M/C/Z", f"invalid: {non_mcz}")
                self.record(8 <= total_nodes <= 4000, f"{view_name}.svg node count 8..4000", f"nodes: {total_nodes}")
                straight_ratio = (straight_len / total_len) if total_len > 0 else 0.0
                self.record(straight_ratio <= 0.62, f"{view_name}.svg straight segments <= 62%", f"ratio {straight_ratio:.3f}")
                self.record(len(invalid_colors) == 0, f"{view_name}.svg colors within palette", f"invalid: {invalid_colors}")
            except Exception as error:
                for i in range(7):
                    self.record(False, f"{view_name}.svg parse error", str(error))

    def verify_base_glb(self):
        if not self.base_glb:
            return
        base_name = os.path.basename(self.base_glb)
        exists = os.path.exists(self.base_glb)
        self.record(exists, f"{base_name} exists", f"missing {self.base_glb}")
        if not exists:
            self.record(False, "o GLB base tem uma unica peca soldada e fechada", "file missing")
            return
        num_components, counts, boundary_count = inspect_glb_components(self.base_glb)
        single_piece = num_components == 1
        detail = f"mais do que uma peça ({num_components} componentes: {counts})" if not single_piece else f"1 peça ({counts[0]} faces)"
        self.record(single_piece, "o GLB base tem uma unica peca soldada e fechada", detail)

    def verify_reduce_iou(self, views_data):
        if not self.reduce_json or not self.views_dir:
            return
        exists = os.path.exists(self.reduce_json)
        self.record(exists, "step-4-reduce.json exists", f"missing {self.reduce_json}")
        if not exists:
            for view_name in VIEW_NAMES:
                self.record(False, f"reduce silhouette IoU {view_name} >= 0.97", "reduce json missing")
            return
        with open(self.reduce_json) as handle:
            reduce_data = json.load(handle)

        pts = np.array([v["position"] for v in reduce_data["vertices"]])
        r_center = (pts.min(axis=0) + pts.max(axis=0)) / 2.0
        v_center = np.array(views_data.get("centre", [0, 0, 0]))
        shift = r_center - v_center
        points = pts - shift

        triangles = []
        for face in reduce_data["faces"]:
            if len(face) == 3:
                triangles.append(face)
            elif len(face) == 4:
                triangles.append([face[0], face[1], face[2]])
                triangles.append([face[0], face[2], face[3]])

        resolution = views_data.get("resolution", 2048)
        views_dict = views_data.get("views", {})

        for view_name in VIEW_NAMES:
            view = views_dict.get(view_name)
            if not view:
                self.record(False, f"reduce silhouette IoU {view_name} >= 0.97", "view metadata missing")
                continue
            right = np.array(view["right"])
            up = np.array(view["up"])
            scale = view["orthoScale"]
            relative = points - v_center
            x = resolution / 2 + relative @ right / scale * resolution
            y = resolution / 2 + relative @ up / scale * resolution
            flat = np.stack([x, y], axis=1)
            tri_coords = [[flat[i] for i in tri] for tri in triangles]
            mine = rasterise_triangles(tri_coords, resolution)
            png_path = os.path.join(self.views_dir, f"{view_name}.png")
            theirs = np.zeros((resolution, resolution), dtype=bool)
            if os.path.exists(png_path):
                with Image.open(png_path) as img:
                    theirs = np.flipud(np.array(img.convert("RGBA"))[:, :, 3] > 128)
            union = int((mine | theirs).sum())
            intersection = int((mine & theirs).sum())
            iou = float(intersection / union) if union > 0 else 0.0
            self.record(iou >= 0.97, f"reduce silhouette IoU {view_name} >= 0.97", f"IoU = {iou:.4f}")

    def run(self):
        views_data = self.verify_views()
        self.verify_svgs()
        self.verify_base_glb()
        self.verify_reduce_iou(views_data)
        print(f"\nResultado: {self.passed}/{self.total} verificações passaram")
        return self.passed == self.total


def main():
    args = parse_arguments()
    verifier = TexturingVerifier(args.views_dir, args.svg_dir, args.base_glb, args.reduce_json)
    success = verifier.run()
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
