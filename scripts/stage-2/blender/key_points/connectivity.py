def vertex_records(surface):
    surface.verts.index_update()
    return [
        {
            "id": vertex.index,
            "position": list(vertex.co),
            "neighbours": sorted(edge.other_vert(vertex).index for edge in vertex.link_edges),
        }
        for vertex in surface.verts
    ]


def face_records(surface):
    surface.verts.index_update()
    return [[vertex.index for vertex in face.verts] for face in surface.faces]
