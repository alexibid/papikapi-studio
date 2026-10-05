"""Ajuste de curvas de Schneider (Graphics Gems): uma cadeia aberta de Beziers cubicas
que segue uma linha densa com erro maximo controlado."""
from typing import List, Tuple
import numpy as np

Segment = Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]
NEWTON_ROUNDS = 4
MIN_TANGENT_LENGTH = 1e-9


def _unit(vector):
    length = np.hypot(*vector)
    return vector / length if length > MIN_TANGENT_LENGTH else np.zeros(2)


def _bernstein(t):
    u = 1.0 - t
    return np.stack([u ** 3, 3 * u * u * t, 3 * u * t * t, t ** 3], axis=1)


def _evaluate(control, t):
    return _bernstein(t) @ np.array(control)


def _chord_parameters(points):
    steps = np.hypot(*np.diff(points, axis=0).T)
    cumulative = np.concatenate([[0.0], np.cumsum(steps)])
    return cumulative / cumulative[-1] if cumulative[-1] > 0 else np.linspace(0, 1, len(points))


def _generate(points, t, left_tangent, right_tangent) -> Segment:
    first, last = points[0], points[-1]
    basis = _bernstein(t)
    a1 = left_tangent[None, :] * basis[:, 1:2]
    a2 = right_tangent[None, :] * basis[:, 2:3]
    c = np.array([[np.sum(a1 * a1), np.sum(a1 * a2)], [np.sum(a1 * a2), np.sum(a2 * a2)]])
    residual = points - (first[None, :] * (basis[:, 0:1] + basis[:, 1:2]) + last[None, :] * (basis[:, 2:3] + basis[:, 3:4]))
    x = np.array([np.sum(a1 * residual), np.sum(a2 * residual)])
    determinant = c[0, 0] * c[1, 1] - c[0, 1] * c[1, 0]
    chord = np.hypot(*(last - first))
    alpha_left = alpha_right = chord / 3.0
    if abs(determinant) > 1e-12:
        solved_left = (x[0] * c[1, 1] - x[1] * c[0, 1]) / determinant
        solved_right = (c[0, 0] * x[1] - c[1, 0] * x[0]) / determinant
        if solved_left > 1e-6 * chord and solved_right > 1e-6 * chord:
            alpha_left, alpha_right = solved_left, solved_right
    return first, first + left_tangent * alpha_left, last + right_tangent * alpha_right, last


def _reparameterize(control, points, t):
    p = _evaluate(control, t)
    u = 1.0 - t
    q1 = 3 * ((u * u)[:, None] * (control[1] - control[0]) + (2 * u * t)[:, None] * (control[2] - control[1])
              + (t * t)[:, None] * (control[3] - control[2]))
    q2 = 6 * (u[:, None] * (control[2] - 2 * control[1] + control[0]) + t[:, None] * (control[3] - 2 * control[2] + control[1]))
    diff = p - points
    numerator = np.sum(diff * q1, axis=1)
    denominator = np.sum(q1 * q1, axis=1) + np.sum(diff * q2, axis=1)
    safe = np.abs(denominator) > 1e-12
    refined = t.copy()
    refined[safe] = t[safe] - numerator[safe] / denominator[safe]
    return np.clip(refined, 0.0, 1.0)


def _worst_error(control, points, t):
    squared = np.sum((_evaluate(control, t) - points) ** 2, axis=1)
    worst = int(np.argmax(squared))
    return float(squared[worst]), worst


def _fit(points, left_tangent, right_tangent, error: float) -> List[Segment]:
    if len(points) == 2:
        gap = np.hypot(*(points[1] - points[0])) / 3.0
        return [(points[0], points[0] + left_tangent * gap, points[1] + right_tangent * gap, points[1])]
    t = _chord_parameters(points)
    control = _generate(points, t, left_tangent, right_tangent)
    worst_squared, split = _worst_error(control, points, t)
    if worst_squared < error:
        return [control]
    if worst_squared < error * 16:
        for _ in range(NEWTON_ROUNDS):
            t = _reparameterize(control, points, t)
            control = _generate(points, t, left_tangent, right_tangent)
            worst_squared, split = _worst_error(control, points, t)
            if worst_squared < error:
                return [control]
    split = min(max(split, 1), len(points) - 2)
    centre = _unit(points[split - 1] - points[split + 1])
    return _fit(points[:split + 1], left_tangent, centre, error) + _fit(points[split:], -centre, right_tangent, error)


def end_tangents(points, reach: int = 4):
    count = len(points)
    span = min(reach, count - 1)
    return _unit(points[span] - points[0]), _unit(points[-1 - span] - points[-1])


def fit_open_curve(points, max_error: float) -> List[Segment]:
    """Ajusta uma cadeia aberta de Beziers cubicas; max_error em pixeis."""
    points = np.asarray(points, dtype=np.float64)
    if len(points) < 2:
        return []
    left, right = end_tangents(points)
    return _fit(points, left, right, max_error * max_error)


def segments_path(segments: List[Segment]) -> str:
    start = segments[0][0]
    parts = [f"M{start[0]:.1f} {start[1]:.1f}"]
    for _, c1, c2, end in segments:
        parts.append(f"C{c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f} {end[0]:.1f} {end[1]:.1f}")
    return "".join(parts)


def segments_polyline(segments: List[Segment], steps: int = 12):
    t = np.linspace(0, 1, steps, endpoint=False)
    parts = [_evaluate(segment, t) for segment in segments]
    parts.append(np.array([segments[-1][3]]))
    return np.vstack(parts)
