import cv2
import numpy as np

from vector_layers import CELL_RASTER_PX, draw_shape, lab_to_rgb, raster_cells

ATLAS_WIDTH = 2048
PADDING = 4


def organic_raster(texture):
    width, height = texture.size
    canvas = np.zeros((height, width, 4), dtype=np.uint8)
    canvas[:, :, :3] = lab_to_rgb(texture.background)
    canvas[:, :, 3] = 255
    for shape in texture.shapes:
        draw_shape(canvas, shape, 1.0)
    return canvas


def region_raster(texture, palette):
    if not texture.pixel:
        return organic_raster(texture)
    palette_rgb = np.array([lab_to_rgb(colour) for colour in palette])
    visible = texture.resolved
    canvas = raster_cells(np.where(visible, texture.indices, 0), visible, palette_rgb)
    scale = canvas.shape[1] / texture.size[0]
    for shape in texture.shapes:
        draw_shape(canvas, shape, scale)
    return canvas


def pack(rasters):
    placements, x, y, row_height = {}, PADDING, PADDING, 0
    for key, raster in sorted(rasters.items(), key=lambda item: -item[1].shape[0]):
        height, width = raster.shape[:2]
        if x + width + PADDING > ATLAS_WIDTH:
            x, y, row_height = PADDING, y + row_height + 2 * PADDING, 0
        placements[key] = (x, y, width, height)
        x += width + 2 * PADDING
        row_height = max(row_height, height)
    return placements, y + row_height + PADDING


def build_atlas(rasters):
    placements, height = pack(rasters)
    atlas = np.zeros((height, ATLAS_WIDTH, 4), dtype=np.uint8)
    for key, raster in rasters.items():
        x, y, width, tile_height = placements[key]
        padded = cv2.copyMakeBorder(raster, PADDING, PADDING, PADDING, PADDING, cv2.BORDER_REPLICATE)
        atlas[y - PADDING:y + tile_height + PADDING, x - PADDING:x + width + PADDING] = padded
    return atlas, placements


def atlas_uv(texture, placement, atlas_size, point):
    region = texture.region
    plane = region.to_plane(point.reshape(1, 3))[0]
    x, y, width, height = placement
    px = x + (plane[0] - region.bounds[0]) / region.width * width
    py = y + (region.bounds[3] - plane[1]) / region.height * height
    return [float(px / atlas_size[0]), float(1.0 - py / atlas_size[1])]
