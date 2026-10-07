import type { BlenderConfig } from '../../common/interfaces/index.js';

export interface BaseBlenderConfig extends BlenderConfig {
  readonly script: string;
  readonly views_script?: string;
}

export interface BaseParameters {
  readonly weld_distance_ratio: number;
  readonly contact_height_ratio: number;
  readonly target_size_mm: number;
  readonly min_feature_mm: number;
  readonly appendage_min_length_mm: number;
  readonly appendage_max_section_mm: number;
  readonly appendage_min_aspect: number;
  readonly appendage_max_passes: number;
  readonly appendage_crease_deg: number;
  readonly appendage_root_section_mm: number;
  readonly appendage_max_rings: number;
  readonly envelope_cell_mm: number;
  readonly envelope_tolerance_mm: number;
  readonly envelope_max_area_ratio: number;
  readonly appendage_ground_clearance_mm: number;
  readonly base_cut_margin_ratios: readonly number[];
}

export interface BaseStatistics {
  readonly faces: number;
  readonly openEdges: number;
  readonly nonManifoldEdges: number;
  readonly airtight: boolean;
  readonly removedIslands: number;
  readonly removedAppendages: number;
  readonly appendageFaces: number;
  readonly appendageVolumePercent: number;
  readonly loops: number;
  readonly widthMm: number;
  readonly lengthMm: number;
  readonly marginRatio: number;
}

export interface BaseStepDefinition {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly emoji: string;
  readonly expected_seconds: number;
  readonly script: string;
  readonly stage_dir: string;
  readonly depends_on: {
    readonly step_id: string;
    readonly stage_dir: string;
  };
  readonly blender: BaseBlenderConfig;
  readonly inputs: {
    readonly stage_dir: string;
    readonly model_resource: string;
    readonly model_pick_resource_pattern: string;
  };
  readonly outputs: {
    readonly stage_dir: string;
    readonly model_resource: string;
    readonly model_pick_resource_pattern: string;
    readonly views_dir?: string;
    readonly manifest: string;
  };
  readonly parameters: BaseParameters;
  readonly messages: {
    readonly start: string;
    readonly completed: string;
  };
  readonly manifest_contract: {
    readonly status: string;
    readonly costNote: string;
  };
}

export interface BaseResponse {
  readonly name: string;
  readonly modelPath: string;
  readonly seconds: number;
}
