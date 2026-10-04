import bmesh
import numpy
from mathutils import Matrix, Vector
from mathutils.geometry import tessellate_polygon

UPWARD_NORMAL = 0.95
SEARCH_HEIGHT_RATIO = 0.3
BIN_RATIO = 0.004
FALLBACK_LEVEL_RATIO = 0.04
SEPARATE_PLINTH_RATIO = 0.02
SURFACE_BAND_RATIO = 0.015
SURFACE_PERCENTILE = 95
CONTACT_BAND_RATIO = 0.02


def connected_components(surface):
    visited = set()
    components = []
    for face in surface.faces:
        if face in visited:
            continue
        component, stack = [], [face]
        visited.add(face)
        while stack:
            current = stack.pop()
            component.append(current)
            for edge in current.edges:
                for neighbour in edge.link_faces:
                    if neighbour not in visited:
                        visited.add(neighbour)
                        stack.append(neighbour)
        components.append(component)
    return components


def component_heights(component):
    heights = [vertex.co.z for face in component for vertex in face.verts]
    return min(heights), max(heights)


def remove_disconnected_islands(surface):
    components = sorted(connected_components(surface), key=len, reverse=True)
    main_floor = component_heights(components[0])[0]
    total = [vertex.co.z for vertex in surface.verts]
    tolerance = SEPARATE_PLINTH_RATIO * (max(total) - min(total))
    stray = [face for component in components[1:] for face in component]
    separate_plinth = any(component_heights(component)[1] <= main_floor + tolerance for component in components[1:])
    if stray:
        bmesh.ops.delete(surface, geom=stray, context="FACES")
        bmesh.ops.delete(surface, geom=[vertex for vertex in surface.verts if not vertex.link_edges], context="VERTS")
    return max(0, len(components) - 1), separate_plinth


def plinth_top_level(surface, height):
    bins = {}
    for face in surface.faces:
        level = face.calc_center_median().z
        if face.normal.z >= UPWARD_NORMAL and level <= SEARCH_HEIGHT_RATIO * height:
            bins.setdefault(round(level / (BIN_RATIO * height)), []).append((face.calc_area(), level))
    if not bins:
        return FALLBACK_LEVEL_RATIO * height
    heaviest = max(bins.values(), key=lambda entries: sum(area for area, _ in entries))
    return sum(level for _, level in heaviest) / len(heaviest)


def plinth_surface_top(surface, height):
    level = plinth_top_level(surface, height)
    band = SURFACE_BAND_RATIO * height
    heights = [
        vertex.co.z
        for face in surface.faces
        if face.normal.z >= UPWARD_NORMAL and abs(face.calc_center_median().z - level) <= band
        for vertex in face.verts
    ]
    return float(numpy.percentile(heights, SURFACE_PERCENTILE)) if heights else level


def cut_below(surface, level):
    geometry = list(surface.verts) + list(surface.edges) + list(surface.faces)
    bmesh.ops.bisect_plane(
        surface,
        geom=geometry,
        plane_co=Vector((0, 0, level)),
        plane_no=Vector((0, 0, 1)),
        clear_inner=True,
    )


def flatten_section(surface, level):
    section = [edge for edge in surface.edges if edge.is_boundary]
    for vertex in {vertex for edge in section for vertex in edge.verts}:
        vertex.co.z = level
    return section


def chain_loops(section):
    remaining = set(section)
    loops = []
    while remaining:
        edge = remaining.pop()
        start, current = edge.verts
        loop = [start, current]
        while current is not start:
            following = next((link for link in current.link_edges if link in remaining), None)
            if following is None:
                break
            remaining.discard(following)
            current = following.other_vert(current)
            if current is not start:
                loop.append(current)
        loops.append(loop)
    return loops


def cap_loop(surface, loop):
    coordinates = [vertex.co.copy() for vertex in loop]
    for indices in tessellate_polygon([coordinates]):
        corners = [loop[index] for index in indices]
        if len({id(corner) for corner in corners}) < 3 or surface.faces.get(corners):
            continue
        normal = (corners[1].co - corners[0].co).cross(corners[2].co - corners[0].co)
        surface.faces.new(corners if normal.z <= 0 else corners[::-1])


def seat_on_origin(surface, anchors, level):
    centre_x = (min(point.x for point in anchors) + max(point.x for point in anchors)) / 2
    centre_y = (min(point.y for point in anchors) + max(point.y for point in anchors)) / 2
    bmesh.ops.transform(surface, matrix=Matrix.Translation(Vector((-centre_x, -centre_y, -level))), verts=surface.verts)


def flatten_contact_band(surface):
    floor = min(vertex.co.z for vertex in surface.verts)
    height = max(vertex.co.z for vertex in surface.verts) - floor
    band = [vertex for vertex in surface.verts if vertex.co.z <= floor + CONTACT_BAND_RATIO * height]
    for vertex in band:
        vertex.co.z = floor
    return [vertex.co.copy() for vertex in band], floor


def cut_below_plinth(surface, margin_ratio):
    floor = min(vertex.co.z for vertex in surface.verts)
    height = max(vertex.co.z for vertex in surface.verts) - floor
    level = plinth_surface_top(surface, height) + margin_ratio * height
    cut_below(surface, level)
    removed_islands, _ = remove_disconnected_islands(surface)
    loops = chain_loops(flatten_section(surface, level))
    for loop in loops:
        cap_loop(surface, loop)
    return loops, [vertex.co.copy() for loop in loops for vertex in loop], level, removed_islands


def cut_figure_base(surface, margin_ratio):
    removed_islands, separate_plinth = remove_disconnected_islands(surface)
    if separate_plinth:
        loops = []
        anchors, level = flatten_contact_band(surface)
    else:
        loops, anchors, level, plinth_removed = cut_below_plinth(surface, margin_ratio)
        removed_islands += plinth_removed
        post_removed, _ = remove_disconnected_islands(surface)
        removed_islands += post_removed
    seat_on_origin(surface, anchors, level)
    bmesh.ops.recalc_face_normals(surface, faces=surface.faces)
    surface.normal_update()
    xs = [vertex.co.x for vertex in surface.verts]
    ys = [vertex.co.y for vertex in surface.verts]
    return {"removed_islands": removed_islands, "loops": len(loops), "width": max(xs) - min(xs), "length": max(ys) - min(ys)}
