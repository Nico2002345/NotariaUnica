const express = require('express');
const { getQuery, allQuery } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

router.get('/stats', (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const filterUserId = isAdmin ? (req.query.user_id ? parseInt(req.query.user_id) : null) : req.user.id;
  const ownerClause = filterUserId ? ' AND created_by = ?' : '';
  const ownerParams = filterUserId ? [filterUserId] : [];

  const total = (getQuery(`SELECT COUNT(*) as count FROM documents WHERE 1=1${ownerClause}`, ownerParams) || { count: 0 }).count;
  const todayCount = (getQuery(`SELECT COUNT(*) as count FROM documents WHERE DATE(created_at) = DATE('now', 'localtime')${ownerClause}`, ownerParams) || { count: 0 }).count;
  const pending = (getQuery(`SELECT COUNT(*) as count FROM documents WHERE status = 'pendiente'${ownerClause}`, ownerParams) || { count: 0 }).count;
  const completed = (getQuery(`SELECT COUNT(*) as count FROM documents WHERE status = 'completado'${ownerClause}`, ownerParams) || { count: 0 }).count;
  const inProcess = (getQuery(`SELECT COUNT(*) as count FROM documents WHERE status = 'en_proceso'${ownerClause}`, ownerParams) || { count: 0 }).count;
  const archived = (getQuery(`SELECT COUNT(*) as count FROM documents WHERE status = 'archivado'${ownerClause}`, ownerParams) || { count: 0 }).count;

  const byType = allQuery(`
    SELECT dt.name, dt.code, dt.icon, COUNT(d.id) as count
    FROM document_types dt LEFT JOIN documents d ON dt.id = d.type_id${filterUserId ? ' AND d.created_by = ?' : ''}
    WHERE dt.is_active = 1 GROUP BY dt.id ORDER BY count DESC
  `, filterUserId ? [filterUserId] : []);

  const byStatus = allQuery(`SELECT status, COUNT(*) as count FROM documents WHERE 1=1${ownerClause} GROUP BY status`, ownerParams);

  const recentDocs = allQuery(`
    SELECT d.id, d.title, d.status, d.created_at, dt.name as type_name, dt.icon, u.full_name as created_by_name
    FROM documents d
    JOIN document_types dt ON d.type_id = dt.id
    JOIN users u ON d.created_by = u.id
    WHERE 1=1${ownerClause.replace('created_by', 'd.created_by')}
    ORDER BY d.created_at DESC LIMIT 10
  `, ownerParams);

  res.json({ total, todayCount, pending, completed, inProcess, archived, byType, byStatus, recentDocs });
});

router.get('/by-day', (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const filterUserId = isAdmin ? (req.query.user_id ? parseInt(req.query.user_id) : null) : req.user.id;
  const days = Math.min(parseInt(req.query.days) || 30, 365);
  const data = allQuery(`
    SELECT DATE(created_at, 'localtime') as date, COUNT(*) as count
    FROM documents
    WHERE DATE(created_at, 'localtime') >= DATE('now', 'localtime', '-${days} days')${filterUserId ? ' AND created_by = ?' : ''}
    GROUP BY DATE(created_at, 'localtime') ORDER BY date ASC
  `, filterUserId ? [filterUserId] : []);
  res.json(data);
});

router.get('/by-week', (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const data = allQuery(`
    SELECT strftime('%Y-W%W', created_at, 'localtime') as week, COUNT(*) as count
    FROM documents
    WHERE DATE(created_at, 'localtime') >= DATE('now', 'localtime', '-84 days')${isAdmin ? '' : ' AND created_by = ?'}
    GROUP BY strftime('%Y-W%W', created_at, 'localtime') ORDER BY week ASC
  `, isAdmin ? [] : [req.user.id]);
  res.json(data);
});

router.get('/by-month', (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const data = allQuery(`
    SELECT strftime('%Y-%m', created_at, 'localtime') as month, COUNT(*) as count
    FROM documents
    WHERE DATE(created_at, 'localtime') >= DATE('now', 'localtime', '-365 days')${isAdmin ? '' : ' AND created_by = ?'}
    GROUP BY strftime('%Y-%m', created_at, 'localtime') ORDER BY month ASC
  `, isAdmin ? [] : [req.user.id]);
  res.json(data);
});

router.get('/by-year', (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const data = allQuery(`
    SELECT strftime('%Y', created_at, 'localtime') as year, COUNT(*) as count
    FROM documents WHERE 1=1${isAdmin ? '' : ' AND created_by = ?'}
    GROUP BY strftime('%Y', created_at, 'localtime') ORDER BY year ASC
  `, isAdmin ? [] : [req.user.id]);
  res.json(data);
});

router.get('/range', (req, res) => {
  const { from, to, type_id } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'Fechas from y to requeridas' });

  let where = "WHERE DATE(d.created_at, 'localtime') BETWEEN ? AND ?";
  const params = [from, to];
  if (req.user.role !== 'admin') { where += ' AND d.created_by = ?'; params.push(req.user.id); }
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
