from net_geometry import alignment, face_coordinates, fits_page, hull_area, polygons_overlap

MIN_FACES_FOR_COMPACTNESS = 3


class Piece:
    def __init__(self, face):
        self.placement = {face: face_coordinates(face)}

    def polygons(self):
        return [[positions[vertex] for vertex in face.verts] for face, positions in self.placement.items()]

    def points(self):
        return [point for positions in self.placement.values() for point in positions.values()]


def dihedral_priority(edge):
    first, second = edge.link_faces
    return (first.normal.angle(second.normal), -edge.calc_length())


def joined_placement(edge, host, guest):
    first, second = edge.verts
    host_face = next(face for face in edge.link_faces if face in host.placement)
    guest_face = next(face for face in edge.link_faces if face in guest.placement)
    host_positions, guest_positions = host.placement[host_face], guest.placement[guest_face]
    move = alignment(guest_positions[first], guest_positions[second], host_positions[first], host_positions[second])
    return {face: {vertex: move(point) for vertex, point in positions.items()} for face, positions in guest.placement.items()}


def compact_enough(host, guest, cloud, compactness):
    faces = list(host.placement) + list(guest.placement)
    if len(faces) <= MIN_FACES_FOR_COMPACTNESS:
        return True
    return sum(face.calc_area() for face in faces) >= compactness * hull_area(cloud)


def try_join(edge, host, guest, limits):
    moved = joined_placement(edge, host, guest)
    moved_polygons = [[positions[vertex] for vertex in face.verts] for face, positions in moved.items()]
    if polygons_overlap(moved_polygons, host.polygons()):
        return False
    cloud = host.points() + [point for positions in moved.values() for point in positions.values()]
    if not fits_page(cloud, *limits["page"]):
        return False
    if not compact_enough(host, guest, cloud, limits["compactness"]):
        return False
    host.placement.update(moved)
    return True


def unfold_pieces(mesh_builder, limits, faces=None):
    target_faces = list(faces) if faces is not None else list(mesh_builder.faces)
    target_set = set(target_faces)
    piece_of = {face: Piece(face) for face in target_faces}
    joinable = [edge for edge in mesh_builder.edges if len(edge.link_faces) == 2 and all(face in target_set for face in edge.link_faces)]
    for edge in sorted(joinable, key=dihedral_priority):
        host, guest = (piece_of[face] for face in edge.link_faces)
        if host is guest:
            continue
        if len(guest.placement) > len(host.placement):
            host, guest = guest, host
        if try_join(edge, host, guest, limits):
            for face in guest.placement:
                piece_of[face] = host
    unique = {id(piece): piece for piece in piece_of.values()}
    return list(unique.values())
