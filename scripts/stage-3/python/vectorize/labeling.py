import os
import numpy as np
from config import VectorizeConfig
from PIL import Image
from scipy import ndimage


def load_view(directory: str, name: str):
    image = np.asarray(Image.open(os.path.join(directory, f"{name}.png")).convert("RGBA"), dtype=np.float32) / 255.0
    return image[:, :, :3], image[:, :, 3]


def sampled_views(directory: str, view_names, step: int = 2):
    for name in view_names:
        rgb, alpha = load_view(directory, name)
        yield rgb[::step, ::step].astype(np.float64), alpha[::step, ::step]


def label_view(rgb, alpha, palette, config: VectorizeConfig):
    inside = alpha >= 0.5
    labels = np.full(alpha.shape, -1, dtype=np.int64)
    labels[inside] = palette.classify(rgb[inside])
    distance, nearest = ndimage.distance_transform_edt(~inside, return_indices=True)
    labels = labels[nearest[0], nearest[1]]
    labels[distance > config.extend_px] = palette.base
    return labels
