from dataclasses import dataclass, field
from typing import List


@dataclass(frozen=True)
class VectorizeConfig:
    resolution: int = 2048
    view_names: List[str] = field(default_factory=lambda: ["front", "back", "left", "right", "top", "bottom"])
    min_region_px: float = 12.0
    extend_px: float = 14.0
    inner_max_px: float = 0.0
    inner_enclosed: float = 0.85
    smooth_sigma: float = 1.6
    contour_sigma: float = 1.2
    open_radius_px: float = 1.0
    node_step_px: float = 7.0
    min_shape_px: float = 15.0
    tint_max_radius_px: float = 8.0
    min_thickness_px: float = 0.0
    loop_smooth_passes: int = 8
    tension: float = 0.2
    raster_scale: int = 2
    stroke_width_px: float = 0.6
    thin_min_length_px: float = 35.0
    thin_min_width_px: float = 1.5
    thin_max_width_px: float = 8.0
    hue_tolerance: float = 28.0
    neutral_l_tolerance: float = 32.0
    neutral_tol_ratio: float = 0.4
    neutral_l_tol_min: float = 14.0
    whiten_from_l: float = 65.0
    neutral_chroma: float = 14.0
    dark_l: float = 25.0
    light_l: float = 94.0
    transition_edge_fraction: float = 0.5
    min_family_share: float = 0.0002
    flat_percentile: int = 95

    @classmethod
    def create(cls, resolution: int = 2048, **overrides) -> "VectorizeConfig":
        factor = resolution / 1024.0
        area_factor = factor * factor
        params = {
            "resolution": resolution,
            "min_region_px": 12.0 * area_factor,
            "extend_px": 14.0 * factor,
            "inner_max_px": 0.0 * area_factor,
            "smooth_sigma": 0.8 * factor,
            "contour_sigma": 0.5 * factor,
            "open_radius_px": 1.0 * factor,
            "node_step_px": 7.0 * factor,
            "min_shape_px": 15.0 * area_factor,
            "tint_max_radius_px": 8.0 * factor,
            "min_thickness_px": 0.0,
            "stroke_width_px": 0.6 * factor,
            "thin_min_length_px": 35.0 * factor,
            "thin_min_width_px": 1.5 * factor,
            "thin_max_width_px": 8.0 * factor,
            "raster_scale": 2,
        }
        params.update(overrides)
        return cls(**params)
