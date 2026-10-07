"""Runs the s3-step-1 simplification on temporary outputs and prints the quality metrics.

Usage: python3 scripts/stage-3/checks/run_simplify.py <output_dir> <model> [<model> ...]
Run from apps/papikapi-studio. Nothing is written to resources/ or public/.
"""
import json,subprocess,sys
S=sys.argv[1]; models=sys.argv[2:]
cfg=json.load(open("pipeline.json")); step=[x for st in cfg["pipeline_stages"] for x in st["steps"] if x["id"]=="s3-step-1"][0]
for m in models:
    p=dict(step["parameters"]); p.update(input_glb=f"resources/{m}/stage-2/step-3-base.glb",output_json=f"{S}/{m}-reduce.json",output_glb=f"{S}/{m}-reduce.glb")
    out=subprocess.run(["/Applications/Blender.app/Contents/MacOS/Blender","-b","--python","scripts/stage-3/blender/key_points/key_points.py","--",json.dumps(p)],capture_output=True,text=True)
    l=[x for x in out.stdout.splitlines() if "RESULT" in x]
    if not l: print(m,"FAIL",out.stdout[-500:],out.stderr[-300:]); continue
    d=json.loads(l[0].split("RESULT ")[1]); print(m,{k:d[k] for k in ("meshFaces","volumeChangePercent","maxDeviationMm","featureLossMm","airtight")})
