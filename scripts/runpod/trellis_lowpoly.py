import numpy as np
import open3d as o3d
import trimesh
from PIL import Image
from trellis.utils import postprocessing_utils
from trellis.utils.render_utils import render_multiview

GLB_AXIS_SWAP = np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]])
BAKE_RESOLUTION = 1024
BAKE_VIEWS = 100


def clean_dense_mesh(mesh, simplify):
    return postprocessing_utils.postprocess_mesh(
        mesh.vertices.cpu().numpy(),
        mesh.faces.cpu().numpy(),
        simplify=simplify > 0,
        simplify_ratio=simplify,
        fill_holes=True,
        fill_holes_max_hole_size=0.04,
        fill_holes_max_hole_nbe=int(250 * np.sqrt(1 - simplify)),
        fill_holes_resolution=1024,
        fill_holes_num_views=1000,
    )


def decimate_to_target(vertices, faces, target_faces):
    if target_faces <= 0 or len(faces) <= target_faces:
        return vertices, faces
    mesh = o3d.geometry.TriangleMesh(
        o3d.utility.Vector3dVector(vertices.astype(np.float64)),
        o3d.utility.Vector3iVector(faces.astype(np.int32)),
    )
    mesh = mesh.simplify_quadric_decimation(target_number_of_triangles=target_faces)
    mesh.remove_degenerate_triangles()
    mesh.remove_duplicated_triangles()
    mesh.remove_duplicated_vertices()
    mesh.remove_non_manifold_edges()
    mesh.remove_unreferenced_vertices()
    return np.asarray(mesh.vertices, dtype=np.float32), np.asarray(mesh.triangles, dtype=np.int32)


def bake_gaussian_texture(gaussian, vertices, faces, uvs, texture_size):
    observations, extrinsics, intrinsics = render_multiview(gaussian, resolution=BAKE_RESOLUTION, nviews=BAKE_VIEWS)
    masks = [np.any(observation > 0, axis=-1) for observation in observations]
    return postprocessing_utils.bake_texture(
        vertices, faces, uvs, observations, masks,
        [extrinsic.cpu().numpy() for extrinsic in extrinsics],
        [intrinsic.cpu().numpy() for intrinsic in intrinsics],
        texture_size=texture_size,
        mode='opt',
        lambda_tv=0.01,
    )


def to_glb(vertices, faces, uvs, texture):
    material = trimesh.visual.material.PBRMaterial(
        roughnessFactor=1.0,
        baseColorTexture=Image.fromarray(texture),
        baseColorFactor=np.array([255, 255, 255, 255], dtype=np.uint8),
    )
    return trimesh.Trimesh(
        vertices @ GLB_AXIS_SWAP,
        faces,
        visual=trimesh.visual.TextureVisuals(uv=uvs, material=material),
        process=False,
    )


def build_low_poly_glb(gaussian, mesh, simplify, target_faces, texture_size):
    vertices, faces = clean_dense_mesh(mesh, simplify)
    vertices, faces = decimate_to_target(vertices, faces, target_faces)
    vertices, faces, uvs = postprocessing_utils.parametrize_mesh(vertices, faces)
    texture = bake_gaussian_texture(gaussian, vertices, faces, uvs, texture_size)
    return to_glb(vertices, faces, uvs, texture)
