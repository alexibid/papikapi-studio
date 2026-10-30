"""Packs files into an image layer tar for `crane append`, safe for RunPod's Linux hosts.

macOS `tar` stores extended attributes such as `com.apple.provenance`; a Linux host cannot apply them and refuses
the whole image ("failed to register layer: lsetxattr"). This writes plain POSIX entries owned by root, with no
extended attributes, and checks the result before returning.

python3 scripts/runpod/pack_layer.py <root_dir> <out.tar> <path inside root> [<path> ...]
"""
import sys
import tarfile
from pathlib import Path


def plain(info: tarfile.TarInfo) -> tarfile.TarInfo:
    info.uid = info.gid = 0
    info.uname = info.gname = "root"
    info.pax_headers = {}
    return info


def pack(root: Path, output: Path, members: list) -> int:
    with tarfile.open(output, "w", format=tarfile.GNU_FORMAT) as archive:
        for member in members:
            archive.add(root / member, arcname=member, filter=plain)
    return verify(output)


def verify(output: Path) -> int:
    with tarfile.open(output) as archive:
        entries = archive.getmembers()
    dirty = [entry.name for entry in entries if entry.pax_headers or entry.uid != 0 or entry.name.startswith("._")
             or "/._" in entry.name]
    if dirty:
        raise SystemExit(f"Layer is not clean: {dirty[:5]}")
    return len(entries)


if __name__ == "__main__":
    root_dir, out, *paths = sys.argv[1:]
    count = pack(Path(root_dir), Path(out), paths)
    print(f"{out}: {count} entries, root-owned, no extended attributes")
