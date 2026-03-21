const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '24h' });
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role }
  });
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

router.get('/users', authenticate, (req, res) => {
  const db = getDb();
  const users = db.prepare('SELECT id, name, email, role, phone, active FROM users ORDER BY name').all();
  res.json(users);
});

router.post('/users', authenticate, authorize('admin'), (req, res) => {
  const { name, email, password, role, phone } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required' });

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(400).json({ error: 'Email already exists' });

  const id = uuidv4();
  const hashedPassword = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (id, name, email, password, role, phone) VALUES (?, ?, ?, ?, ?, ?)').run(
    id, name, email, hashedPassword, role || 'executive', phone || null
  );

  res.status(201).json({ id, name, email, role: role || 'executive' });
});

module.exports = router;
