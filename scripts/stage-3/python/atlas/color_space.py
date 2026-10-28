import numpy as np

D65 = np.array([0.95047, 1.0, 1.08883])
SRGB_TO_XYZ = np.array([
    [0.4124564, 0.3575761, 0.1804375],
    [0.2126729, 0.7151522, 0.0721750],
    [0.0193339, 0.1191920, 0.9503041],
])
XYZ_TO_SRGB = np.linalg.inv(SRGB_TO_XYZ)


def srgb_to_linear(c):
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c):
    c = np.clip(np.asarray(c, dtype=np.float64), 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def srgb_to_lab(rgb):
    xyz = (srgb_to_linear(rgb) @ SRGB_TO_XYZ.T) / D65
    f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    return np.stack([116 * f[:, 1] - 16, 500 * (f[:, 0] - f[:, 1]), 200 * (f[:, 1] - f[:, 2])], axis=1)


def lab_to_srgb(lab):
    lab = np.atleast_2d(lab)
    fy = (lab[:, 0] + 16) / 116
    f = np.stack([fy + lab[:, 1] / 500, fy, fy - lab[:, 2] / 200], axis=1)
    xyz = np.where(f ** 3 > 216 / 24389, f ** 3, (116 * f - 16) / (24389 / 27)) * D65
    return linear_to_srgb(xyz @ XYZ_TO_SRGB.T)


def to_hex(rgb):
    r, g, b = (np.clip(np.asarray(rgb), 0, 1) * 255 + 0.5).astype(int)
    return f"#{r:02x}{g:02x}{b:02x}"


def from_hex(text):
    return np.array([int(text[i:i + 2], 16) for i in (1, 3, 5)]) / 255.0


def lch_of(lab):
    return lab[:, 0], np.hypot(lab[:, 1], lab[:, 2]), np.degrees(np.arctan2(lab[:, 2], lab[:, 1])) % 360


def is_neutral(lightness, chroma, neutral_chroma=14.0, dark_l=25.0, light_l=94.0):
    return (chroma < neutral_chroma) | (lightness < dark_l) | (lightness > light_l)


def hue_gap(a, b):
    gap = np.abs(a - b) % 360
    return np.minimum(gap, 360 - gap)
