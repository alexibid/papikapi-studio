# Blender script. Usage: blender -b --python thin_parts.py -- <settings.json>
# Lists clusters of connected thin faces (local thickness below min_feature_mm at the target size)
# with their size, root perimeter and length, to tune the appendage rule of stage 2 step 3.
import json
import sys

sys.path.insert(0, "scripts/stage-3/blender/key_points")
from mathutils.bvhtree import BVHTree
from model_loader import load_grounded_mesh
from surface_repair import repair_surface

settings = json.loads(sys.argv[sys.argv.index("--") + 1])
surface, length, _ = load_grounded_mesh(settings)
repair_surface(surface)
to_mm = settings["target_size_mm"] / length
limit = settings.get("min_feature_mm", 6)
tree = BVHTree.FromBMesh(surface)


def thickness_mm(face):
    hit = tree.ray_cast(face.calc_center_median() - face.normal * 1e-6, -face.normal)
    return None if hit[0] is None else hit[3] * to_mm


thin = {f for f in surface.faces if (t := thickness_mm(f)) is not None and t < limit}
seen, clusters = set(), []
for start in thin:
    if start in seen:
        continue
    stack, cluster = [start], []
    seen.add(start)
    while stack:
        current = stack.pop()
        cluster.append(current)
        for edge in current.edges:
            for neighbour in edge.link_faces:
                if neighbour in thin and neighbour not in seen:
                    seen.add(neighbour)
                    stack.append(neighbour)
    clusters.append(cluster)
total_area = sum(f.calc_area() for f in surface.faces)
print("CLUSTERS", len(clusters), "thin faces", len(thin), "of", len(surface.faces))
for cluster in sorted(clusters, key=len, reverse=True)[:14]:
    members = set(cluster)
    boundary = [e for f in cluster for e in f.edges if any(n not in members for n in e.link_faces)]
    points = [v.co for f in cluster for v in f.verts]
    box = [(max(p[i] for p in points) - min(p[i] for p in points)) * to_mm for i in range(3)]
    centre = [sum(p[i] for p in points) / len(points) * to_mm for i in range(3)]
    print("CL", len(cluster), "faces | area %.3f%% | root perimeter %.1f mm | bbox %s | centre %s" % (
        100 * sum(f.calc_area() for f in cluster) / total_area, sum(e.calc_length() for e in set(boundary)) * to_mm,
        [round(b, 1) for b in box], [round(c) for c in centre]))
