import numpy as np


def transition_profile(grid, axis):
    padded = np.pad(grid, 1)
    count = grid.shape[axis]
    after = np.take(padded, range(1, count + 2), axis=axis)[tuple(slice(1, -1) if a != axis else slice(None) for a in range(3))]
    before = np.take(padded, range(0, count + 1), axis=axis)[tuple(slice(1, -1) if a != axis else slice(None) for a in range(3))]
    other_axes = tuple(a for a in range(3) if a != axis)
    return (after != before).sum(axis=other_axes)


def cluster_transitions(profile, gap, minimum):
    clusters = []
    for position in np.flatnonzero(profile >= minimum):
        if clusters and position - clusters[-1]["last"] <= gap:
            cluster = clusters[-1]
            cluster["moment"] += position * profile[position]
            cluster["mass"] += profile[position]
            cluster["last"] = position
        else:
            clusters.append({"moment": position * profile[position], "mass": profile[position], "last": position})
    return [cluster["moment"] / cluster["mass"] for cluster in clusters]


def axis_planes(grid, axis, low, cell, gap, minimum_ratio):
    profile = transition_profile(grid, axis)
    count = grid.shape[axis]
    centres = cluster_transitions(profile, gap, minimum_ratio * profile.max())
    inner = [position for position in centres if gap < position < count - gap]
    return [low[axis] + position * cell for position in [0, *inner, count]]


def box_planes(grid, low, cell, settings):
    gap = max(1, int(round(settings["box_plane_merge_ratio"] * settings["box_voxel_resolution"])))
    return [
        axis_planes(grid, axis, low, cell, gap, settings["box_plane_min_area_ratio"])
        for axis in range(3)
    ]
