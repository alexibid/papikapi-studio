# Blender script. Usage: blender -b --python render_edges.py -- <reduce.json> <output-prefix>
# Renders the reduced mesh with its edges from the back and the front (<prefix>-0.png, <prefix>-1.png).
import bpy, sys, json, math, bmesh
from mathutils import Vector
args = sys.argv[sys.argv.index("--")+1:]
doc = json.load(open(args[0])); out = args[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
mesh = bpy.data.meshes.new("m"); mesh.from_pydata([v["position"] for v in doc["vertices"]], [], doc["faces"]); mesh.update()
ob = bpy.data.objects.new("m", mesh); bpy.context.scene.collection.objects.link(ob)
# edges as thin curve-like tubes via a second mesh of edges converted to curve
cu = bpy.data.curves.new("e","CURVE"); cu.dimensions="3D"; cu.bevel_depth=0.0012
for e in mesh.edges:
    sp = cu.splines.new("POLY"); sp.points.add(1)
    for i,vi in enumerate(e.vertices): sp.points[i].co = (*mesh.vertices[vi].co, 1)
eo = bpy.data.objects.new("e", cu); bpy.context.scene.collection.objects.link(eo)
mat = bpy.data.materials.new("k"); mat.diffuse_color=(0.02,0.02,0.02,1); cu.materials.append(mat)
sc = bpy.context.scene; sc.render.engine="BLENDER_WORKBENCH"
sc.display.shading.light="STUDIO"; sc.display.shading.color_type="MATERIAL"
mm = bpy.data.materials.new("g"); mm.diffuse_color=(0.85,0.85,0.85,1); mesh.materials.append(mm)
sc.render.resolution_x=sc.render.resolution_y=700
sc.world=bpy.data.worlds.new("w"); sc.world.color=(0.93,0.93,0.93)
bb=[Vector(c) for c in ob.bound_box]; ctr=sum(bb,Vector())/8
size=max(max(b[i] for b in bb)-min(b[i] for b in bb) for i in range(3))
cam=bpy.data.objects.new("c",bpy.data.cameras.new("c")); sc.collection.objects.link(cam); sc.camera=cam
cam.data.type="ORTHO"; cam.data.ortho_scale=size*1.2
for i,(az,el) in enumerate([(215,25),(35,25)]):
    a,e=math.radians(az),math.radians(el)
    cam.location=ctr+Vector((math.sin(a)*math.cos(e),-math.cos(a)*math.cos(e),math.sin(e)))*size*3
    cam.rotation_euler=(ctr-cam.location).to_track_quat("-Z","Y").to_euler()
    sc.render.filepath=f"{out}-{i}.png"; bpy.ops.render.render(write_still=True)
