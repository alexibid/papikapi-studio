import os
import subprocess
import sys
import tarfile
from datetime import date

BASE_IMAGE = "runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04"
REPOSITORY = "ghcr.io/alexibid/papikapi-trellis"
INSTALL_MARKER = "/etc/trellis-install.marker"
LAYER_DIR = "/root/layers"
MAX_LAYER_BYTES = 3 * 1024 ** 3
EXCLUDED_ROOTS = (
    "/proc", "/sys", "/dev", "/tmp", "/run", "/root", "/workspace",
    "/var/cache", "/var/log", "/var/lib/apt",
)
IMAGE_ENV = ("PYTHONPATH=/app/trellis",)
IMAGE_CMD = "python,-u,/app/rp_handler.trellis.py"


def is_excluded(path):
    return any(path == root or path.startswith(root + "/") for root in EXCLUDED_ROOTS)


def list_installed_paths():
    marker_time = os.stat(INSTALL_MARKER).st_ctime
    for directory, subdirectories, files in os.walk("/", topdown=True):
        subdirectories[:] = [
            name for name in subdirectories
            if not is_excluded(os.path.join(directory, name))
            and not os.path.ismount(os.path.join(directory, name))
        ]
        for name in subdirectories + files:
            path = os.path.join(directory, name)
            if os.lstat(path).st_ctime > marker_time:
                yield path


def split_into_layers(paths):
    layers, current, current_size = [], [], 0
    for path in paths:
        size = os.lstat(path).st_size
        if current and current_size + size > MAX_LAYER_BYTES:
            layers.append(current)
            current, current_size = [], 0
        current.append(path)
        current_size += size
    if current:
        layers.append(current)
    return layers


def write_layer(index, paths):
    layer_path = os.path.join(LAYER_DIR, f"layer-{index:02d}.tar")
    with tarfile.open(layer_path, "w", format=tarfile.PAX_FORMAT) as archive:
        for path in paths:
            archive.add(path, arcname=path.lstrip("/"), recursive=False)
    print(f"{layer_path}: {len(paths)} entries, {os.path.getsize(layer_path) / 1024 ** 3:.2f} GB", flush=True)
    return layer_path


def run(command):
    print("$ " + " ".join(command), flush=True)
    subprocess.run(command, check=True)


def publish(layer_paths):
    release = f"{REPOSITORY}:{date.today().isoformat()}"
    layer_args = [argument for path in layer_paths for argument in ("-f", path)]
    run(["crane", "append", "-b", BASE_IMAGE, *layer_args, "-t", release])
    env_args = [argument for variable in IMAGE_ENV for argument in ("--env", variable)]
    run(["crane", "mutate", release, *env_args, "--cmd", IMAGE_CMD, "-t", release])
    run(["crane", "tag", release, "latest"])
    run(["crane", "digest", f"{REPOSITORY}:latest"])


def main():
    os.makedirs(LAYER_DIR, exist_ok=True)
    layers = split_into_layers(sorted(list_installed_paths()))
    layer_paths = [write_layer(index, paths) for index, paths in enumerate(layers)]
    if "--dry-run" in sys.argv:
        return
    publish(layer_paths)


if __name__ == "__main__":
    main()
