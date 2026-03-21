const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Get all tasks
router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const { status, priority, client_id } = req.query;

  let query = `
    SELECT t.*, u.name as owner_name, c.company_name as client_name,
    cr.name as creator_name
    FROM tasks t
    LEFT JOIN users u ON t.owner_id = u.id
    LEFT JOIN clients c ON t.client_id = c.id
    LEFT JOIN users cr ON t.created_by = cr.id
    WHERE 1=1
  `;
  const params = [];

  if (req.user.role === 'executive') {
    query += ` AND t.owner_id = ?`;
    params.push(req.user.id);
  }

  if (status) {
    query += ` AND t.status = ?`;
    params.push(status);
  }
  if (priority) {
    query += ` AND t.priority = ?`;
    params.push(priority);
  }
  if (client_id) {
    query += ` AND t.client_id = ?`;
    params.push(client_id);
  }

  query += ` ORDER BY
    CASE WHEN t.status = 'pending' AND t.due_date < datetime('now') THEN 0
         WHEN t.status = 'pending' THEN 1
         WHEN t.status = 'in_progress' THEN 2
         ELSE 3 END,
    t.due_date ASC`;

  const tasks = db.prepare(query).all(...params);
  res.json(tasks);
});

// Create task
router.post('/', authenticate, (req, res) => {
  const db = getDb();
  const { title, description, client_id, linked_type, linked_id, owner_id, due_date, priority } = req.body;

  if (!title) return res.status(400).json({ error: 'Title required' });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO tasks (id, title, description, client_id, linked_type, linked_id, owner_id, created_by, due_date, priority)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, title, description, client_id, linked_type, linked_id, owner_id || req.user.id, req.user.id, due_date, priority || 'medium');

  res.status(201).json({ id, title });
});

// Update task
router.put('/:id', authenticate, (req, res) => {
  const db = getDb();
  const { title, description, client_id, owner_id, due_date, priority, status } = req.body;

  db.prepare(`
    UPDATE tasks SET title = ?, description = ?, client_id = ?, owner_id = ?,
    due_date = ?, priority = ?, status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(title, description, client_id, owner_id, due_date, priority, status, req.params.id);

  res.json({ success: true });
});

// Delete task
router.delete('/:id', authenticate, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Get task stats
router.get('/stats', authenticate, (req, res) => {
  const db = getDb();
  let where = '';
  const params = [];
  if (req.user.role === 'executive') {
    where = 'WHERE owner_id = ?';
    params.push(req.user.id);
  }

  const stats = {
    total: db.prepare(`SELECT COUNT(*) as count FROM tasks ${where}`).get(...params).count,
    pending: db.prepare(`SELECT COUNT(*) as count FROM tasks ${where ? where + " AND" : "WHERE"} status = 'pending'`).get(...params).count,
    in_progress: db.prepare(`SELECT COUNT(*) as count FROM tasks ${where ? where + " AND" : "WHERE"} status = 'in_progress'`).get(...params).count,
    completed: db.prepare(`SELECT COUNT(*) as count FROM tasks ${where ? where + " AND" : "WHERE"} status = 'completed'`).get(...params).count,
    overdue: db.prepare(`SELECT COUNT(*) as count FROM tasks ${where ? where + " AND" : "WHERE"} status IN ('pending','in_progress') AND due_date < datetime('now')`).get(...params).count,
  };

  res.json(stats);
});

module.exports = router;
