import http, { IncomingMessage, ServerResponse } from 'node:http';
import { CatalogueManager } from './common/catalogue-manager.js';
import { PipelineConfigLoader } from './common/pipeline-config.js';
import { ProgressHub } from './common/progress-hub.js';
import { CreatorService } from './server/creator-service.js';
import type {
  CreatorGeneratePayload,
  CreatorPickPayload,
} from './server/creator-service.interface.js';

export class CreatorApiServer {
  private readonly port: number;

  constructor(port = 4502) {
    this.port = port;
  }

  private setCors(res: ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
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
        if (body.length > 100 * 1024 * 1024) {
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

  private streamProgress(req: IncomingMessage, res: ServerResponse, model: string): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(': connected\n\n');
    const unsubscribe = ProgressHub.subscribe(model, (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });
    req.on('close', unsubscribe);
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

      if (['GET', 'HEAD'].includes(req.method ?? '') && url.pathname === '/api/creator/sheet') {
        const name = url.searchParams.get('name');
        if (!name) {
          this.sendJson(res, 400, { error: 'Name is required' });
          return;
        }

        const sheet = CreatorService.getSheet(name);
        if (!sheet) {
          this.sendJson(res, 404, { error: 'Alternatives sheet not found' });
          return;
        }

        this.setCors(res);
        res.writeHead(200, {
          'Content-Type': sheet.mime,
          'Content-Length': sheet.bytes.length,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        });
        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        res.end(sheet.bytes);
        return;
      }

      if (['GET', 'HEAD'].includes(req.method ?? '') && url.pathname === '/api/creator/info') {
        const name = url.searchParams.get('name');
        if (!name) {
          this.sendJson(res, 400, { error: 'Name is required' });
          return;
        }

        const info = CreatorService.getModelInfo(name);
        if (req.method === 'HEAD') {
          this.setCors(res);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end();
          return;
        }
        this.sendJson(res, 200, info);
        return;
      }

      if (
        ['POST', 'GET'].includes(req.method ?? '') &&
        ['/api/catalogue/sync', '/api/creator/sync'].includes(url.pathname)
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

          const cleanName = CreatorService.deleteModel(body.name);
          this.sendJson(res, 200, { success: true, name: cleanName });
        } catch (err) {
          this.sendJson(res, 500, { error: (err as Error).message });
        }
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/creator/progress') {
        this.streamProgress(req, res, CreatorService.cleanModelName(url.searchParams.get('name') ?? ''));
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/creator/generate') {
        try {
          const body = await this.parseBody<CreatorGeneratePayload>(req);
          if (!body.name) {
            this.sendJson(res, 400, { error: 'Name is required' });
            return;
          }
          if (!body.prompt) {
            this.sendJson(res, 400, { error: 'Prompt is required' });
            return;
          }

          const result = await CreatorService.generateAlternatives(body.name, body.prompt, body.images);
          this.sendJson(res, 200, { success: true, ...result });
        } catch (err) {
          this.sendJson(res, 500, { error: (err as Error).message });
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/creator/pick') {
        try {
          const body = await this.parseBody<CreatorPickPayload>(req);
          if (!body.name) {
            this.sendJson(res, 400, { error: 'Name is required' });
            return;
          }
          if (!body.pick) {
            this.sendJson(res, 400, { error: 'Pick is required' });
            return;
          }

          const cleanName = CreatorService.cleanModelName(body.name);
          const pick = Number(body.pick);
          const { cropResult, trellisResult } = await CreatorService.buildModel(cleanName, pick);

          const step3 = PipelineConfigLoader.getStep('s2-step-2');
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
      console.log(`Papikapi Studio API server listening on http://localhost:${this.port}`);
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
