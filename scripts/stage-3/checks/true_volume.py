# Blender script. Usage: blender -b --python true_volume.py -- <settings.json> <reduce.json> [...]
# Volume change of each reduced mesh vs the TRELLIS base, with every polygon triangulated.
import sys, json, bpy, bmesh, numpy as np
sys.path.insert(0, "scripts/stage-3/blender/key_points")
from model_loader import load_grounded_mesh
from surface_repair import repair_surface
s = json.load(open(sys.argv[sys.argv.index("--")+1]))
ref, length, off = load_grounded_mesh(s); repair_surface(ref)
def vol(V, F):
    t = 0.0
    for f in F:
        for i in range(1, len(f)-1):
            t += np.dot(V[f[0]], np.cross(V[f[i]], V[f[i+1]]))
    return abs(t)/6
rv = np.array([list(v.co) for v in ref.verts]); ref.verts.index_update()
rf = [[v.index for v in f.verts] for f in ref.faces]; R = vol(rv, rf)
for name in sys.argv[sys.argv.index("--")+2:]:
    d = json.load(open(name)); V = np.array([v["position"] for v in d["vertices"]])
    print("VOL", name.split("/")[-1], "true volume change vs TRELLIS: %.2f%%" % (100*(vol(V, d["faces"])-R)/R))
