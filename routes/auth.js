const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getQuery, runQuery } = require('../database');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });

  const user = getQuery('SELECT * FROM users WHERE username = ? AND is_active = 1', [username]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, full_name: user.full_name },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({ token, user: { id: user.id, username: user.username, role: user.role, full_name: user.full_name } });
});

router.post('/change-password', authenticateToken, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'Contraseña actual y nueva requeridas' });
  if (new_password.length < 6) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });

  const user = getQuery('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(401).json({ error: 'Contraseña actual incorrecta' });
  }

  runQuery('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(new_password, 10), req.user.id]);
  res.json({ message: 'Contraseña cambiada exitosamente' });
});

router.get('/me', authenticateToken, (req, res) => res.json(req.user));

module.exports = router;
