import numpy as np

from pixel_grid import to_lab
from rectify import face_id_image, rectify_region, visible_regions

LIGHTNESS_WEIGHT = 0.4
MIN_VISIBLE_PIXELS = 80


def region_disagreement(patch, trellis_patch):
    art_mean = to_lab(patch.colour)[patch.visible].mean(axis=0)
    trellis_mean = to_lab(trellis_patch)[patch.visible].mean(axis=0)
    return float(np.linalg.norm((art_mean - trellis_mean) * np.array([LIGHTNESS_WEIGHT, 1.0, 1.0])))


def registration_disagreement(registration, regions, mesh, art, views, pixels_per_metre):
    ids = face_id_image(registration.camera, mesh)
    total, weight = 0.0, 0.0
    for region in visible_regions(registration.camera, regions):
        patch = rectify_region(art, registration.camera, mesh, region, ids, pixels_per_metre)
        pixels = int(patch.visible.sum())
        if pixels < MIN_VISIBLE_PIXELS:
            continue
        size = (patch.colour.shape[1], patch.colour.shape[0])
        total += pixels * region_disagreement(patch, views.patch(region, size))
        weight += pixels
    return total / weight if weight else float("inf")


def choose_registration(registrations, regions, mesh, art, views, pixels_per_metre):
    plausible = [item for item in registrations if item.iou >= 0.9 * registrations[0].iou]
    return min(plausible, key=lambda item: registration_disagreement(item, regions, mesh, art, views, pixels_per_metre))
