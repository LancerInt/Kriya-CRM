const express = require('express');
const { getDb } = require('../db/schema');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/stats', authenticate, (req, res) => {
  const db = getDb();

  const stats = {
    clients: {
      total: db.prepare('SELECT COUNT(*) as count FROM clients').get().count,
      active: db.prepare("SELECT COUNT(*) as count FROM clients WHERE status = 'active'").get().count,
    },
    tasks: {
      pending: db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'pending'").get().count,
      overdue: db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status IN ('pending','in_progress') AND due_date < datetime('now')").get().count,
    },
    pipeline: {
      inquiries: db.prepare("SELECT COUNT(*) as count FROM inquiries WHERE stage NOT IN ('order_confirmed','lost')").get().count,
      quotations_pending: db.prepare("SELECT COUNT(*) as count FROM quotations WHERE status = 'pending_approval'").get().count,
    },
    orders: {
      total: db.prepare('SELECT COUNT(*) as count FROM orders').get().count,
      active: db.prepare("SELECT COUNT(*) as count FROM orders WHERE status IN ('confirmed','processing','shipped')").get().count,
    },
    revenue: {
      total: db.prepare("SELECT COALESCE(SUM(total), 0) as total FROM orders").get().total,
      by_currency: db.prepare("SELECT currency, SUM(total) as total FROM orders GROUP BY currency").all(),
    },
    recent_activities: db.prepare(`
      SELECT 'communication' as type, c.subject as title, c.created_at, cl.company_name as client_name, u.name as user_name
      FROM communications c
      LEFT JOIN clients cl ON c.client_id = cl.id
      LEFT JOIN users u ON c.user_id = u.id
      ORDER BY c.created_at DESC LIMIT 5
    `).all(),
    pipeline_by_stage: db.prepare(`
      SELECT stage, COUNT(*) as count, SUM(expected_value) as value
      FROM inquiries
      WHERE stage NOT IN ('order_confirmed','lost')
      GROUP BY stage
    `).all(),
    clients_by_country: db.prepare(`
      SELECT country, COUNT(*) as count FROM clients
      WHERE country IS NOT NULL AND country != ''
      GROUP BY country ORDER BY count DESC LIMIT 10
    `).all(),
  };

  res.json(stats);
});

module.exports = router;
