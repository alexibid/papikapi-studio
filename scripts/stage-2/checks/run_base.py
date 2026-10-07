"""Runs s2-step-3 (base cut with appendage removal) on temporary outputs and prints its statistics.

Usage: python3 scripts/stage-2/checks/run_base.py <output_dir> <model> [<model> ...] [key=value ...]
A key=value argument overrides a pipeline parameter (numbers and text), for example envelope_tolerance_mm=2.
Run from apps/papikapi-studio. Nothing is written to resources/ or public/.
"""
import json
import subprocess
import sys

output_dir = sys.argv[1]
models = [argument for argument in sys.argv[2:] if "=" not in argument]
overrides = dict(argument.split("=", 1) for argument in sys.argv[2:] if "=" in argument)
config = json.load(open("pipeline.json"))
step = next(s for stage in config["pipeline_stages"] for s in stage["steps"] if s["id"] == "s2-step-3")
for model in models:
    settings = {**step["parameters"], **{key: json.loads(value) if value.replace(".", "").isdigit() else value for key, value in overrides.items()}, "input_glb": f"resources/{model}/stage-2/step-2-3d.glb",
                "output_glb": f"{output_dir}/{model}-base.glb"}
    run = subprocess.run([step["blender"]["executable"], "-b", "--python", step["blender"]["script"], "--",
                          json.dumps(settings)], capture_output=True, text=True)
    lines = [line for line in run.stdout.splitlines() if "PAPERCRAFT_RESULT" in line]
    print(model, lines[0].split("RESULT ")[1] if lines else run.stdout[-500:] + run.stderr[-500:])
