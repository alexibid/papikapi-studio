import type { BlenderConfig } from '../../common/interfaces/index.js';
import type { BookletSettings } from './booklet.interface.js';

export interface PapercraftBlenderConfig extends BlenderConfig {
  readonly unfold_script: string;
  readonly render_script: string;
  readonly texture_script: string;
}

export interface UnfoldStepDefinition {
  readonly id: string;
  readonly stage_dir: string;
  readonly blender: PapercraftBlenderConfig;
  readonly inputs: {
    readonly stage_dir: string;
    readonly model_resource: string;
  };
  readonly outputs: {
    readonly net_resource: string;
    readonly manifest: string;
  };
  readonly parameters: {
    readonly target_size_mm: number;
    readonly weld_distance_mm: number;
    readonly min_face_area_mm2: number;
    readonly flatten_iterations: number;
    readonly piece_max_width_mm: number;
    readonly piece_max_height_mm: number;
    readonly piece_compactness: number;
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

export interface SheetsStepDefinition {
  readonly id: string;
  readonly stage_dir: string;
  readonly depends_on: {
    readonly step_id: string;
    readonly stage_dir: string;
  };
  readonly blender: PapercraftBlenderConfig;
  readonly inputs: {
    readonly net_resource: string;
    readonly texture_stage_dir: string;
    readonly texture_model: string;
  };
  readonly outputs: {
    readonly sheets_resource: string;
    readonly renders_dir: string;
    readonly sheets_public: string;
    readonly public_url_pattern: string;
    readonly manifest: string;
  };
  readonly parameters: BookletSettings;
  readonly messages: {
    readonly start: string;
    readonly completed: string;
  };
  readonly manifest_contract: {
    readonly status: string;
    readonly costNote: string;
  };
}

export interface UnfoldStatistics {
  readonly faceCount: number;
  readonly quadCount: number;
  readonly vertexCount: number;
  readonly pieces: number;
  readonly smallestPieceFaces: number;
  readonly shortestCutMm: number;
  readonly unpairedEdges: number;
  readonly nonManifoldEdges: number;
  readonly dimensionsMm: readonly number[];
  readonly targetSizeMm: number;
}

export interface Stage3Response {
  readonly name: string;
  readonly outputPath: string;
  readonly seconds: number;
}
