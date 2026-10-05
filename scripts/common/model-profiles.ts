import { PipelineConfigLoader } from './pipeline-config.js';

export class ModelProfiles {
  public static stepParameters(modelName: string, stepId: string): Readonly<Record<string, unknown>> {
    const profiles = Object.values(PipelineConfigLoader.load().model_profiles ?? {});
    return profiles
      .filter((profile) => profile.models.includes(modelName))
      .reduce((merged, profile) => ({ ...merged, ...profile.step_parameters[stepId] }), {});
  }
}
