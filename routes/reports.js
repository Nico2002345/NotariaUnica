const express = require('express');
const { getQuery, allQuery } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

router.get('/stats', (req, res) => {
  const total = (getQuery('SELECT COUNT(*) as count FROM documents', []) || { count: 0 }).count;
  const todayCount = (getQuery("SELECT COUNT(*) as count FROM documents WHERE DATE(created_at) = DATE('now', 'localtime')", []) || { count: 0 }).count;
  const pending = (getQuery("SELECT COUNT(*) as count FROM documents WHERE status = 'pendiente'", []) || { count: 0 }).count;
  const completed = (getQuery("SELECT COUNT(*) as count FROM documents WHERE status = 'completado'", []) || { count: 0 }).count;
  const inProcess = (getQuery("SELECT COUNT(*) as count FROM documents WHERE status = 'en_proceso'", []) || { count: 0 }).count;
  const archived = (getQuery("SELECT COUNT(*) as count FROM documents WHERE status = 'archivado'", []) || { count: 0 }).count;

  const byType = allQuery(`
    SELECT dt.name, dt.code, dt.icon, COUNT(d.id) as count
    FROM document_types dt LEFT JOIN documents d ON dt.id = d.type_id
    WHERE dt.is_active = 1 GROUP BY dt.id ORDER BY count DESC
  `, []);

  const byStatus = allQuery('SELECT status, COUNT(*) as count FROM documents GROUP BY status', []);

  const recentDocs = allQuery(`
    SELECT d.id, d.title, d.status, d.created_at, dt.name as type_name, dt.icon, u.full_name as created_by_name
    FROM documents d
    JOIN document_types dt ON d.type_id = dt.id
    JOIN users u ON d.created_by = u.id
    ORDER BY d.created_at DESC LIMIT 10
  `, []);

  res.json({ total, todayCount, pending, completed, inProcess, archived, byType, byStatus, recentDocs });
});

router.get('/by-day', (req, res) => {
  const days = Math.min(parseInt(req.query.days) || 30, 365);
  const data = allQuery(`
    SELECT DATE(created_at, 'localtime') as date, COUNT(*) as count
    FROM documents
    WHERE DATE(created_at, 'localtime') >= DATE('now', 'localtime', '-${days} days')
    GROUP BY DATE(created_at, 'localtime') ORDER BY date ASC
  `, []);
  res.json(data);
});

router.get('/by-week', (req, res) => {
  const data = allQuery(`
    SELECT strftime('%Y-W%W', created_at, 'localtime') as week, COUNT(*) as count
    FROM documents
    WHERE DATE(created_at, 'localtime') >= DATE('now', 'localtime', '-84 days')
    GROUP BY strftime('%Y-W%W', created_at, 'localtime') ORDER BY week ASC
  `, []);
  res.json(data);
});

router.get('/by-month', (req, res) => {
  const data = allQuery(`
    SELECT strftime('%Y-%m', created_at, 'localtime') as month, COUNT(*) as count
    FROM documents
    WHERE DATE(created_at, 'localtime') >= DATE('now', 'localtime', '-365 days')
    GROUP BY strftime('%Y-%m', created_at, 'localtime') ORDER BY month ASC
  `, []);
  res.json(data);
});

router.get('/by-year', (req, res) => {
  const data = allQuery(`
    SELECT strftime('%Y', created_at, 'localtime') as year, COUNT(*) as count
    FROM documents GROUP BY strftime('%Y', created_at, 'localtime') ORDER BY year ASC
  `, []);
  res.json(data);
});

router.get('/range', (req, res) => {
  const { from, to, type_id } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'Fechas from y to requeridas' });

  let where = "WHERE DATE(d.created_at, 'localtime') BETWEEN ? AND ?";
  const params = [from, to];
  if (type_id) { where += ' AND d.type_id = ?'; params.push(parseInt(type_id)); }

  const documents = allQuery(`
    SELECT d.id, d.title, d.status, d.created_at, dt.name as type_name, u.full_name as created_by_name
    FROM documents d JOIN document_types dt ON d.type_id = dt.id JOIN users u ON d.created_by = u.id
    ${where} ORDER BY d.created_at DESC
  `, params);

  const summary = allQuery(`
    SELECT dt.name as type_name, dt.icon, COUNT(d.id) as count
    FROM documents d JOIN document_types dt ON d.type_id = dt.id
    ${where} GROUP BY dt.id ORDER BY count DESC
  `, params);

  const byStatus = allQuery(`
    SELECT d.status, COUNT(*) as count FROM documents d ${where} GROUP BY d.status
  `, params);

  res.json({ documents, summary, byStatus, total: documents.length, from, to });
});

module.exports = router;
