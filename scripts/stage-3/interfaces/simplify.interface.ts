import type { BlenderConfig } from '../../common/interfaces/index.js';

export interface SimplifyBlenderConfig extends BlenderConfig {
  readonly script: string;
}

export interface SimplifyStepDefinition {
  readonly id: string;
  readonly stage_dir: string;
  readonly blender: SimplifyBlenderConfig;
  readonly inputs: {
    readonly stage_dir: string;
    readonly model_resource: string;
    readonly model_pick_resource_pattern: string;
  };
  readonly outputs: {
    readonly points_resource: string;
    readonly mesh_resource: string;
    readonly mesh_public: string;
    readonly manifest: string;
  };
  readonly parameters: {
    readonly target_faces: number;
    readonly weld_distance_ratio: number;
    readonly contact_height_ratio: number;
    readonly quad_face_angle_deg: number;
    readonly quad_shape_angle_deg: number;
    readonly face_max_extent_ratio: number;
  };
  readonly messages: {
    readonly start: string;
    readonly completed: string;
  };
  readonly manifest_contract: {
    readonly status: string;
    readonly costNote: string;
  };
}

export interface SimplifyStatistics {
  readonly lengthMm: number;
  readonly faces: number;
  readonly points: number;
  readonly meshFaces: number;
  readonly quads: number;
  readonly openEdges: number;
  readonly nonManifoldEdges: number;
  readonly airtight: boolean;
  readonly volumeChangePercent: number;
  readonly maxDeviationMm: number;
  readonly featureLossMm: number;
  readonly mode: string;
  readonly alignedAreaRatio: number;
}

export interface SimplifyResponse {
  readonly name: string;
  readonly meshPath: string;
  readonly pointsPath: string;
  readonly seconds: number;
}
