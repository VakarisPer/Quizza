'use strict';

const http      = require('http');
const path      = require('path');
const fs        = require('fs');
const express   = require('express');
const multer    = require('multer');
const Config    = require('./config');
const log       = require('./logger');
const RoomStore = require('./roomStore');

// ── File upload setup ────────────────────────────────────────────────────────

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: Config.LIMITS.MAX_FILE_BYTES },
  fileFilter(_req, file, cb) {
    const allowed = /\.(txt|md|csv|json|pdf|doc|docx|xlsx|pptx|html|xml)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed.'));
    }
  },
});

let _markitdown;
async function getMarkItDown() {
  if (!_markitdown) {
    const { MarkItDown } = await import('markitdown-ts');
    _markitdown = new MarkItDown();
  }
  return _markitdown;
}

/**
 * HttpServer — Express-based server that serves static files from `web/`
 * and provides API endpoints. The underlying `http.Server` is also used
 * as the WebSocket upgrade target.
 */
class HttpServer {
  constructor() {
    const publicDir = path.join(__dirname, '..', 'web');
    const app = express();

    // Security headers
    app.use((_req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
      next();
    });

    // Static files
    app.use(express.static(publicDir));

    // ── API routes ───────────────────────────────────────────────────────────

    app.get('/api/stats', (_req, res) => {
      res.json({ activePlayers: RoomStore.pidToRoom.size });
    });

    app.post('/api/upload', upload.single('file'), async (req, res) => {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      const filePath = req.file.path;
      const ext = path.extname(req.file.originalname).toLowerCase();

      try {
        let text;
        if (['.txt', '.md', '.csv', '.json', '.xml'].includes(ext)) {
          text = fs.readFileSync(filePath, 'utf-8');
        } else {
          const mid = await getMarkItDown();
          const buf = fs.readFileSync(filePath);
          const result = await mid.convertBuffer(buf, { file_extension: ext });
          text = result?.markdown || result?.text_content || '';
        }
        fs.unlinkSync(filePath);
        res.json({ ok: true, text });
      } catch (err) {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        log.error('Upload', `Failed: ${err.message}`);
        res.status(500).json({ error: 'Could not read uploaded file' });
      }
    });

    /** The raw Node http.Server instance (passed to ws.Server). */
    this.server = http.createServer(app);
  }
}

module.exports = HttpServer;
