import type { GlbMesh, GltfBufferView, GltfDocument, Triangle, Vertex } from './glb-mesh.js';

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BINARY_CHUNK = 0x004e4942;
const FLOAT_COMPONENT = 5126;
const UNSIGNED_INT_COMPONENT = 5125;
const UNSIGNED_SHORT_COMPONENT = 5123;
const ARRAY_BUFFER_TARGET = 34962;
const ELEMENT_ARRAY_BUFFER_TARGET = 34963;

export class GlbCodec {
  public static read(glb: Buffer): GlbMesh {
    if (glb.readUInt32LE(0) !== GLB_MAGIC) throw new Error('Input is not a binary glTF file');
    const jsonLength = glb.readUInt32LE(12);
    if (glb.readUInt32LE(16) !== JSON_CHUNK) throw new Error('First GLB chunk is not JSON');
    const document = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf-8')) as GltfDocument;
    const binaryStart = 20 + jsonLength;
    if (glb.readUInt32LE(binaryStart + 4) !== BINARY_CHUNK) throw new Error('Second GLB chunk is not binary');
    const binary = glb.subarray(binaryStart + 8);

    const primitive = this.singlePrimitive(document);
    const positions = this.readFloats(document, binary, primitive.attributes['POSITION'], 3);
    const uvs = this.readFloats(document, binary, primitive.attributes['TEXCOORD_0'], 2);
    const vertices: Vertex[] = [];
    for (let index = 0; index < positions.length / 3; index++) {
      vertices.push({
        x: positions[index * 3],
        y: positions[index * 3 + 1],
        z: positions[index * 3 + 2],
        u: uvs[index * 2],
        v: uvs[index * 2 + 1],
      });
    }

    const image = this.sliceView(binary, document.bufferViews[document.images[0].bufferView]);
    return { document, image, vertices, triangles: this.readTriangles(document, binary, primitive.indices) };
  }

  public static write(mesh: GlbMesh): Buffer {
    const indices = Buffer.alloc(mesh.triangles.length * 12);
    mesh.triangles.forEach((triangle, index) => {
      triangle.forEach((vertexIndex, corner) => indices.writeUInt32LE(vertexIndex, index * 12 + corner * 4));
    });
    const positions = Buffer.alloc(mesh.vertices.length * 12);
    const uvs = Buffer.alloc(mesh.vertices.length * 8);
    mesh.vertices.forEach((vertex, index) => {
      positions.writeFloatLE(vertex.x, index * 12);
      positions.writeFloatLE(vertex.y, index * 12 + 4);
      positions.writeFloatLE(vertex.z, index * 12 + 8);
      uvs.writeFloatLE(vertex.u, index * 8);
      uvs.writeFloatLE(vertex.v, index * 8 + 4);
    });

    const parts = [indices, positions, uvs, mesh.image].map((part) => this.padTo4(part));
    const document = this.rebuildDocument(mesh, parts.map((part) => part.length));
    return this.assemble(document, Buffer.concat(parts));
  }

  private static rebuildDocument(mesh: GlbMesh, lengths: readonly number[]): GltfDocument {
    const document = structuredClone(mesh.document);
    const targets = [ELEMENT_ARRAY_BUFFER_TARGET, ARRAY_BUFFER_TARGET, ARRAY_BUFFER_TARGET, undefined];
    let offset = 0;
    document.bufferViews = lengths.map((length, index) => {
      const view: GltfBufferView = { buffer: 0, byteOffset: offset, byteLength: length };
      if (targets[index] !== undefined) view.target = targets[index];
      offset += length;
      return view;
    });
    document.buffers = [{ byteLength: offset }];
    document.images[0].bufferView = 3;
    const bounds = this.positionBounds(mesh.vertices);
    document.accessors = [
      { bufferView: 0, componentType: UNSIGNED_INT_COMPONENT, count: mesh.triangles.length * 3, type: 'SCALAR' },
      { bufferView: 1, componentType: FLOAT_COMPONENT, count: mesh.vertices.length, type: 'VEC3', ...bounds },
      { bufferView: 2, componentType: FLOAT_COMPONENT, count: mesh.vertices.length, type: 'VEC2' },
    ];
    const primitive = this.singlePrimitive(document);
    primitive.attributes = { POSITION: 1, TEXCOORD_0: 2 };
    primitive.indices = 0;
    return document;
  }

  private static positionBounds(vertices: readonly Vertex[]): { min: number[]; max: number[] } {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const vertex of vertices) {
      [vertex.x, vertex.y, vertex.z].forEach((value, axis) => {
        min[axis] = Math.min(min[axis], value);
        max[axis] = Math.max(max[axis], value);
      });
    }
    return { min, max };
  }

  private static assemble(document: GltfDocument, binary: Buffer): Buffer {
    const jsonBytes = this.padTo4(Buffer.from(JSON.stringify(document), 'utf-8'), 0x20);
    const header = Buffer.alloc(12);
    header.writeUInt32LE(GLB_MAGIC, 0);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(12 + 8 + jsonBytes.length + 8 + binary.length, 8);
    const jsonHeader = Buffer.alloc(8);
    jsonHeader.writeUInt32LE(jsonBytes.length, 0);
    jsonHeader.writeUInt32LE(JSON_CHUNK, 4);
    const binaryHeader = Buffer.alloc(8);
    binaryHeader.writeUInt32LE(binary.length, 0);
    binaryHeader.writeUInt32LE(BINARY_CHUNK, 4);
    return Buffer.concat([header, jsonHeader, jsonBytes, binaryHeader, binary]);
  }

  private static padTo4(part: Buffer, fill = 0): Buffer {
    const padding = (4 - (part.length % 4)) % 4;
    return padding === 0 ? part : Buffer.concat([part, Buffer.alloc(padding, fill)]);
  }

  private static singlePrimitive(document: GltfDocument): GltfDocument['meshes'][number]['primitives'][number] {
    if (document.meshes.length !== 1 || document.meshes[0].primitives.length !== 1) {
      throw new Error('Expected a GLB with exactly one mesh and one primitive');
    }
    return document.meshes[0].primitives[0];
  }

  private static sliceView(binary: Buffer, view: GltfBufferView): Buffer {
    const start = view.byteOffset ?? 0;
    return binary.subarray(start, start + view.byteLength);
  }

  private static readFloats(document: GltfDocument, binary: Buffer, accessorIndex: number, width: number): number[] {
    const accessor = document.accessors[accessorIndex];
    const view = document.bufferViews[accessor.bufferView];
    const stride = view.byteStride ?? width * 4;
    const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const values: number[] = [];
    for (let index = 0; index < accessor.count; index++) {
      for (let component = 0; component < width; component++) {
        values.push(binary.readFloatLE(base + index * stride + component * 4));
      }
    }
    return values;
  }

  private static readTriangles(document: GltfDocument, binary: Buffer, accessorIndex: number): Triangle[] {
    const accessor = document.accessors[accessorIndex];
    const view = document.bufferViews[accessor.bufferView];
    const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const wide = accessor.componentType === UNSIGNED_INT_COMPONENT;
    if (!wide && accessor.componentType !== UNSIGNED_SHORT_COMPONENT) throw new Error('Unsupported index type');
    const size = wide ? 4 : 2;
    const read = (index: number): number => (wide ? binary.readUInt32LE(base + index * size) : binary.readUInt16LE(base + index * size));
    const triangles: Triangle[] = [];
    for (let index = 0; index < accessor.count; index += 3) {
      triangles.push([read(index), read(index + 1), read(index + 2)]);
    }
    return triangles;
  }
}
