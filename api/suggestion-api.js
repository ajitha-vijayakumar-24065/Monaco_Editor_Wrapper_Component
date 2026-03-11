// ─────────────────────────────────────────────────────────────────────────────
// suggestion-api.js — Express REST API wrapping SuggestionGenerator.js
//
// Usage:
//   npm install express multer cors
//   node api/suggestion-api.js
//
// Endpoints:
//   GET  /health
//   POST /generate-suggestions          body: { text, language, options }
//   POST /generate-suggestions/upload   multipart file upload
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

var express  = require('express');
var multer   = require('multer');
var cors     = require('cors');
var path     = require('path');
var SuggestionGenerator = require('../src/SuggestionGenerator');

var app  = express();
var PORT = process.env.PORT || 3001;
var MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '512000', 10); // 500KB

// ── Middleware ─────────────────────────────────────────────────────────────

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept']
}));

app.use(express.json({ limit: '500kb' }));
app.use(express.urlencoded({ extended: false, limit: '500kb' }));

// Multer — in-memory storage, 500KB file size limit
var upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: function (req, file, cb) {
    var allowed = [
      '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
      '.json',
      '.css', '.scss', '.less',
      '.sql',
      '.yaml', '.yml', '.env',
      '.md', '.markdown', '.txt'
    ];
    var ext = path.extname(file.originalname).toLowerCase();
    if (allowed.indexOf(ext) !== -1) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type: ' + ext));
    }
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────

function parseOptions(raw) {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch (e) { return {}; }
  }
  return raw;
}

function buildResponse(suggestions, detectedLanguage) {
  return {
    suggestions: suggestions,
    count: suggestions.length,
    detectedLanguage: detectedLanguage
  };
}

// ── Routes ─────────────────────────────────────────────────────────────────

/**
 * GET /health
 * Simple health check.
 */
app.get('/health', function (req, res) {
  res.json({ status: 'ok', version: '1.0.0', maxFileSizeKB: Math.round(MAX_FILE_SIZE / 1024) });
});

/**
 * POST /generate-suggestions
 * Body JSON: { text: string, language?: string, options?: object }
 */
app.post('/generate-suggestions', function (req, res) {
  var text     = req.body && req.body.text;
  var language = req.body && req.body.language;
  var options  = parseOptions(req.body && req.body.options);

  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Request body must include a non-empty "text" field.' });
  }

  if (text.length > MAX_FILE_SIZE) {
    return res.status(413).json({ error: 'Text exceeds maximum size of ' + Math.round(MAX_FILE_SIZE / 1024) + 'KB.' });
  }

  if (language) options.language = language;

  var detectedLanguage = SuggestionGenerator.detectLanguage(options.filename || '', text);
  if (language) detectedLanguage = language;

  var suggestions;
  try {
    suggestions = SuggestionGenerator.fromText(text, options);
  } catch (e) {
    return res.status(422).json({ error: 'Parse error: ' + e.message });
  }

  res.set('Cache-Control', 'no-store');
  res.json(buildResponse(suggestions, detectedLanguage));
});

/**
 * POST /generate-suggestions/upload
 * Multipart form-data with a single "file" field.
 */
app.post('/generate-suggestions/upload', function (req, res, next) {
  upload.single('file')(req, res, function (uploadErr) {
    if (uploadErr) {
      if (uploadErr.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File exceeds maximum size of ' + Math.round(MAX_FILE_SIZE / 1024) + 'KB.' });
      }
      return res.status(400).json({ error: uploadErr.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Use the "file" field in multipart form-data.' });
    }

    var filename  = req.file.originalname;
    var text      = req.file.buffer.toString('utf8');
    var language  = req.body && req.body.language;
    var options   = parseOptions(req.body && req.body.options);

    options.filename = filename;
    if (language) options.language = language;

    // Detect language before calling fromText (so we can return it)
    var detectedLanguage = SuggestionGenerator.detectLanguage(filename, text);
    if (language) detectedLanguage = language;

    var suggestions;
    try {
      suggestions = SuggestionGenerator.fromText(text, options);
    } catch (e) {
      return res.status(422).json({ error: 'Parse error: ' + e.message });
    }

    res.set('Cache-Control', 'no-store');
    res.json(buildResponse(suggestions, detectedLanguage));
  });
});

// ── 404 + error handler ────────────────────────────────────────────────────

app.use(function (req, res) {
  res.status(404).json({ error: 'Not found: ' + req.method + ' ' + req.path });
});

app.use(function (err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error('[suggestion-api] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// ── Start ──────────────────────────────────────────────────────────────────

app.listen(PORT, function () {
  console.log('[suggestion-api] Listening on http://localhost:' + PORT);
  console.log('[suggestion-api] Max file size: ' + Math.round(MAX_FILE_SIZE / 1024) + 'KB');
});

module.exports = app; // for testing
