def assign_page_uv(mesh, layout):
    layer = mesh.uv_layers.new(name="PageUV")
    width = layout["pageWidthMm"]
    height = layout["pageHeightMm"]
    for face in layout["faces"]:
        polygon = mesh.polygons[face["id"]]
        polygon.material_index = face["page"]
        for loop_index, (x, y) in zip(polygon.loop_indices, face["points"]):
            layer.data[loop_index].uv = (x / width, y / height)
