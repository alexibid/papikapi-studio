import numpy as np


def marching_squares(field, level: float = 0.5):
    inside = field >= level
    case = inside[:-1, :-1].astype(np.int8) + 2 * inside[:-1, 1:] + 4 * inside[1:, 1:] + 8 * inside[1:, :-1]
    rows, cols = np.nonzero((case > 0) & (case < 15))
    table = {
        1: [("L", "B")],
        2: [("B", "R")],
        3: [("L", "R")],
        4: [("R", "T")],
        6: [("B", "T")],
        7: [("L", "T")],
        8: [("L", "T")],
        9: [("B", "T")],
        11: [("R", "T")],
        12: [("L", "R")],
        13: [("B", "R")],
        14: [("L", "B")],
    }
    points, neighbours = {}, {}

    def key(side, y, x):
        return ("h", y + (1 if side == "T" else 0), x) if side in "BT" else ("v", y, x + (1 if side == "R" else 0))

    def locate(k):
        kind, y, x = k
        if kind == "h":
            a, b = field[y, x], field[y, x + 1]
            denom = b - a
            frac = (level - a) / denom if denom != 0 else 0.5
            return (x + frac, y)
        a, b = field[y, x], field[y + 1, x]
        denom = b - a
        frac = (level - a) / denom if denom != 0 else 0.5
        return (x, y + frac)

    for y, x in zip(rows, cols):
        c = int(case[y, x])
        if c in (5, 10):
            centre = field[y:y + 2, x:x + 2].mean() >= level
            if c == 5:
                pairs = [("L", "T"), ("B", "R")] if centre else [("L", "B"), ("R", "T")]
            else:
                pairs = [("L", "B"), ("R", "T")] if centre else [("B", "R"), ("L", "T")]
        else:
            pairs = table[c]
        for first, second in pairs:
            k1, k2 = key(first, y, x), key(second, y, x)
            for k in (k1, k2):
                if k not in points:
                    points[k] = locate(k)
            neighbours.setdefault(k1, []).append(k2)
            neighbours.setdefault(k2, []).append(k1)

    loops, seen = [], set()
    for start in neighbours:
        if start in seen:
            continue
        loop, previous, current = [], None, start
        while True:
            seen.add(current)
            loop.append(points[current])
            options = [n for n in neighbours[current] if n != previous]
            following = options[0] if options else None
            if following is None or following == start or following in seen:
                break
            previous, current = current, following
        if len(loop) >= 6:
            loops.append(np.array(loop))
    return loops


def polygon_area(points) -> float:
    x, y = points[:, 0], points[:, 1]
    return float(0.5 * abs(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1))))


def perimeter(points) -> float:
    return float(np.hypot(*(np.roll(points, -1, axis=0) - points).T).sum())


def smooth_closed(points, passes: int = 8):
    for _ in range(passes):
        points = (np.roll(points, 1, axis=0) + 2 * points + np.roll(points, -1, axis=0)) / 4.0
    return points


def resample(points, step: float):
    closed = np.vstack([points, points[:1]])
    distance = np.r_[0, np.cumsum(np.hypot(*np.diff(closed, axis=0).T))]
    total_dist = distance[-1]
    count = max(8, int(round(total_dist / step)))
    samples = np.linspace(0, total_dist, count, endpoint=False)
    return np.stack([np.interp(samples, distance, closed[:, 0]), np.interp(samples, distance, closed[:, 1])], axis=1)
