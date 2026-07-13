const express = require('express');
const bcrypt = require('bcryptjs');
const { getQuery, allQuery, runQuery } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken, requireAdmin);

router.get('/users', (req, res) => {
  const users = allQuery('SELECT id, username, full_name, role, created_at, is_active FROM users ORDER BY created_at DESC', []);
  res.json(users);
});

router.post('/users', (req, res) => {
  const { username, password, full_name, role } = req.body;
  if (!username || !password || !full_name || !role) return res.status(400).json({ error: 'Todos los campos son requeridos' });
  if (!['admin', 'notario'].includes(role)) return res.status(400).json({ error: 'Rol inválido' });

  const exists = getQuery('SELECT id FROM users WHERE username = ?', [username]);
  if (exists) return res.status(400).json({ error: 'El usuario ya existe' });

  const result = runQuery(
    'INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)',
    [username, bcrypt.hashSync(password, 10), full_name, role]
  );

  const user = getQuery('SELECT id, username, full_name, role, created_at, is_active FROM users WHERE id = ?', [result.lastID]);
  res.status(201).json(user);
});

router.put('/users/:id', (req, res) => {
  const { full_name, role, is_active, password } = req.body;
  const uid = parseInt(req.params.id);
  const user = getQuery('SELECT * FROM users WHERE id = ?', [uid]);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  if (password) {
    runQuery('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(password, 10), uid]);
  }
  runQuery('UPDATE users SET full_name = ?, role = ?, is_active = ? WHERE id = ?',
    [full_name || user.full_name, role || user.role, is_active !== undefined ? (is_active ? 1 : 0) : user.is_active, uid]);

  const updated = getQuery('SELECT id, username, full_name, role, created_at, is_active FROM users WHERE id = ?', [uid]);
  res.json(updated);
});

router.delete('/users/:id', (req, res) => {
  const uid = parseInt(req.params.id);
  if (uid === req.user.id) return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
  runQuery('UPDATE users SET is_active = 0 WHERE id = ?', [uid]);
  res.json({ message: 'Usuario desactivado' });
});

router.get('/reports/users', (req, res) => {
  const users = allQuery("SELECT id, username, full_name, role FROM users WHERE role = 'notario' ORDER BY full_name", []);

  const report = users.map(u => {
    const total = (getQuery('SELECT COUNT(*) as count FROM documents WHERE created_by = ?', [u.id]) || { count: 0 }).count;
    const pending = (getQuery("SELECT COUNT(*) as count FROM documents WHERE created_by = ? AND status = 'pendiente'", [u.id]) || { count: 0 }).count;
    const inProcess = (getQuery("SELECT COUNT(*) as count FROM documents WHERE created_by = ? AND status = 'en_proceso'", [u.id]) || { count: 0 }).count;
    const completed = (getQuery("SELECT COUNT(*) as count FROM documents WHERE created_by = ? AND status = 'completado'", [u.id]) || { count: 0 }).count;
    const archived = (getQuery("SELECT COUNT(*) as count FROM documents WHERE created_by = ? AND status = 'archivado'", [u.id]) || { count: 0 }).count;

    const byType = allQuery(`
      SELECT dt.name, dt.icon, COUNT(d.id) as count
      FROM documents d JOIN document_types dt ON d.type_id = dt.id
      WHERE d.created_by = ? GROUP BY dt.id ORDER BY count DESC
    `, [u.id]);

    return { id: u.id, username: u.username, full_name: u.full_name, total, pending, inProcess, completed, archived, byType };
  });

  res.json(report);
});

router.get('/templates', (req, res) => {
  const types = allQuery('SELECT * FROM document_types ORDER BY name', []);
  res.json(types.map(t => ({ ...t, fields_template: JSON.parse(t.fields_template) })));
});

router.put('/templates/:id', (req, res) => {
  const { name, description, fields_template } = req.body;
  const tid = parseInt(req.params.id);
  const type = getQuery('SELECT * FROM document_types WHERE id = ?', [tid]);
  if (!type) return res.status(404).json({ error: 'Tipo no encontrado' });

  runQuery('UPDATE document_types SET name = ?, description = ?, fields_template = ? WHERE id = ?',
    [name || type.name, description !== undefined ? description : type.description,
      JSON.stringify(fields_template || JSON.parse(type.fields_template)), tid]);

  const updated = getQuery('SELECT * FROM document_types WHERE id = ?', [tid]);
  res.json({ ...updated, fields_template: JSON.parse(updated.fields_template) });
});

module.exports = router;
