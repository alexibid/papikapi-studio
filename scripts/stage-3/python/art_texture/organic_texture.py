import numpy as np

from palette import build_palette, dominant_colours, nearest_index
from pixel_grid import CellGrid, to_lab
from region_textures import RegionTexture, TRELLIS_LIGHTNESS_WEIGHT
from smooth_objects import cluster_pixels, shape_from_mask, smoothed_mask

SAMPLES_PER_REGION = 120
PALETTE_MERGE_DISTANCE = 10.0
MINIMUM_COLOUR_SHARE = 0.003
SIGMA_RATIO = 0.004
MINIMUM_SHAPE_AREA_PX = 10
MINIMUM_VISIBLE_SHARE = 0.6
MINIMUM_REGION_PIXELS = 24


def is_reliable(patch):
    coverage = int(patch.coverage.sum())
    return coverage >= MINIMUM_REGION_PIXELS and patch.visible.sum() >= MINIMUM_VISIBLE_SHARE * coverage


def organic_palette(patches):
    samples = []
    for patch in patches:
        lab = to_lab(patch.colour)[patch.visible]
        step = max(1, len(lab) // SAMPLES_PER_REGION)
        samples.extend(lab[::step])
    centres, weights = build_palette(samples, PALETTE_MERGE_DISTANCE)
    return dominant_colours(centres, weights, MINIMUM_COLOUR_SHARE)[0]


def layered(lab, mask, colour_of):
    labels, centres = cluster_pixels(lab[mask])
    order = np.argsort(-np.bincount(labels, minlength=len(centres)))
    sigma = max(0.8, SIGMA_RATIO * max(mask.shape))
    shapes, background = [], None
    for position, index in enumerate(order):
        cluster = np.zeros(mask.shape, dtype=bool)
        cluster[mask] = labels == index
        colour = colour_of(cluster, centres[index])
        if position == 0:
            background = colour
            continue
        shapes.extend(shape_from_mask(smoothed_mask(cluster, sigma), colour, MINIMUM_SHAPE_AREA_PX))
    return background, shapes


def single_cell_grid(background):
    return CellGrid(1, 1, np.array([[background]], dtype=np.float32), np.ones((1, 1), bool), np.ones((1, 1), bool), np.ones((1, 1), bool))


def build_texture(region, patch, palette, background, shapes):
    size = (patch.colour.shape[1], patch.colour.shape[0])
    indices = np.array([[nearest_index(palette, background)]])
    return RegionTexture(region, single_cell_grid(background), indices, np.ones((1, 1), bool), size, shapes, False, background)


def organic_art(region, patch, palette):
    lab = to_lab(patch.colour)
    background, shapes = layered(lab, patch.visible, lambda mask, centre: centre)
    return build_texture(region, patch, palette, background, shapes)


def organic_fallback(region, shape_patch, colour_patch, palette):
    shape_lab, source_lab = to_lab(shape_patch.colour), to_lab(colour_patch.colour)

    def palette_colour(mask, centre):
        found = np.median(source_lab[mask], axis=0) if mask.any() else centre
        return palette[nearest_index(palette, found, TRELLIS_LIGHTNESS_WEIGHT)]

    background, shapes = layered(shape_lab, shape_patch.visible, palette_colour)
    return build_texture(region, shape_patch, palette, background, shapes)
