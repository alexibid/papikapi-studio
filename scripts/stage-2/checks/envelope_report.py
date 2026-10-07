# Blender script. Usage: blender -b --python envelope_report.py -- <settings.json>
# Read-only. Lists the clusters of faces that lie outside the body envelope, with their extents (mm at the
# target size) and their share of the figure surface, to tune what counts as an appendage.
import json
import sys

sys.path.insert(0, "scripts/stage-2/blender/base")
sys.path.insert(0, "scripts/stage-3/blender/key_points")
import appendages
from envelope import faces_outside_body
from model_loader import load_grounded_mesh
from surface_repair import repair_surface

settings = json.loads(sys.argv[sys.argv.index("--") + 1])
surface, length, _ = load_grounded_mesh(settings)
repair_surface(surface)
to_mm = settings["target_size_mm"] / length
total = sum(face.calc_area() for face in surface.faces)
for cluster in sorted(appendages.connected_clusters(faces_outside_body(surface, length, settings)), key=len, reverse=True):
    extents = appendages.principal_extents_mm(cluster, to_mm)
    share = 100 * sum(face.calc_area() for face in cluster) / total
    points = [vertex.co for face in cluster for vertex in face.verts]
    centre = [round(sum(point[axis] for point in points) / len(points) * to_mm) for axis in range(3)]
    print("ENV", len(cluster), "faces | extents mm", [round(float(e), 1) for e in extents],
          "| area %.2f%%" % share, "| centre", centre)
