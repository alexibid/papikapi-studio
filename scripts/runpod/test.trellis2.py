import base64
import importlib.util
import json
import sys

APP_DIR = "/app"
HANDLER_PATH = f"{APP_DIR}/rp_handler.trellis2.py"

sys.path.insert(0, APP_DIR)
INPUT_IMAGE = sys.argv[1]
OUTPUT_GLB = sys.argv[2]
TARGET_FACES = int(sys.argv[3])
PIPELINE_TYPE = sys.argv[4] if len(sys.argv) > 4 else "1024_cascade"
TEXTURE_SIZE = int(sys.argv[5]) if len(sys.argv) > 5 else 2048

spec = importlib.util.spec_from_file_location("trellis2_worker", HANDLER_PATH)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

with open(INPUT_IMAGE, "rb") as image_file:
    image_base64 = base64.b64encode(image_file.read()).decode("utf-8")

job = {"input": {"image_base64": image_base64, "target_faces": TARGET_FACES, "pipeline_type": PIPELINE_TYPE,
                 "texture_size": TEXTURE_SIZE}}
chunks = list(worker.handler(job))
if "error" in chunks[0]:
    print(json.dumps(chunks[0]))
    sys.exit(1)

glb_chunks = sorted((chunk for chunk in chunks if chunk["part"] == "glb"), key=lambda chunk: chunk["chunk_index"])
if not glb_chunks or len(glb_chunks) != glb_chunks[0]["chunk_count"]:
    print(json.dumps({"error": "incomplete GLB stream"}))
    sys.exit(1)

with open(OUTPUT_GLB, "wb") as glb_file:
    glb_file.write(base64.b64decode("".join(chunk["data"] for chunk in glb_chunks)))

print(json.dumps({"face_count": glb_chunks[0]["face_count"], "file_size": glb_chunks[0]["file_size"],
                  "chunks": len(chunks)}))
