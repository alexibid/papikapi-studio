import base64
import importlib.util
import json
import sys

APP_DIR = "/app"
HANDLER_PATH = f"{APP_DIR}/rp_handler.trellis.py"

sys.path.insert(0, APP_DIR)
INPUT_IMAGE = sys.argv[1]
OUTPUT_GLB = sys.argv[2]
TARGET_FACES = int(sys.argv[3])

spec = importlib.util.spec_from_file_location("trellis_worker", HANDLER_PATH)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

with open(INPUT_IMAGE, "rb") as image_file:
    image_base64 = base64.b64encode(image_file.read()).decode("utf-8")

result = worker.handler({"input": {"image_base64": image_base64, "target_faces": TARGET_FACES}})
if "error" in result:
    print(json.dumps(result))
    sys.exit(1)

output = result["output"]
with open(OUTPUT_GLB, "wb") as glb_file:
    glb_file.write(base64.b64decode(output["glb_base64"]))

print(json.dumps({"face_count": output["face_count"], "file_size": output["file_size"]}))
