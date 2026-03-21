const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Get communications
router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const { client_id, type } = req.query;

  let query = `
    SELECT c.*, u.name as user_name, ct.name as contact_name, cl.company_name as client_name
    FROM communications c
    LEFT JOIN users u ON c.user_id = u.id
    LEFT JOIN contacts ct ON c.contact_id = ct.id
    LEFT JOIN clients cl ON c.client_id = cl.id
    WHERE 1=1
  `;
  const params = [];
  if (client_id) { query += ` AND c.client_id = ?`; params.push(client_id); }
  if (type) { query += ` AND c.type = ?`; params.push(type); }
  query += ` ORDER BY c.created_at DESC LIMIT 100`;

  res.json(db.prepare(query).all(...params));
});

// Create communication (note, email log, whatsapp log)
router.post('/', authenticate, (req, res) => {
  const db = getDb();
  const { client_id, contact_id, type, direction, subject, body } = req.body;
  if (!client_id || !type) return res.status(400).json({ error: 'Client and type required' });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO communications (id, client_id, contact_id, user_id, type, direction, subject, body)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, client_id, contact_id, req.user.id, type, direction, subject, body);

  // Update client's updated_at
  db.prepare('UPDATE clients SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(client_id);

  res.status(201).json({ id });
});

module.exports = router;
