const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
const { getQuery, allQuery, runQuery } = require('../database');
const { authenticateToken } = require('../middleware/auth');

async function imageToPdfBuffer(imageBuffer, mimeType) {
  // pdf-lib reads image.buffer directly without honoring byteOffset, so a
  // pooled Node Buffer (nonzero byteOffset) gets misread as corrupt data.
  const cleanBytes = Uint8Array.from(imageBuffer);
  const pdfDoc = await PDFDocument.create();
  const image = mimeType === 'image/png' ? await pdfDoc.embedPng(cleanBytes) : await pdfDoc.embedJpg(cleanBytes);
  const page = pdfDoc.addPage([image.width, image.height]);
  page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  return Buffer.from(await pdfDoc.save());
}

const router = express.Router();
router.use(authenticateToken);

const uploadsDir = path.join(process.env.DATA_DIR || path.join(__dirname, '..'), 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, `doc-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Tipo de archivo no permitido'));
  }
});

router.get('/types', (req, res) => {
  const types = allQuery('SELECT * FROM document_types WHERE is_active = 1 ORDER BY name', []);
  res.json(types.map(t => ({ ...t, fields_template: JSON.parse(t.fields_template) })));
});

router.get('/', (req, res) => {
  const { type_id, status, search, created_by, limit = 50, offset = 0 } = req.query;
  let where = 'WHERE 1=1';
  const params = [];

  if (req.user.role !== 'admin') { where += ' AND d.created_by = ?'; params.push(req.user.id); }
  else if (created_by) { where += ' AND d.created_by = ?'; params.push(parseInt(created_by)); }
  if (type_id) { where += ' AND d.type_id = ?'; params.push(parseInt(type_id)); }
  if (status) { where += ' AND d.status = ?'; params.push(status); }
  if (search) { where += ' AND (d.title LIKE ? OR d.description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

  const documents = allQuery(`
    SELECT d.id, d.type_id, d.title, d.description, d.status, d.fields_data,
           d.created_by, d.created_at, d.updated_at,
           dt.name as type_name, dt.code as type_code, dt.icon,
           u.full_name as created_by_name
    FROM documents d
    JOIN document_types dt ON d.type_id = dt.id
    JOIN users u ON d.created_by = u.id
    ${where} ORDER BY d.created_at DESC LIMIT ? OFFSET ?
  `, [...params, parseInt(limit), parseInt(offset)]);

  const countRow = getQuery(`SELECT COUNT(*) as count FROM documents d ${where}`, params);
  const total = countRow ? countRow.count : 0;

  res.json({
    documents: documents.map(d => ({ ...d, fields_data: JSON.parse(d.fields_data || '{}') })),
    total
  });
});

router.get('/:id', (req, res) => {
  const doc = getQuery(`
    SELECT d.*, dt.name as type_name, dt.code as type_code, dt.icon, dt.fields_template,
           u.full_name as created_by_name
    FROM documents d
    JOIN document_types dt ON d.type_id = dt.id
    JOIN users u ON d.created_by = u.id
    WHERE d.id = ?
  `, [parseInt(req.params.id)]);

  if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
  if (req.user.role !== 'admin' && doc.created_by !== req.user.id) {
    return res.status(403).json({ error: 'No tiene acceso a este documento' });
  }

  const files = allQuery('SELECT * FROM document_files WHERE document_id = ? ORDER BY created_at DESC', [doc.id]);
  res.json({
    ...doc,
    fields_data: JSON.parse(doc.fields_data || '{}'),
    fields_template: JSON.parse(doc.fields_template || '[]'),
    files
  });
});

router.post('/', (req, res) => {
  const { type_id, title, description, status, fields_data } = req.body;
  if (!type_id || !title) return res.status(400).json({ error: 'Tipo y título requeridos' });

  const result = runQuery(
    'INSERT INTO documents (type_id, title, description, status, fields_data, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    [parseInt(type_id), title, description || null, status || 'pendiente', JSON.stringify(fields_data || {}), req.user.id]
  );

  const doc = getQuery('SELECT * FROM documents WHERE id = ?', [result.lastID]);
  res.status(201).json({ ...doc, fields_data: JSON.parse(doc.fields_data) });
});

router.put('/:id', (req, res) => {
  const { title, description, status, fields_data } = req.body;
  const doc = getQuery('SELECT * FROM documents WHERE id = ?', [parseInt(req.params.id)]);
  if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
  if (req.user.role !== 'admin' && doc.created_by !== req.user.id) {
    return res.status(403).json({ error: 'No tiene acceso a este documento' });
  }

  runQuery(
    'UPDATE documents SET title = ?, description = ?, status = ?, fields_data = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [
      title || doc.title,
      description !== undefined ? description : doc.description,
      status || doc.status,
      JSON.stringify(fields_data || JSON.parse(doc.fields_data)),
      req.user.id,
      parseInt(req.params.id)
    ]
  );

  const updated = getQuery('SELECT * FROM documents WHERE id = ?', [parseInt(req.params.id)]);
  res.json({ ...updated, fields_data: JSON.parse(updated.fields_data) });
});

router.delete('/:id', (req, res) => {
  const doc = getQuery('SELECT * FROM documents WHERE id = ?', [parseInt(req.params.id)]);
  if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
  if (req.user.role !== 'admin' && doc.created_by !== req.user.id) {
    return res.status(403).json({ error: 'No tiene acceso a este documento' });
  }

  const files = allQuery('SELECT * FROM document_files WHERE document_id = ?', [parseInt(req.params.id)]);
  files.forEach(f => {
    const fp = path.join(process.env.DATA_DIR || path.join(__dirname, '..'), f.file_path);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  });
  runQuery('DELETE FROM document_files WHERE document_id = ?', [parseInt(req.params.id)]);
  runQuery('DELETE FROM documents WHERE id = ?', [parseInt(req.params.id)]);
  res.json({ message: 'Documento eliminado' });
});

router.post('/:id/files', upload.array('files', 10), async (req, res) => {
  const docId = parseInt(req.params.id);
  const doc = getQuery('SELECT id, created_by FROM documents WHERE id = ?', [docId]);
  if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
  if (req.user.role !== 'admin' && doc.created_by !== req.user.id) {
    return res.status(403).json({ error: 'No tiene acceso a este documento' });
  }

  const isScanned = req.body.is_scanned === 'true' ? 1 : 0;
  const toPdf = req.body.to_pdf === 'true';

  try {
    const savedFiles = [];
    for (const f of req.files) {
      let relativePath = `uploads/${f.filename}`;
      let fileName = f.filename;
      let fileType = f.mimetype;
      let fileSize = f.size;
      let originalName = f.originalname;

      if (toPdf && (f.mimetype === 'image/jpeg' || f.mimetype === 'image/jpg' || f.mimetype === 'image/png')) {
        const imgPath = path.join(uploadsDir, f.filename);
        const pdfBuffer = await imageToPdfBuffer(fs.readFileSync(imgPath), f.mimetype);
        const pdfFilename = f.filename.replace(/\.[^.]+$/, '.pdf');
        fs.writeFileSync(path.join(uploadsDir, pdfFilename), pdfBuffer);
        fs.unlinkSync(imgPath);
        relativePath = `uploads/${pdfFilename}`;
        fileName = pdfFilename;
        fileType = 'application/pdf';
        fileSize = pdfBuffer.length;
        originalName = originalName.replace(/\.[^.]+$/, '.pdf');
      }

      const result = runQuery(
        'INSERT INTO document_files (document_id, file_path, file_name, original_name, file_type, file_size, is_scanned, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [docId, relativePath, fileName, originalName, fileType, fileSize, isScanned, req.user.id]
      );
      savedFiles.push({ id: result.lastID, file_path: relativePath, file_name: fileName, original_name: originalName, file_type: fileType, file_size: fileSize, is_scanned: isScanned });
    }

    res.json({ files: savedFiles });
  } catch (err) {
    res.status(500).json({ error: 'Error al procesar el archivo. Verifique que la imagen no esté dañada.' });
  }
});

router.post('/:id/scan', async (req, res) => {
  const { image_data, file_name, to_pdf } = req.body;
  if (!image_data) return res.status(400).json({ error: 'Datos de imagen requeridos' });

  const docId = parseInt(req.params.id);
  const doc = getQuery('SELECT id, created_by FROM documents WHERE id = ?', [docId]);
  if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
  if (req.user.role !== 'admin' && doc.created_by !== req.user.id) {
    return res.status(403).json({ error: 'No tiene acceso a este documento' });
  }

  const base64Data = image_data.replace(/^data:image\/\w+;base64,/, '');
  const imageBuffer = Buffer.from(base64Data, 'base64');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  let buffer, filename, fileType;
  try {
    if (to_pdf) {
      buffer = await imageToPdfBuffer(imageBuffer, 'image/jpeg');
      filename = `scan-${Date.now()}.pdf`;
      fileType = 'application/pdf';
    } else {
      buffer = imageBuffer;
      filename = `scan-${Date.now()}.jpg`;
      fileType = 'image/jpeg';
    }
  } catch (err) {
    return res.status(500).json({ error: 'Error al generar el PDF. Intente capturar la imagen nuevamente.' });
  }
  fs.writeFileSync(path.join(uploadsDir, filename), buffer);

  const relativePath = `uploads/${filename}`;
  const baseName = (file_name || filename).replace(/\.[^.]+$/, '');
  const displayName = `${baseName}.${to_pdf ? 'pdf' : 'jpg'}`;
  const result = runQuery(
    'INSERT INTO document_files (document_id, file_path, file_name, original_name, file_type, file_size, is_scanned, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
    [docId, relativePath, filename, displayName, fileType, buffer.length, req.user.id]
  );

  res.json({ id: result.lastID, file_path: relativePath, file_name: filename, file_type: fileType, is_scanned: 1 });
});

router.get('/:id/files/:fileId/download', (req, res) => {
  const file = getQuery('SELECT * FROM document_files WHERE id = ? AND document_id = ?',
    [parseInt(req.params.fileId), parseInt(req.params.id)]);
  if (!file) return res.status(404).json({ error: 'Archivo no encontrado' });

  const doc = getQuery('SELECT created_by FROM documents WHERE id = ?', [parseInt(req.params.id)]);
  if (!doc || (req.user.role !== 'admin' && doc.created_by !== req.user.id)) {
    return res.status(403).json({ error: 'No tiene acceso a este archivo' });
  }

  const fp = path.join(process.env.DATA_DIR || path.join(__dirname, '..'), file.file_path);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Archivo no encontrado en disco' });
  res.sendFile(fp);
});

router.delete('/:id/files/:fileId', (req, res) => {
  const file = getQuery('SELECT * FROM document_files WHERE id = ? AND document_id = ?',
    [parseInt(req.params.fileId), parseInt(req.params.id)]);
  if (!file) return res.status(404).json({ error: 'Archivo no encontrado' });

  const doc = getQuery('SELECT created_by FROM documents WHERE id = ?', [parseInt(req.params.id)]);
  if (doc && req.user.role !== 'admin' && doc.created_by !== req.user.id) {
    return res.status(403).json({ error: 'No tiene acceso a este documento' });
  }

  const fp = path.join(process.env.DATA_DIR || path.join(__dirname, '..'), file.file_path);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  runQuery('DELETE FROM document_files WHERE id = ?', [parseInt(req.params.fileId)]);
  res.json({ message: 'Archivo eliminado' });
});

module.exports = router;
