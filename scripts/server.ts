import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import http, { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { CatalogueManager } from './common/catalogue-manager.js';
import { GeminiClient } from './common/gemini-client.js';
import { PipelineConfigLoader } from './common/pipeline-config.js';
import { TrainingReferences } from './common/training-references.js';
import { WorkspacePaths } from './common/workspace-paths.js';
import type { InlineImage } from './common/interfaces/index.js';
import { AlternativesGenerator } from './stage-0/step-1-alternatives.js';
import { AlternativePicker } from './stage-0/step-2-pick.js';
import { TrellisGenerator } from './stage-1/step-1-trellis.js';

export class CreatorApiServer {
  private readonly port: number;

  constructor(port = 4502) {
    this.port = port;
  }

  private setCors(res: ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  private sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
    this.setCors(res);
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  private parseBody<T>(req: IncomingMessage): Promise<T> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 50 * 1024 * 1024) {
          req.destroy();
          reject(new Error('Payload too large'));
        }
      });
      req.on('end', () => {
        try {
          resolve(body ? (JSON.parse(body) as T) : ({} as T));
        } catch (err) {
          reject(err);
        }
      });
      req.on('error', reject);
    });
  }

  private dataUrlToImage(dataUrl: string): InlineImage {
    const match = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/.exec(dataUrl);
    if (!match) {
      const raw = Buffer.from(dataUrl, 'base64');
      return { bytes: raw, mime: 'image/jpeg' };
    }
    return {
      mime: match[1],
      bytes: Buffer.from(match[2], 'base64'),
    };
  }

  public start(): void {
    const server = http.createServer(async (req, res) => {
      this.setCors(res);
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const host = req.headers.host !== undefined ? req.headers.host : 'localhost';
      const url = new URL(req.url !== undefined ? req.url : '/', `http://${host}`);

      if (req.method === 'GET' && url.pathname === '/api/health') {
        this.sendJson(res, 200, { status: 'ok' });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/pipeline') {
        try {
          const config = PipelineConfigLoader.load();
          this.sendJson(res, 200, config);
        } catch (err) {
          this.sendJson(res, 500, { error: (err as Error).message });
        }
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/creator/sheet') {
        const name = url.searchParams.get('name');
        if (!name) {
          this.sendJson(res, 400, { error: 'Name is required' });
          return;
        }

        const cleanName = name.trim().toLowerCase().replace(/\s+/g, '-');
        const step1 = PipelineConfigLoader.getStep('s0-step-1');
        const stage0Dir = join(WorkspacePaths.resourcePath(cleanName), step1.stage_dir);
        const publicDir = WorkspacePaths.modelPath(cleanName);

        const candidates: string[] = [];
        for (const ext of step1.outputs.allowed_extensions) {
          const resBase = step1.outputs.sheet_resource.replace(/\.[^/.]+$/, '');
          candidates.push(join(stage0Dir, `${resBase}${ext}`));
          const pubBase = step1.outputs.sheet_public.replace(/\.[^/.]+$/, '');
          candidates.push(join(publicDir, `${pubBase}${ext}`));
        }

        const sheetPath = candidates.find((p) => existsSync(p));
        if (!sheetPath) {
          this.sendJson(res, 404, { error: 'Alternatives sheet not found' });
          return;
        }

        const bytes = readFileSync(sheetPath);
        const mime = GeminiClient.sniffMime(bytes);
        this.setCors(res);
        res.writeHead(200, {
          'Content-Type': mime,
          'Content-Length': bytes.length,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        });
        res.end(bytes);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/creator/info') {
        const name = url.searchParams.get('name');
        if (!name) {
          this.sendJson(res, 400, { error: 'Name is required' });
          return;
        }

        const cleanName = name.trim().toLowerCase().replace(/\s+/g, '-');
        const step1 = PipelineConfigLoader.getStep('s0-step-1');
        const step2 = PipelineConfigLoader.getStep('s0-step-2');
        const step3 = PipelineConfigLoader.getStep('s1-step-1');

        const stage0Dir = join(WorkspacePaths.resourcePath(cleanName), step1.stage_dir);
        const publicDir = WorkspacePaths.modelPath(cleanName);

        const candidates: string[] = [];
        for (const ext of step1.outputs.allowed_extensions) {
          const resBase = step1.outputs.sheet_resource.replace(/\.[^/.]+$/, '');
          candidates.push(join(stage0Dir, `${resBase}${ext}`));
          const pubBase = step1.outputs.sheet_public.replace(/\.[^/.]+$/, '');
          candidates.push(join(publicDir, `${pubBase}${ext}`));
        }
        const hasAlternatives = candidates.some((p) => existsSync(p));

        const cachedPicks: number[] = [];
        const alternativesCount = step1.parameters?.alternatives_count !== undefined ? Number(step1.parameters.alternatives_count) : 6;
        for (let p = 1; p <= alternativesCount; p++) {
          const pattern = step3.outputs.model_pick_public_pattern.replace('{pick}', String(p));
          const pubPickGlb = join(publicDir, pattern);
          if (existsSync(pubPickGlb) && statSync(pubPickGlb).size > 1000) {
            cachedPicks.push(p);
          }
        }

        let currentPick: number | null = null;
        const pubModel = join(publicDir, step3.outputs.model_public);
        const hasPubModel = existsSync(pubModel) && statSync(pubModel).size > 1000;

        const step2Manifest = join(stage0Dir, step2.outputs.manifest);
        if (existsSync(step2Manifest) && hasPubModel) {
          try {
            const parsed = JSON.parse(readFileSync(step2Manifest, 'utf-8'));
            if (parsed?.data?.chosenPick) {
              currentPick = Number(parsed.data.chosenPick);
              if (!cachedPicks.includes(currentPick)) {
                cachedPicks.push(currentPick);
              }
            }
          } catch {}
        }

        cachedPicks.sort((a, b) => a - b);

        this.sendJson(res, 200, {
          name: cleanName,
          hasAlternatives,
          sheetUrl: hasAlternatives ? `/api/creator/sheet?name=${cleanName}` : null,
          cachedPicks,
          currentPick,
        });
        return;
      }

      if (
        (['POST', 'GET'].includes(req.method ?? '')) &&
        (['/api/catalogue/sync', '/api/creator/sync'].includes(url.pathname))
      ) {
        const synced = CatalogueManager.sync();
        this.sendJson(res, 200, { success: true, count: synced.length, models: synced });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/creator/delete') {
        try {
          const body = await this.parseBody<{ name: string }>(req);
          if (!body.name) {
            this.sendJson(res, 400, { error: 'Name is required' });
            return;
          }

          const cleanName = body.name.trim().toLowerCase().replace(/\s+/g, '-');
          const resourceDir = WorkspacePaths.resourcePath(cleanName);
          const publicDir = WorkspacePaths.modelPath(cleanName);

          if (existsSync(resourceDir)) {
            rmSync(resourceDir, { recursive: true, force: true });
          }
          if (existsSync(publicDir)) {
            rmSync(publicDir, { recursive: true, force: true });
          }

          CatalogueManager.sync();
          this.sendJson(res, 200, { success: true, name: cleanName });
        } catch (err) {
          this.sendJson(res, 500, { error: (err as Error).message });
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/creator/generate') {
        try {
          const body = await this.parseBody<{ name: string; prompt: string; images?: string[] }>(req);
          if (!body.name) {
            this.sendJson(res, 400, { error: 'Name is required' });
            return;
          }
          if (!body.prompt) {
            this.sendJson(res, 400, { error: 'Prompt is required' });
            return;
          }

          const referenceImages = Array.isArray(body.images) && body.images.length > 0
            ? body.images.map((img) => this.dataUrlToImage(img))
            : [];

          const cleanName = body.name.trim().toLowerCase().replace(/\s+/g, '-');
          if (referenceImages.length === 0) {
            const matchByName = TrainingReferences.getInlineImage(cleanName);
            const trainingMatch = matchByName !== null ? matchByName : TrainingReferences.getInlineImage(body.prompt);
            if (trainingMatch) {
              referenceImages.push(trainingMatch.image);
            }
          }

          const result = await AlternativesGenerator.execute({
            name: cleanName,
            prompt: body.prompt,
            referenceImages,
          });

          this.sendJson(res, 200, { success: true, ...result });
        } catch (err) {
          this.sendJson(res, 500, { error: (err as Error).message });
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/creator/pick') {
        try {
          const body = await this.parseBody<{ name: string; pick: number }>(req);
          if (!body.name) {
            this.sendJson(res, 400, { error: 'Name is required' });
            return;
          }
          if (!body.pick) {
            this.sendJson(res, 400, { error: 'Pick is required' });
            return;
          }

          const cleanName = body.name.trim().toLowerCase().replace(/\s+/g, '-');
          const pick = Number(body.pick);
          const cropResult = await AlternativePicker.execute({
            name: cleanName,
            pick,
          });

          const trellisResult = await TrellisGenerator.execute(cleanName, pick);
          CatalogueManager.sync();

          const step3 = PipelineConfigLoader.getStep('s1-step-1');
          this.sendJson(res, 200, {
            success: true,
            name: cleanName,
            pick,
            cached: trellisResult.cached ?? false,
            artPath: cropResult.publicArtPath,
            modelPath: step3.outputs.public_url_pattern.replace('{model}', cleanName),
          });
        } catch (err) {
          this.sendJson(res, 500, { error: (err as Error).message });
        }
        return;
      }

      this.sendJson(res, 404, { error: 'Endpoint not found' });
    });

    server.listen(this.port, () => {
      CatalogueManager.sync();
      console.log(`Kirigami Studio API server listening on http://localhost:${this.port}`);
    });

    const shutdown = (): void => {
      server.close(() => {
        process.exit(0);
      });
      setTimeout(() => process.exit(0), 1000).unref();
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('SIGHUP', shutdown);
    process.on('disconnect', shutdown);

    if (!process.stdin.isTTY) {
      process.stdin.on('close', shutdown);
      process.stdin.resume();
    }

    const parentPid = process.ppid;
    const parentCheck = setInterval(() => {
      try {
        if (process.ppid !== parentPid) {
          clearInterval(parentCheck);
          shutdown();
        } else if (!process.kill(parentPid, 0)) {
          clearInterval(parentCheck);
          shutdown();
        }
      } catch {
        clearInterval(parentCheck);
        shutdown();
      }
    }, 2000);
    parentCheck.unref();
  }
}

if (process.argv[1] && process.argv[1].endsWith('server.ts')) {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 4502;
  new CreatorApiServer(port).start();
}
