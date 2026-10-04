import numpy as np


def bezier_segments(knots, tension: float = 0.2):
    count = len(knots)
    segments = []
    for i in range(count):
        p0 = knots[(i - 1) % count]
        p1 = knots[i]
        p2 = knots[(i + 1) % count]
        p3 = knots[(i + 2) % count]
        c1 = p1 + (p2 - p0) * tension
        c2 = p2 - (p3 - p1) * tension
        segments.append((p1, c1, c2, p2))
    return segments


def bezier_path(knots, tension: float = 0.2) -> str:
    segments = bezier_segments(knots, tension)
    parts = [f"M{knots[0][0]:.1f} {knots[0][1]:.1f}"]
    for _, c1, c2, p2 in segments:
        parts.append(f"C{c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f} {p2[0]:.1f} {p2[1]:.1f}")
    return "".join(parts) + "Z"


def bezier_polyline(knots, tension: float = 0.2, steps: int = 10):
    t = np.linspace(0, 1, steps, endpoint=False)[:, None]
    poly_parts = []
    for a, b, c, d in bezier_segments(knots, tension):
        sampled = (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d
        poly_parts.append(sampled)
    return np.vstack(poly_parts)
