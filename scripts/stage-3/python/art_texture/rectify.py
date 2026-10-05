from dataclasses import dataclass

import cv2
import numpy as np

ID_SUPERSAMPLE = 2
VISIBLE_ERODE_PX = 1


@dataclass(frozen=True)
class RectifiedPatch:
    colour: np.ndarray
    visible: np.ndarray
    coverage: np.ndarray


def patch_size(region, pixels_per_metre):
    return max(1, round(region.width * pixels_per_metre)), max(1, round(region.height * pixels_per_metre))


def patch_to_image(camera, region, size):
    width, height = size
    source = np.array([[0, 0], [width, 0], [width, height], [0, height]], dtype=np.float32)
    target = camera.project(region.corners()).astype(np.float32)
    return cv2.getPerspectiveTransform(source, target)


def face_id_image(camera, mesh):
    canvas = np.zeros((camera.image_size * ID_SUPERSAMPLE,) * 2, dtype=np.int32)
    order = sorted(range(len(mesh.faces)), key=lambda index: -float(np.mean(camera.depth(mesh.vertices[list(mesh.faces[index])]))))
    for index in order:
        points = camera.project(mesh.vertices[list(mesh.faces[index])]) * ID_SUPERSAMPLE
        cv2.fillConvexPoly(canvas, np.round(points).astype(np.int32), index + 1)
    return canvas


def warp(image, transform, size, interpolation):
    return cv2.warpPerspective(image, transform, size, flags=interpolation | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_CONSTANT)


def region_coverage(region, mesh, size):
    width, height = size
    canvas = np.zeros((height, width), dtype=np.uint8)
    for face in region.face_ids:
        plane = region.to_plane(mesh.vertices[list(mesh.faces[face])])
        pixels = np.stack([(plane[:, 0] - region.bounds[0]) / region.width * width,
                           (region.bounds[3] - plane[:, 1]) / region.height * height], axis=1)
        cv2.fillConvexPoly(canvas, np.round(pixels).astype(np.int32), 1)
    return canvas > 0


def rectify_region(art, camera, mesh, region, ids, pixels_per_metre):
    size = patch_size(region, pixels_per_metre)
    transform = patch_to_image(camera, region, size)
    scaled = np.diag([ID_SUPERSAMPLE, ID_SUPERSAMPLE, 1.0]) @ transform
    colour = warp(art[:, :, :3], transform, size, cv2.INTER_CUBIC)
    identifiers = warp(ids.astype(np.float32), scaled, size, cv2.INTER_NEAREST)
    own = np.isin(identifiers.astype(np.int32), [face + 1 for face in region.face_ids])
    opaque = warp(art[:, :, 3], transform, size, cv2.INTER_LINEAR) > 200
    inside = region_coverage(region, mesh, size)
    visible = cv2.erode((own & opaque & inside).astype(np.uint8), np.ones((3, 3), np.uint8), iterations=VISIBLE_ERODE_PX) > 0
    return RectifiedPatch(colour, visible, inside)


def visible_regions(camera, regions):
    return [region for region in regions if camera.faces_viewer(region.normal)]
