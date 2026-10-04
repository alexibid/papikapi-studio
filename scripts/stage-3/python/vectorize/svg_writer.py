from typing import Dict, List
import numpy as np
from bezier import bezier_path
from color_space import to_hex


def write_svg(palette, loops_per_family: Dict[int, List[np.ndarray]], size: int, base_family: int, tension: float = 0.2, stroke_width: float = 0.0, extra_paths=None):
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">',
        f'<rect width="{size}" height="{size}" fill="{to_hex(palette.rgb[base_family])}"/>',
    ]
    total_nodes = 0
    total_paths = 0

    sorted_families = sorted(
        loops_per_family.keys(),
        key=lambda f: sum(len(k) for k in loops_per_family[f]),
        reverse=True,
    )

    for family in sorted_families:
        if family == base_family:
            continue
        loops = loops_per_family[family]
        if not loops:
            continue
        d_str = "".join(bezier_path(k, tension) for k in loops)
        color_hex = to_hex(palette.rgb[family])
        stroke = f' stroke="{color_hex}" stroke-width="{stroke_width:g}" stroke-linejoin="round"' if stroke_width > 0 else ""
        parts.append(f'<path fill="{color_hex}" fill-rule="evenodd"{stroke} d="{d_str}"/>')
        total_nodes += sum(len(k) for k in loops)
        total_paths += 1

    parts.extend(extra_paths or [])
    parts.append("</svg>")
    return "\n".join(parts), total_paths, total_nodes
