const fs = require('node:fs');
const path = require('node:path');

function getGeminiKey() {
  if (process.env.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY.trim();
  }

  const candidatePaths = [
    path.resolve(__dirname, '.env'),
    path.resolve(__dirname, '.env.local'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../.env.local'),
  ];

  for (const envPath of candidatePaths) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf8');
        const match = content.match(/^(?:GEMINI_API_KEY|API_KEY)\s*=\s*["']?([^"'\r\n]+)["']?/m);
        if (match && match[1]) {
          return match[1].trim();
        }
      } catch {}
    }
  }

  return '';
}

function syncLocalAsset(key) {
  try {
    const assetsDir = path.resolve(__dirname, 'src/assets');
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
    }
    fs.writeFileSync(
      path.resolve(assetsDir, 'env.local.json'),
      JSON.stringify({ geminiKey: key }, null, 2)
    );
  } catch {}
}

const key = getGeminiKey();
syncLocalAsset(key);

function readGalleryIndex() {
  const galleryPath = path.resolve(__dirname, 'uploads/gallery.json');
  if (fs.existsSync(galleryPath)) {
    try {
      const data = fs.readFileSync(galleryPath, 'utf8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }
  return [];
}

function writeGalleryIndex(items) {
  const uploadsDir = path.resolve(__dirname, 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  fs.writeFileSync(
    path.resolve(uploadsDir, 'gallery.json'),
    JSON.stringify(items, null, 2),
    'utf8'
  );
}

module.exports = {
  '/api/env': {
    target: 'http://localhost:4500',
    bypass: (_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ geminiKey: getGeminiKey() }));
      return false;
    },
  },
  '/api/gallery': {
    target: 'http://localhost:4500',
    bypass: (_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(readGalleryIndex()));
      return false;
    },
  },
  '/api/save-generation': {
    target: 'http://localhost:4500',
    bypass: (req, res) => {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.end(JSON.stringify({ error: 'Method Not Allowed' }));
        return false;
      }
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          const modelId = payload.id || `gen-${Date.now()}`;
          const targetDir = path.resolve(__dirname, 'uploads', modelId);
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }

          if (payload.model) {
            fs.writeFileSync(
              path.resolve(targetDir, 'model.json'),
              JSON.stringify(payload.model, null, 2),
              'utf8'
            );
          }
          if (payload.threeData) {
            fs.writeFileSync(
              path.resolve(targetDir, 'model-3d.json'),
              JSON.stringify(payload.threeData, null, 2),
              'utf8'
            );
          }
          if (payload.snapshotSvg) {
            fs.writeFileSync(
              path.resolve(targetDir, 'snapshot.svg'),
              payload.snapshotSvg,
              'utf8'
            );
          }
          if (payload.sheetColouredSvg) {
            fs.writeFileSync(
              path.resolve(targetDir, 'sheet-coloured.svg'),
              payload.sheetColouredSvg,
              'utf8'
            );
          }
          if (payload.sheetOutlineSvg) {
            fs.writeFileSync(
              path.resolve(targetDir, 'sheet-outline.svg'),
              payload.sheetOutlineSvg,
              'utf8'
            );
          }
          if (payload.metadata) {
            fs.writeFileSync(
              path.resolve(targetDir, 'metadata.json'),
              JSON.stringify(payload.metadata, null, 2),
              'utf8'
            );
          }

          const existing = readGalleryIndex();
          const itemSummary = {
            id: modelId,
            createdAt: Date.now(),
            prompt: payload.prompt || '',
            tierId: payload.tierId || 'tier-7-10',
            nameKey: payload.model?.nameKey || modelId,
            snapshotPath: `/uploads/${modelId}/snapshot.svg`,
            colouredSvgPath: `/uploads/${modelId}/sheet-coloured.svg`,
            outlineSvgPath: `/uploads/${modelId}/sheet-outline.svg`,
            modelPath: `/uploads/${modelId}/model.json`,
            threePath: `/uploads/${modelId}/model-3d.json`,
            model: payload.model,
          };

          const updated = [itemSummary, ...existing.filter((item) => item.id !== modelId)].slice(0, 50);
          writeGalleryIndex(updated);

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, item: itemSummary }));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return false;
    },
  },
};
