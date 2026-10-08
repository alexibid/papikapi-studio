"""Reads and patches a GLB without a 3D tool: the geometry and UVs stay byte-identical, only the colour image changes."""
import json
import struct
import zlib
from dataclasses import dataclass
from pathlib import Path

import numpy as np

GLB_MAGIC = 0x46546C67
JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942
TRIANGLES = 4
COMPONENT_TYPES = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
COMPONENT_COUNTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}
ALIGNMENT = 4


@dataclass(frozen=True)
class Glb:
    document: dict
    binary: bytes


def read_glb(path: Path) -> Glb:
    data = path.read_bytes()
    magic, version, _ = struct.unpack_from("<III", data, 0)
    if magic != GLB_MAGIC or version != 2:
        raise ValueError(f"{path} is not a GLB 2.0 file")
    offset, document, binary = 12, None, b""
    while offset < len(data):
        length, kind = struct.unpack_from("<II", data, offset)
        chunk = data[offset + 8 : offset + 8 + length]
        if kind == JSON_CHUNK:
            document = json.loads(chunk.decode("utf-8"))
        elif kind == BIN_CHUNK:
            binary = bytes(chunk)
        offset += 8 + length
    if document is None:
        raise ValueError(f"{path} has no JSON chunk")
    return Glb(document, binary)


def pad(data: bytes, filler: bytes) -> bytes:
    return data + filler * (-len(data) % ALIGNMENT)


def write_glb(path: Path, glb: Glb) -> None:
    document = pad(json.dumps(glb.document, separators=(",", ":")).encode("utf-8"), b" ")
    binary = pad(glb.binary, b"\x00")
    total = 12 + 8 + len(document) + 8 + len(binary)
    path.write_bytes(
        struct.pack("<III", GLB_MAGIC, 2, total)
        + struct.pack("<II", len(document), JSON_CHUNK) + document
        + struct.pack("<II", len(binary), BIN_CHUNK) + binary
    )


def read_accessor(glb: Glb, index: int) -> np.ndarray:
    accessor = glb.document["accessors"][index]
    view = glb.document["bufferViews"][accessor["bufferView"]]
    dtype = np.dtype(COMPONENT_TYPES[accessor["componentType"]])
    width = COMPONENT_COUNTS[accessor["type"]]
    stride = view.get("byteStride", dtype.itemsize * width)
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    count = accessor["count"]
    raw = np.frombuffer(glb.binary, dtype=np.uint8, count=stride * (count - 1) + dtype.itemsize * width, offset=start)
    rows = np.lib.stride_tricks.as_strided(raw, shape=(count, dtype.itemsize * width), strides=(stride, 1))
    values = np.ascontiguousarray(rows).view(dtype).reshape(count, width)
    if accessor.get("normalized"):
        values = values.astype(np.float32) / float(np.iinfo(dtype).max)
    return values


def triangle_uvs(glb: Glb) -> np.ndarray:
    """UV coordinates of every triangle of the model, shape (triangles, 3, 2), glTF convention (v down)."""
    triangles = []
    for mesh in glb.document.get("meshes", []):
        for primitive in mesh["primitives"]:
            if primitive.get("mode", TRIANGLES) != TRIANGLES or "TEXCOORD_0" not in primitive["attributes"]:
                continue
            uv = read_accessor(glb, primitive["attributes"]["TEXCOORD_0"]).astype(np.float64)
            indices = read_accessor(glb, primitive["indices"])[:, 0] if "indices" in primitive else np.arange(len(uv))
            triangles.append(uv[indices.astype(np.int64)].reshape(-1, 3, 2))
    if not triangles:
        raise ValueError("The model has no textured triangles")
    return np.concatenate(triangles)


def geometry_signature(glb: Glb) -> dict:
    """Counts and a checksum of everything except the colour image, to prove the geometry did not change."""
    colour_view = colour_image_view(glb)
    keep = [i for i in range(len(glb.document["bufferViews"])) if i != colour_view]
    digest = 0
    for index in keep:
        view = glb.document["bufferViews"][index]
        start = view.get("byteOffset", 0)
        digest = (digest * 1000003 + zlib.crc32(glb.binary[start : start + view["byteLength"]])) % (1 << 61)
    return {
        "meshes": len(glb.document.get("meshes", [])),
        "accessors": len(glb.document["accessors"]),
        "triangles": int(len(triangle_uvs(glb))),
        "checksum": digest,
    }


def colour_image_index(glb: Glb) -> int:
    images = set()
    for material in glb.document.get("materials", []):
        texture = material.get("pbrMetallicRoughness", {}).get("baseColorTexture")
        if texture is not None:
            images.add(glb.document["textures"][texture["index"]]["source"])
    if len(images) != 1:
        raise ValueError(f"Expected one colour texture in the model, found {len(images)}")
    return images.pop()


def colour_image_view(glb: Glb) -> int:
    image = glb.document["images"][colour_image_index(glb)]
    if "bufferView" not in image:
        raise ValueError("The colour texture is not embedded in the GLB")
    return image["bufferView"]


def colour_image_bytes(glb: Glb) -> bytes:
    view = glb.document["bufferViews"][colour_image_view(glb)]
    start = view.get("byteOffset", 0)
    return glb.binary[start : start + view["byteLength"]]


def replace_colour_image(glb: Glb, png: bytes) -> Glb:
    """Same model with another colour image: every other byte keeps its content, only the offsets move."""
    document = json.loads(json.dumps(glb.document))
    target = colour_image_view(glb)
    order = sorted(range(len(document["bufferViews"])), key=lambda i: document["bufferViews"][i].get("byteOffset", 0))
    binary = bytearray()
    for index in order:
        view = document["bufferViews"][index]
        start = view.get("byteOffset", 0)
        data = png if index == target else glb.binary[start : start + view["byteLength"]]
        view["byteOffset"], view["byteLength"] = len(binary), len(data)
        binary += pad(bytes(data), b"\x00")
    document["buffers"][0]["byteLength"] = len(binary)
    document["images"][colour_image_index(glb)]["mimeType"] = "image/png"
    return Glb(document, bytes(binary))
