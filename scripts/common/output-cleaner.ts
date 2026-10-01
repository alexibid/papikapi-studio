import { existsSync, unlinkSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { PipelineStep } from './interfaces/index.js';
import { WorkspacePaths } from './workspace-paths.js';

export class OutputCleaner {
  public static clean(model: string, step: PipelineStep): void {
    const resourceDir = WorkspacePaths.resourcePath(model);
    const publicDir = WorkspacePaths.modelPath(model);
    const stageDir = join(resourceDir, step.stage_dir);
    const cleaned: string[] = [];

    if (step.id === 's1-step-1') {
      const stepOutputs = step.outputs as unknown as { allowed_extensions: string[]; sheet_resource: string; sheet_public: string; manifest: string };
      for (const ext of stepOutputs.allowed_extensions) {
        const resBase = stepOutputs.sheet_resource.replace(/\.[^/.]+$/, '');
        const resAlt = join(stageDir, `${resBase}${ext}`);
        if (existsSync(resAlt)) {
          unlinkSync(resAlt);
          cleaned.push(basename(resAlt));
        }
        const pubBase = stepOutputs.sheet_public.replace(/\.[^/.]+$/, '');
        const pubAlt = join(publicDir, `${pubBase}${ext}`);
        if (existsSync(pubAlt)) {
          unlinkSync(pubAlt);
          cleaned.push(`public/${basename(pubAlt)}`);
        }
      }
      const manifest = join(stageDir, stepOutputs.manifest);
      if (existsSync(manifest)) {
        unlinkSync(manifest);
        cleaned.push(basename(manifest));
      }
    } else if (step.id === 's1-step-2') {
      const stepOutputs = step.outputs as unknown as { allowed_extensions: string[]; art_resource: string; art_public: string; manifest: string };
      for (const ext of stepOutputs.allowed_extensions) {
        const resBase = stepOutputs.art_resource.replace(/\.[^/.]+$/, '');
        const resArt = join(stageDir, `${resBase}${ext}`);
        if (existsSync(resArt)) {
          unlinkSync(resArt);
          cleaned.push(basename(resArt));
        }
        const pubBase = stepOutputs.art_public.replace(/\.[^/.]+$/, '');
        const pubArt = join(publicDir, `${pubBase}${ext}`);
        if (existsSync(pubArt)) {
          unlinkSync(pubArt);
          cleaned.push(`public/${basename(pubArt)}`);
        }
      }
      const manifest = join(stageDir, stepOutputs.manifest);
      if (existsSync(manifest)) {
        unlinkSync(manifest);
        cleaned.push(basename(manifest));
      }
    } else if (step.id === 's2-step-1') {
      const stepOutputs = step.outputs as { cutout_resource: string; cutout_public: string; manifest: string };
      const resCutout = join(stageDir, stepOutputs.cutout_resource);
      if (existsSync(resCutout)) {
        unlinkSync(resCutout);
        cleaned.push(basename(resCutout));
      }
      const pubCutout = join(publicDir, stepOutputs.cutout_public);
      if (existsSync(pubCutout)) {
        unlinkSync(pubCutout);
        cleaned.push(`public/${basename(pubCutout)}`);
      }
      const manifest = join(stageDir, stepOutputs.manifest);
      if (existsSync(manifest)) {
        unlinkSync(manifest);
        cleaned.push(basename(manifest));
      }
    } else if (step.id === 's2-step-2') {
      const stepOutputs = step.outputs as { model_resource: string; model_public: string; manifest: string };
      const resModel = join(stageDir, stepOutputs.model_resource);
      if (existsSync(resModel)) {
        unlinkSync(resModel);
        cleaned.push(basename(resModel));
      }
      const pubModel = join(publicDir, stepOutputs.model_public);
      if (existsSync(pubModel)) {
        unlinkSync(pubModel);
        cleaned.push(`public/${basename(pubModel)}`);
      }
      const manifest = join(stageDir, stepOutputs.manifest);
      if (existsSync(manifest)) {
        unlinkSync(manifest);
        cleaned.push(basename(manifest));
      }
    } else if (step.id === 's2-step-3') {
      const stepOutputs = step.outputs as { model_resource: string; manifest: string };
      for (const name of [stepOutputs.model_resource, stepOutputs.manifest]) {
        const target = join(stageDir, name);
        if (existsSync(target)) {
          unlinkSync(target);
          cleaned.push(basename(target));
        }
      }
    } else if (step.id === 's2-step-4') {
      const stepOutputs = step.outputs as { points_resource: string; mesh_resource: string; mesh_public?: string; manifest: string };
      for (const name of [stepOutputs.points_resource, stepOutputs.mesh_resource, stepOutputs.manifest]) {
        const target = join(stageDir, name);
        if (existsSync(target)) {
          unlinkSync(target);
          cleaned.push(basename(target));
        }
      }
      if (stepOutputs.mesh_public) {
        const pubMesh = join(publicDir, stepOutputs.mesh_public);
        if (existsSync(pubMesh)) {
          unlinkSync(pubMesh);
          cleaned.push(`public/${basename(pubMesh)}`);
        }
      }
    } else if (step.id === 's2-step-5') {
      const stepOutputs = step.outputs as { model_resource: string; model_public?: string; manifest: string };
      for (const name of [stepOutputs.model_resource, stepOutputs.manifest]) {
        const target = join(stageDir, name);
        if (existsSync(target)) {
          unlinkSync(target);
          cleaned.push(basename(target));
        }
      }
      if (stepOutputs.model_public) {
        const pubModel = join(publicDir, stepOutputs.model_public);
        if (existsSync(pubModel)) {
          unlinkSync(pubModel);
          cleaned.push(`public/${basename(pubModel)}`);
        }
      }
    } else if (step.id === 's2-step-6') {
      const stepOutputs = step.outputs as { model_resource: string; mesh_resource: string; model_public: string; manifest: string };
      for (const name of [stepOutputs.model_resource, stepOutputs.mesh_resource, stepOutputs.manifest]) {
        const target = join(stageDir, name);
        if (existsSync(target)) {
          unlinkSync(target);
          cleaned.push(basename(target));
        }
      }
      const pubModel = join(publicDir, stepOutputs.model_public);
      if (existsSync(pubModel)) {
        unlinkSync(pubModel);
        cleaned.push(`public/${basename(pubModel)}`);
      }
    } else if (step.id === 's3-step-1') {
      const stepOutputs = step.outputs as { net_resource: string; manifest: string };
      const resUnfolded = join(stageDir, stepOutputs.net_resource);
      if (existsSync(resUnfolded)) {
        unlinkSync(resUnfolded);
        cleaned.push(basename(resUnfolded));
      }
      const manifest = join(stageDir, stepOutputs.manifest);
      if (existsSync(manifest)) {
        unlinkSync(manifest);
        cleaned.push(basename(manifest));
      }
    } else if (step.id === 's3-step-2') {
      const stepOutputs = step.outputs as { sheets_resource: string; sheets_public: string; manifest: string };
      const resSheets = join(stageDir, stepOutputs.sheets_resource);
      if (existsSync(resSheets)) {
        unlinkSync(resSheets);
        cleaned.push(basename(resSheets));
      }
      const pubSheets = join(publicDir, stepOutputs.sheets_public);
      if (existsSync(pubSheets)) {
        unlinkSync(pubSheets);
        cleaned.push(`public/${basename(pubSheets)}`);
      }
      const manifest = join(stageDir, stepOutputs.manifest);
      if (existsSync(manifest)) {
        unlinkSync(manifest);
        cleaned.push(basename(manifest));
      }
    }

    if (cleaned.length > 0) {
      console.log(`  \x1b[90m🧹 [Pre-Clean]\x1b[0m Purged ${cleaned.length} previous output file(s): ${cleaned.join(', ')}`);
    }
  }
}
