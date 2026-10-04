import json
import bmesh
from mathutils import Vector


def build_surface_from_reduce_json(json_path: str, views_data: dict = None):
    with open(json_path) as handle:
        document = json.load(handle)

    pts = [Vector(v["position"]) for v in document["vertices"]]
    if views_data and "centre" in views_data:
        low = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        high = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        r_center = (low + high) / 2.0
        v_center = Vector(views_data["centre"])
        shift = r_center - v_center
    else:
        shift = Vector(document.get("groundOffset", (0, 0, 0)))

    surface = bmesh.new()
    verts = [surface.verts.new(p - shift) for p in pts]
    for face in document["faces"]:
        face_verts = [verts[i] for i in face]
        if surface.faces.get(face_verts) is None:
            surface.faces.new(face_verts)
    surface.verts.index_update()
    surface.faces.index_update()
    bmesh.ops.recalc_face_normals(surface, faces=surface.faces)
    surface.normal_update()
    surface.faces.ensure_lookup_table()
    return surface, shift
