from dataclasses import dataclass, replace

import numpy as np


@dataclass(frozen=True)
class Camera:
    azimuth: float
    elevation: float
    scale: float
    shift_x: float
    shift_y: float
    depth_inverse: float
    centre: np.ndarray
    image_size: int

    def basis(self):
        right = np.array([np.cos(self.azimuth), np.sin(self.azimuth), 0.0])
        away = np.array([-np.sin(self.azimuth), np.cos(self.azimuth), 0.0])
        forward = away * np.cos(self.elevation) - np.array([0.0, 0.0, np.sin(self.elevation)])
        up = np.cross(right, forward)
        return right, up, forward

    def depth(self, points):
        return (points - self.centre) @ self.basis()[2]

    def project(self, points):
        right, up, _ = self.basis()
        relative = points - self.centre
        perspective = 1.0 / (1.0 + self.depth_inverse * self.depth(points))
        half = self.image_size / 2
        x = half + self.shift_x + self.scale * (relative @ right) * perspective
        y = half + self.shift_y - self.scale * (relative @ up) * perspective
        return np.stack([x, y], axis=1)

    def faces_viewer(self, normal):
        return float(normal @ -self.basis()[2]) > 0

    def with_values(self, **values):
        return replace(self, **values)
