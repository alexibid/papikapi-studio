import bmesh
import numpy
from mathutils import Matrix, Vector
from mathutils.geometry import tessellate_polygon

from figure_parts import figure_and_strays

UPWARD_NORMAL = 0.95
SEARCH_HEIGHT_RATIO = 0.3
BIN_RATIO = 0.004
FALLBACK_LEVEL_RATIO = 0.04
SURFACE_BAND_RATIO = 0.015
SURFACE_PERCENTILE = 95
CONTACT_BAND_RATIO = 0.02
SECTION_TOLERANCE_RATIO = 1e-4
SEAL_ROUNDS = 6
SHEET_NORMAL = 0.9
SHEET_MIN_SHARE = 0.005


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


def remove_disconnected_islands(surface):
    components = sorted(connected_components(surface), key=len, reverse=True)
    total = [vertex.co.z for vertex in surface.verts]
    _, strays, separate_plinth = figure_and_strays(components, max(total) - min(total))
    stray_faces = [face for component in strays for face in component]
    if stray_faces:
        bmesh.ops.delete(surface, geom=stray_faces, context="FACES")
        bmesh.ops.delete(surface, geom=[vertex for vertex in surface.verts if not vertex.link_edges], context="VERTS")
    return len(strays), separate_plinth


def plinth_top_level(surface, height):
    xs = [vertex.co.x for vertex in surface.verts]
    ys = [vertex.co.y for vertex in surface.verts]
    footprint = (max(xs) - min(xs)) * (max(ys) - min(ys))

    bins = {}
    for face in surface.faces:
        level = face.calc_center_median().z
        if abs(face.normal.z) >= UPWARD_NORMAL and level <= SEARCH_HEIGHT_RATIO * height:
            bins.setdefault(round(level / (BIN_RATIO * height)), []).append((face.calc_area(), level))
    # A true 3D plinth slab covers a significant portion (>= 8%) of the footprint. Face orientation
    # is unreliable on open shells, so the slab top is the highest such level, not an upward normal.
    slabs = [entries for entries in bins.values() if sum(area for area, _ in entries) >= 0.08 * footprint]
    if not slabs:
        return 0.0
    top = max(slabs, key=lambda entries: sum(level for _, level in entries) / len(entries))
    return sum(level for _, level in top) / len(top)


def plinth_surface_top(surface, height):
    level = plinth_top_level(surface, height)
    if level <= 0.0:
        return min(vertex.co.z for vertex in surface.verts)
    band = SURFACE_BAND_RATIO * height
    heights = [
        vertex.co.z
        for face in surface.faces
        if abs(face.normal.z) >= UPWARD_NORMAL and abs(face.calc_center_median().z - level) <= band
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


def flatten_section(surface, level, height):
    tolerance = SECTION_TOLERANCE_RATIO * height
    section = [
        edge
        for edge in surface.edges
        if edge.is_boundary and all(abs(vertex.co.z - level) <= tolerance for vertex in edge.verts)
    ]
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


def seal_holes(surface, repair):
    for _ in range(SEAL_ROUNDS):
        loops = chain_loops([edge for edge in surface.edges if edge.is_boundary])
        if not loops:
            return
        for loop in loops:
            cap_loop(surface, loop)
        bmesh.ops.recalc_face_normals(surface, faces=surface.faces)
        repair(surface)


def seat_on_origin(surface, anchors, level):
    centre_x = (min(point.x for point in anchors) + max(point.x for point in anchors)) / 2
    centre_y = (min(point.y for point in anchors) + max(point.y for point in anchors)) / 2
    bmesh.ops.transform(surface, matrix=Matrix.Translation(Vector((-centre_x, -centre_y, -level))), verts=surface.verts)


def floor_faces(surface, floor, tolerance):
    return [face for face in surface.faces if all(vertex.co.z <= floor + tolerance for vertex in face.verts)]


def remove_ground_sheet(surface):
    """TRELLIS can lay a zero-thickness sheet under the feet besides its separate plinth; with no plinth to cut,
    the sheet stays and is printed as part of the figure. A solid figure never has a floor face looking up, so
    such faces mean a sheet: every face on the floor goes and the soles are capped again on the leg walls."""
    floor = min(vertex.co.z for vertex in surface.verts)
    height = max(vertex.co.z for vertex in surface.verts) - floor
    tolerance = SECTION_TOLERANCE_RATIO * height
    on_floor = floor_faces(surface, floor, tolerance)
    looking_up = sum(face.calc_area() for face in on_floor if face.normal.z >= SHEET_NORMAL)
    footprint = footprint_area(surface)
    if looking_up < SHEET_MIN_SHARE * footprint:
        return 0
    bmesh.ops.delete(surface, geom=on_floor, context="FACES")
    bmesh.ops.delete(surface, geom=[vertex for vertex in surface.verts if not vertex.link_faces], context="VERTS")
    section = [edge for edge in surface.edges
               if edge.is_boundary and all(vertex.co.z <= floor + tolerance for vertex in edge.verts)]
    for loop in chain_loops(section):
        cap_loop(surface, loop)
    return len(on_floor)


def footprint_area(surface):
    xs = [vertex.co.x for vertex in surface.verts]
    ys = [vertex.co.y for vertex in surface.verts]
    return (max(xs) - min(xs)) * (max(ys) - min(ys))


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
    plinth_level = plinth_surface_top(surface, height)
    level = plinth_level + margin_ratio * height
    cut_below(surface, level)
    removed_islands, _ = remove_disconnected_islands(surface)
    loops = chain_loops(flatten_section(surface, level, height))
    for loop in loops:
        cap_loop(surface, loop)
    return loops, [vertex.co.copy() for loop in loops for vertex in loop], level, removed_islands


def cut_figure_base(surface, margin_ratio):
    removed_islands, separate_plinth = remove_disconnected_islands(surface)
    floor = min(vertex.co.z for vertex in surface.verts)
    height = max(vertex.co.z for vertex in surface.verts) - floor
    plinth_level = plinth_surface_top(surface, height)
    has_plinth = plinth_level > floor + 1e-4

    if separate_plinth or not has_plinth:
        loops = []
        if remove_ground_sheet(surface):
            removed_islands += remove_disconnected_islands(surface)[0]
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
