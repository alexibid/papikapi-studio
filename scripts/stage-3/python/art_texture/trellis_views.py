import json
from pathlib import Path

import cv2
import numpy as np
from scipy import ndimage

NEUTRAL_GREY = 128
OPAQUE_ALPHA = 128


class TrellisViews:
    def __init__(self, views_dir, ground_offset):
        directory = Path(views_dir)
        document = json.loads((directory / "views.json").read_text())
        self.resolution = document["resolution"]
        self.centre = np.array(document["centre"], dtype=np.float64)
        self.ground_offset = ground_offset
        self.views = {
            name: (
                cv2.imread(str(directory / view["file"]), cv2.IMREAD_UNCHANGED),
                np.array(view["direction"], dtype=np.float64),
                np.array(view["right"], dtype=np.float64),
                np.array(view["up"], dtype=np.float64),
                float(view["orthoScale"]),
            )
            for name, view in document["views"].items()
        }

    def best_view(self, normal):
        return min(self.views.values(), key=lambda view: float(view[1] @ normal))

    def patch(self, region, size):
        image, _, right, up, scale = self.best_view(region.normal)
        width, height = size
        columns = (np.arange(width) + 0.5) / width
        rows = (np.arange(height) + 0.5) / height
        u = region.bounds[0] + columns * region.width
        v = region.bounds[3] - rows * region.height
        grid_u, grid_v = np.meshgrid(u, v)
        points = region.from_plane(np.stack([grid_u.ravel(), grid_v.ravel()], axis=1)) - self.ground_offset - self.centre
        map_x = ((points @ right) / scale + 0.5) * self.resolution
        map_y = (0.5 - (points @ up) / scale) * self.resolution
        sampled = cv2.remap(
            image,
            map_x.reshape(height, width).astype(np.float32),
            map_y.reshape(height, width).astype(np.float32),
            cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=(0, 0, 0, 0),
        )
        return self.fill_transparent(sampled)

    @staticmethod
    def fill_transparent(sampled):
        colour = sampled[:, :, :3]
        valid = sampled[:, :, 3] >= OPAQUE_ALPHA if sampled.shape[2] == 4 else np.ones(colour.shape[:2], bool)
        if valid.all():
            return colour
        if not valid.any():
            return np.full_like(colour, NEUTRAL_GREY)
        _, nearest = ndimage.distance_transform_edt(~valid, return_indices=True)
        return colour[nearest[0], nearest[1]]
