"""Which connected pieces of a TRELLIS mesh belong to the figure.

TRELLIS often builds a figure from overlapping closed shells (a blocky head on a body, spikes on a back)
that share no edge with the largest piece. Every piece that touches the figure stays; only pieces far
from it, and a flat slab lying on the floor (a separate plinth), go.
"""
from mathutils.bvhtree import BVHTree

ATTACH_DISTANCE_RATIO = 0.01
PLINTH_HEIGHT_RATIO = 0.02
PLINTH_FOOTPRINT_SHARE = 0.08


def heights(component):
    values = [vertex.co.z for face in component for vertex in face.verts]
    return min(values), max(values)


def footprint(component):
    xs = [vertex.co.x for face in component for vertex in face.verts]
    ys = [vertex.co.y for face in component for vertex in face.verts]
    return (max(xs) - min(xs)) * (max(ys) - min(ys))


def tree_of(components):
    index_of, points, polygons = {}, [], []
    for component in components:
        for face in component:
            polygon = []
            for vertex in face.verts:
                if vertex not in index_of:
                    index_of[vertex] = len(points)
                    points.append(vertex.co.copy())
                polygon.append(index_of[vertex])
            polygons.append(polygon)
    return BVHTree.FromPolygons(points, polygons)


def touches(component, tree, distance):
    return any(tree.find_nearest(vertex.co, distance)[0] is not None
               for face in component for vertex in face.verts)


def is_plinth(component, floor, height, figure_footprint):
    low = heights(component)[1] <= floor + PLINTH_HEIGHT_RATIO * height
    return low and footprint(component) >= PLINTH_FOOTPRINT_SHARE * figure_footprint


def figure_and_strays(components, length):
    """Splits the pieces into the figure (largest piece plus every piece touching it) and the rest."""
    main = components[0]
    floor, top = heights(main)
    height, main_footprint = top - floor, footprint(main)
    plinths = [component for component in components[1:] if is_plinth(component, floor, height, main_footprint)]
    pending = [component for component in components[1:] if not any(component is plinth for plinth in plinths)]
    figure, distance = [main], ATTACH_DISTANCE_RATIO * length
    while pending:
        tree = tree_of(figure)
        attached = [component for component in pending if touches(component, tree, distance)]
        if not attached:
            break
        figure += attached
        pending = [component for component in pending if not any(component is piece for piece in attached)]
    return figure, plinths + pending, bool(plinths)
