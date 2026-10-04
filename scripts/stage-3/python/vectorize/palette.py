import numpy as np
from color_space import (
    from_hex,
    hue_gap,
    is_neutral,
    lab_to_srgb,
    lch_of,
    srgb_to_lab,
    to_hex,
)
from config import VectorizeConfig


def mode_seed(values, period, bin_width):
    edges = np.arange(0, period + bin_width, bin_width)
    counts, _ = np.histogram(values, bins=edges)
    if period == 360:
        counts = counts + np.roll(counts, 1) + np.roll(counts, -1)
    index = int(np.argmax(counts))
    return (edges[index] + edges[index + 1]) / 2


class Palette:
    def __init__(self, samples_rgb, config: VectorizeConfig):
        self.config = config
        lab = srgb_to_lab(samples_rgb)
        lightness, chroma, hue = lch_of(lab)
        neutral = is_neutral(lightness, chroma, config.neutral_chroma, config.dark_l, config.light_l)
        span = float(np.percentile(lightness, 99) - np.percentile(lightness, 1)) if len(lightness) else 100.0
        tolerance = float(np.clip(config.neutral_tol_ratio * span, config.neutral_l_tol_min, config.neutral_l_tolerance))
        self.neutral_seeds = self.find_seeds(lightness[neutral], 100.0, 2.0, lambda v, s: np.abs(v - s) <= tolerance)
        self.chromatic_seeds = self.find_seeds(hue[~neutral], 360.0, 5.0, lambda v, s: hue_gap(v, s) <= config.hue_tolerance)
        self.flatten_colours(samples_rgb)

    def find_seeds(self, values, period, bin_width, near):
        seeds, left, total = [], np.asarray(values), max(len(values), 1)
        while len(left) > 0:
            seed = mode_seed(left, period, bin_width)
            absorbed = near(left, seed)
            if not absorbed.any():
                break
            if absorbed.sum() / total >= self.config.min_family_share:
                seeds.append(seed)
            left = left[~absorbed]
        return np.array(seeds)

    def classify(self, rgb):
        lab = srgb_to_lab(rgb)
        lightness, chroma, hue = lch_of(lab)
        neutral = is_neutral(lightness, chroma, self.config.neutral_chroma, self.config.dark_l, self.config.light_l)
        count = len(self.neutral_seeds)
        result = np.zeros(len(rgb), dtype=np.int64)
        for flag in (True, False):
            mask = neutral == flag
            if not mask.any():
                continue
            if flag and count:
                result[mask] = np.argmin(np.abs(lightness[mask, None] - self.neutral_seeds[None, :]), axis=1)
            elif not flag and len(self.chromatic_seeds):
                result[mask] = count + np.argmin(hue_gap(hue[mask, None], self.chromatic_seeds[None, :]), axis=1)
        return result

    def flatten_colours(self, samples_rgb):
        labels = self.classify(samples_rgb)
        lab = srgb_to_lab(samples_rgb)
        total = len(self.neutral_seeds) + len(self.chromatic_seeds)
        self.lab, self.share = np.zeros((total, 3)), np.zeros(total)
        for family in range(total):
            members = labels == family
            self.share[family] = members.mean()
            if members.any():
                self.lab[family] = self.flat_lab(lab[members])
        self.rgb = lab_to_srgb(self.lab)
        self.base = int(self.share.argmax())

    def flat_lab(self, members):
        lightness = members[:, 0]
        chroma = np.hypot(members[:, 1], members[:, 2])
        greyish = chroma.mean() < self.config.neutral_chroma or lightness.mean() < self.config.dark_l or lightness.mean() > self.config.light_l
        if greyish:
            if lightness.mean() >= self.config.whiten_from_l:
                return members[lightness >= np.percentile(lightness, self.config.flat_percentile)].mean(axis=0)
            if lightness.mean() <= 35:
                return members[lightness <= np.percentile(lightness, 100 - self.config.flat_percentile)].mean(axis=0)
            return np.median(members, axis=0)
        return members[chroma >= np.percentile(chroma, self.config.flat_percentile - 20)].mean(axis=0)

    def prune_transitions(self, views):
        while True:
            edge = self.edge_fractions(views)
            candidates = [f for f in range(len(self.neutral_seeds)) if edge[f] > self.config.transition_edge_fraction and len(self.neutral_seeds) > 1]
            if not candidates:
                return
            drop = min(candidates, key=lambda f: self.share[f])
            self.neutral_seeds = np.delete(self.neutral_seeds, drop)
            self.refine_after_drop(views)

    def refine_after_drop(self, views):
        self.flatten_colours(np.concatenate([rgb[alpha >= 0.5] for rgb, alpha in views]))

    def edge_fractions(self, views):
        total = len(self.neutral_seeds) + len(self.chromatic_seeds)
        touching, count = np.zeros(total), np.zeros(total)
        for rgb, alpha in views:
            labels = np.full(alpha.shape, -1, dtype=np.int64)
            inside = alpha >= 0.5
            labels[inside] = self.classify(rgb[inside])
            different = np.zeros(alpha.shape, dtype=bool)
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (2, 0), (-2, 0), (0, 2), (0, -2)):
                shifted = np.roll(np.roll(labels, dy, axis=0), dx, axis=1)
                different |= (shifted != labels) & (shifted >= 0)
            for family in range(total):
                members = labels == family
                count[family] += members.sum()
                touching[family] += (members & different).sum()
        return touching / np.maximum(count, 1)

    def describe(self):
        return [
            {
                "index": i,
                "hex": to_hex(self.rgb[i]),
                "share": round(float(self.share[i]), 4),
                "kind": "neutral" if i < len(self.neutral_seeds) else "hue",
            }
            for i in range(len(self.rgb))
        ]
