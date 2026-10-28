"""Publishes the TRELLIS.2 worker as the official Space image plus one set of layers of ours.

Base: the public image of huggingface.co/spaces/microsoft/TRELLIS.2 (registry.hf.space), unchanged.
On top, built on the build pod:
  - the Space's CUDA extensions recompiled for the RTX 4090 (sm_89) from the exact commits of the Space
    wheels (only the compiled .so files; the Python files are the Space's own),
  - runpod and its missing dependencies in /app/pylib, pinned to the Space's freeze and loaded after the
    Space's site-packages (a .pth file), so no Space package is replaced,
  - the model weights in /app/hf, and the handler.
Run on the build pod after build_exact.sh and fetch_weights.sh: python package.trellis2.py [--dry-run]
"""
import io
import json
import os
import subprocess
import sys
import tarfile

import zstandard

SPACE_IMAGE = "registry.hf.space/microsoft-trellis-2:latest"
REPOSITORY = "ghcr.io/alexibid/papikapi-trellis2"
BUILD_SITE = "/app/venv/lib/python3.12/site-packages"
SPACE_SITE = "/usr/local/lib/python3.12/site-packages"
RECOMPILED_PACKAGES = ("cumesh", "flex_gemm", "nvdiffrec_render", "o_voxel")
RECOMPILED_ROOT_MODULES = ("_nvdiffrast_c",)
PYLIB_DIR = "/app/pylib"
WEIGHTS_DIR = "/app/hf"
HANDLER = "/app/rp_handler.trellis2.py"
LAYER_DIR = "/root/layers"
MAX_LAYER_BYTES = 3 * 1024 ** 3
SPACE_USER = 1000
IMAGE_ENV = ("HF_HOME=/app/hf", "HF_HUB_OFFLINE=1")
IMAGE_CMD = "python,-u,/app/rp_handler.trellis2.py"


def run(command, **kwargs):
    print("$ " + " ".join(command), flush=True)
    return subprocess.run(command, check=True, **kwargs)


def space_image_digest():
    digest = run(["crane", "digest", SPACE_IMAGE], capture_output=True, text=True).stdout.strip()
    return f"{SPACE_IMAGE.rsplit(':', 1)[0]}@{digest}"


def space_freeze(base):
    """The Space's exact package list (/tmp/freeze.txt, written by the Space build)."""
    manifest = run(["crane", "manifest", base], capture_output=True, text=True).stdout
    for digest in reversed([layer["digest"] for layer in json.loads(manifest)["layers"]]):
        blob = run(["crane", "blob", f"{base.split('@')[0]}@{digest}"], capture_output=True).stdout
        with tarfile.open(fileobj=io.BytesIO(zstandard.ZstdDecompressor().decompressobj().decompress(blob))) as layer:
            if "tmp/freeze.txt" in layer.getnames():
                return layer.extractfile("tmp/freeze.txt").read().decode()
    raise RuntimeError("The Space image has no /tmp/freeze.txt")


def install_runpod(freeze):
    constraints = os.path.join(LAYER_DIR, "space-freeze.txt")
    with open(constraints, "w") as handle:
        handle.write("\n".join(line for line in freeze.splitlines() if "==" in line and "@" not in line))
    run([sys.executable, "-m", "pip", "install", "--no-cache-dir", "--target", PYLIB_DIR,
         "-c", constraints, "runpod"])


def recompiled_libraries():
    """(path on the build pod, path in the Space image) of every recompiled .so."""
    pairs = []
    for package in RECOMPILED_PACKAGES:
        for directory, _, names in os.walk(os.path.join(BUILD_SITE, package)):
            for name in names:
                if name.endswith(".so"):
                    source = os.path.join(directory, name)
                    pairs.append((source, os.path.join(SPACE_SITE, os.path.relpath(source, BUILD_SITE))))
    for name in os.listdir(BUILD_SITE):
        if name.startswith(RECOMPILED_ROOT_MODULES) and name.endswith(".so"):
            pairs.append((os.path.join(BUILD_SITE, name), os.path.join(SPACE_SITE, name)))
    return pairs


def tree(root):
    for directory, _, names in os.walk(root):
        yield directory, directory
        for name in names:
            path = os.path.join(directory, name)
            yield path, path


def owned_by_space_user(info):
    info.uid = info.gid = SPACE_USER
    info.uname = info.gname = ""
    return info


def write_layers(entries):
    layers, current, size, index = [], None, 0, 0
    for source, target in entries:
        if current is None or size > MAX_LAYER_BYTES:
            if current:
                current.close()
            path = os.path.join(LAYER_DIR, f"layer-{index:02d}.tar")
            current, size, index = tarfile.open(path, "w", format=tarfile.PAX_FORMAT), 0, index + 1
            layers.append(path)
        current.add(source, arcname=target.lstrip("/"), recursive=False, filter=owned_by_space_user)
        size += os.lstat(source).st_size
    current.close()
    for path in layers:
        print(f"{path}: {os.path.getsize(path) / 1024 ** 3:.2f} GB", flush=True)
    return layers


def publish(base, layers):
    target = f"{REPOSITORY}:latest"
    run(["crane", "append", "-b", base, *[arg for path in layers for arg in ("-f", path)], "-t", target])
    env_args = [arg for variable in IMAGE_ENV for arg in ("--env", variable)]
    run(["crane", "mutate", target, *env_args, "--cmd", IMAGE_CMD, "-t", target])
    run(["crane", "digest", target])


def pylib_path_file():
    path = os.path.join(LAYER_DIR, "pylib.pth")
    with open(path, "w") as handle:
        handle.write(PYLIB_DIR + "\n")
    return path, os.path.join(SPACE_SITE, "zz_papikapi_pylib.pth")


def main():
    os.makedirs(LAYER_DIR, exist_ok=True)
    base = space_image_digest()
    install_runpod(space_freeze(base))
    libraries = recompiled_libraries()
    print(f"base {base}; recompiled: {[target for _, target in libraries]}", flush=True)
    entries = [*libraries, pylib_path_file(), ("/app", "/app"), (HANDLER, HANDLER),
               *tree(PYLIB_DIR), *tree(WEIGHTS_DIR)]
    layers = write_layers(entries)
    if "--dry-run" not in sys.argv:
        publish(base, layers)


if __name__ == "__main__":
    main()
