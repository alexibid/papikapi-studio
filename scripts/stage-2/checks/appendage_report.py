# Blender script. Usage: blender -b --python appendage_report.py -- <settings.json>
# Read-only. Lists the thin clusters of a base mesh with their principal extents (mm at the target size)
# and whether the appendage rule (current parameters) would remove them.
import json
import sys

sys.path.insert(0, "scripts/stage-2/blender/base")
sys.path.insert(0, "scripts/stage-3/blender/key_points")
import appendages
from model_loader import load_grounded_mesh
from surface_repair import repair_surface

settings = json.loads(sys.argv[sys.argv.index("--") + 1])
surface, length, _ = load_grounded_mesh(settings)
repair_surface(surface)
to_mm = settings["target_size_mm"] / length
clusters = appendages.thin_clusters(surface, length, settings)
removable = {id(cluster) for cluster in appendages.removable_clusters(clusters, length, settings)}
for cluster, extents in sorted(clusters, key=lambda item: -len(item[0])):
    points = [vertex.co for face in cluster for vertex in face.verts]
    centre = [round(sum(point[axis] for point in points) / len(points) * to_mm) for axis in range(3)]
    root = appendages.boundary_length_mm(set(cluster), to_mm)
    print("REP", len(cluster), "faces | extents mm", [round(float(e), 1) for e in extents], "| centre", centre,
          "| root", round(root), "| REMOVE" if id(cluster) in removable else "| kept")
