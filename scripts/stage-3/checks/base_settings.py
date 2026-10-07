"""Prints a pipeline step's parameters for a model's stage-2 base, as the JSON the Blender scripts expect.

Usage: python3 scripts/stage-3/checks/base_settings.py <model> [<step-id>]   (default step: s3-step-1)
"""
import json
import sys

model = sys.argv[1]
step_id = sys.argv[2] if len(sys.argv) > 2 else "s3-step-1"
config = json.load(open("pipeline.json"))
step = next(s for stage in config["pipeline_stages"] for s in stage["steps"] if s["id"] == step_id)
print(json.dumps({**step["parameters"], "input_glb": f"resources/{model}/stage-2/step-3-base.glb"}))
