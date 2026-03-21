const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// ============ INQUIRIES ============

router.get('/inquiries', authenticate, (req, res) => {
  const db = getDb();
  const { stage, client_id } = req.query;

  let query = `
    SELECT i.*, c.company_name as client_name, u.name as executive_name, p.name as product_display_name
    FROM inquiries i
    LEFT JOIN clients c ON i.client_id = c.id
    LEFT JOIN users u ON i.user_id = u.id
    LEFT JOIN products p ON i.product_id = p.id
    WHERE 1=1
  `;
  const params = [];

  if (stage) { query += ` AND i.stage = ?`; params.push(stage); }
  if (client_id) { query += ` AND i.client_id = ?`; params.push(client_id); }

  query += ` ORDER BY i.updated_at DESC`;
  res.json(db.prepare(query).all(...params));
});

router.post('/inquiries', authenticate, (req, res) => {
  const db = getDb();
  const { client_id, contact_id, source, product_id, product_name, quantity, requirements, notes, expected_value, currency } = req.body;
  if (!client_id) return res.status(400).json({ error: 'Client required' });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO inquiries (id, client_id, contact_id, user_id, source, product_id, product_name, quantity, requirements, notes, expected_value, currency)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, client_id, contact_id, req.user.id, source || 'manual', product_id, product_name, quantity, requirements, notes, expected_value || 0, currency || 'USD');

  // Auto-create follow-up task
  db.prepare(`
    INSERT INTO tasks (id, title, client_id, linked_type, linked_id, owner_id, created_by, due_date, priority, auto_generated)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+1 day'), 'high', 1)
  `).run(uuidv4(), `Follow up on new inquiry`, client_id, 'inquiry', id, req.user.id, req.user.id);

  res.status(201).json({ id });
});

router.put('/inquiries/:id', authenticate, (req, res) => {
  const db = getDb();
  const { stage, notes, expected_value } = req.body;
  db.prepare(`
    UPDATE inquiries SET stage = ?, notes = ?, expected_value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(stage, notes, expected_value, req.params.id);
  res.json({ success: true });
});

// ============ QUOTATIONS ============

router.get('/quotations', authenticate, (req, res) => {
  const db = getDb();
  const { status, client_id } = req.query;

  let query = `
    SELECT q.*, c.company_name as client_name, u.name as created_by_name, a.name as approver_name
    FROM quotations q
    LEFT JOIN clients c ON q.client_id = c.id
    LEFT JOIN users u ON q.created_by = u.id
    LEFT JOIN users a ON q.approved_by = a.id
    WHERE 1=1
  `;
  const params = [];
  if (status) { query += ` AND q.status = ?`; params.push(status); }
  if (client_id) { query += ` AND q.client_id = ?`; params.push(client_id); }
  query += ` ORDER BY q.created_at DESC`;

  res.json(db.prepare(query).all(...params));
});

router.get('/quotations/:id', authenticate, (req, res) => {
  const db = getDb();
  const q = db.prepare(`
    SELECT q.*, c.company_name as client_name, c.address as client_address, c.country as client_country,
    c.delivery_terms as client_delivery_terms, u.name as created_by_name
    FROM quotations q
    LEFT JOIN clients c ON q.client_id = c.id
    LEFT JOIN users u ON q.created_by = u.id
    WHERE q.id = ?
  `).get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Quotation not found' });
  res.json(q);
});

router.post('/quotations', authenticate, (req, res) => {
  const db = getDb();
  const { inquiry_id, client_id, items, subtotal, total, currency, delivery_terms, packaging_details, validity_days, notes } = req.body;
  if (!client_id || !items) return res.status(400).json({ error: 'Client and items required' });

  // Generate quotation number
  const count = db.prepare('SELECT COUNT(*) as count FROM quotations').get().count;
  const quotation_number = `QT-${String(count + 1).padStart(5, '0')}`;

  const id = uuidv4();
  db.prepare(`
    INSERT INTO quotations (id, inquiry_id, client_id, quotation_number, items, subtotal, total, currency, delivery_terms, packaging_details, validity_days, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, inquiry_id, client_id, quotation_number, JSON.stringify(items), subtotal, total, currency || 'USD', delivery_terms, packaging_details, validity_days || 30, notes, req.user.id);

  // Update inquiry stage if linked
  if (inquiry_id) {
    db.prepare("UPDATE inquiries SET stage = 'quotation', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(inquiry_id);
  }

  res.status(201).json({ id, quotation_number });
});

// Submit for approval
router.post('/quotations/:id/submit', authenticate, (req, res) => {
  const db = getDb();
  db.prepare("UPDATE quotations SET status = 'pending_approval', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);

  // Create task for managers
  const q = db.prepare('SELECT * FROM quotations WHERE id = ?').get(req.params.id);
  const managers = db.prepare("SELECT id FROM users WHERE role IN ('manager','admin')").all();
  for (const m of managers) {
    db.prepare(`
      INSERT INTO tasks (id, title, client_id, linked_type, linked_id, owner_id, created_by, due_date, priority, auto_generated)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+1 day'), 'high', 1)
    `).run(uuidv4(), `Approve quotation ${q.quotation_number}`, q.client_id, 'quotation', req.params.id, m.id, req.user.id);
  }

  res.json({ success: true });
});

// Approve quotation
router.post('/quotations/:id/approve', authenticate, authorize('admin', 'manager'), (req, res) => {
  const db = getDb();
  db.prepare("UPDATE quotations SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(req.user.id, req.params.id);
  res.json({ success: true });
});

// Reject quotation
router.post('/quotations/:id/reject', authenticate, authorize('admin', 'manager'), (req, res) => {
  const db = getDb();
  db.prepare("UPDATE quotations SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// Create new version
router.post('/quotations/:id/revise', authenticate, (req, res) => {
  const db = getDb();
  const original = db.prepare('SELECT * FROM quotations WHERE id = ?').get(req.params.id);
  if (!original) return res.status(404).json({ error: 'Quotation not found' });

  const id = uuidv4();
  const newNumber = `${original.quotation_number}-R${original.version + 1}`;

  db.prepare(`
    INSERT INTO quotations (id, inquiry_id, client_id, quotation_number, version, parent_quotation_id, items, subtotal, total, currency, delivery_terms, packaging_details, validity_days, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, original.inquiry_id, original.client_id, newNumber, original.version + 1, req.params.id,
    original.items, original.subtotal, original.total, original.currency, original.delivery_terms,
    original.packaging_details, original.validity_days, original.notes, req.user.id);

  db.prepare("UPDATE quotations SET status = 'expired' WHERE id = ?").run(req.params.id);

  res.status(201).json({ id, quotation_number: newNumber });
});

// Convert to order
router.post('/quotations/:id/convert', authenticate, (req, res) => {
  const db = getDb();
  const q = db.prepare('SELECT * FROM quotations WHERE id = ?').get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Quotation not found' });
  if (q.status !== 'approved') return res.status(400).json({ error: 'Quotation must be approved first' });

  const orderCount = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
  const order_number = `ORD-${String(orderCount + 1).padStart(5, '0')}`;
  const orderId = uuidv4();

  db.prepare(`
    INSERT INTO orders (id, order_number, quotation_id, client_id, items, total, currency, delivery_terms, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(orderId, order_number, req.params.id, q.client_id, q.items, q.total, q.currency, q.delivery_terms, req.user.id);

  // Update quotation status
  db.prepare("UPDATE quotations SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);

  // Update inquiry stage
  if (q.inquiry_id) {
    db.prepare("UPDATE inquiries SET stage = 'order_confirmed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(q.inquiry_id);
  }

  // Auto-generate Proforma Invoice
  const invCount = db.prepare('SELECT COUNT(*) as count FROM invoices').get().count;
  const inv_number = `PI-${String(invCount + 1).padStart(5, '0')}`;
  db.prepare(`
    INSERT INTO invoices (id, invoice_number, order_id, client_id, type, items, subtotal, total, currency, status, created_by)
    VALUES (?, ?, ?, ?, 'proforma', ?, ?, ?, ?, 'draft', ?)
  `).run(uuidv4(), inv_number, orderId, q.client_id, q.items, q.subtotal || q.total, q.total, q.currency, req.user.id);

  res.status(201).json({ id: orderId, order_number });
});

// ============ ORDERS ============

router.get('/orders', authenticate, (req, res) => {
  const db = getDb();
  const { status, client_id } = req.query;
  let query = `
    SELECT o.*, c.company_name as client_name, u.name as created_by_name
    FROM orders o
    LEFT JOIN clients c ON o.client_id = c.id
    LEFT JOIN users u ON o.created_by = u.id
    WHERE 1=1
  `;
  const params = [];
  if (status) { query += ` AND o.status = ?`; params.push(status); }
  if (client_id) { query += ` AND o.client_id = ?`; params.push(client_id); }
  query += ` ORDER BY o.created_at DESC`;
  res.json(db.prepare(query).all(...params));
});

router.get('/orders/:id', authenticate, (req, res) => {
  const db = getDb();
  const order = db.prepare(`
    SELECT o.*, c.company_name as client_name, c.address as client_address, c.country as client_country,
    u.name as created_by_name
    FROM orders o
    LEFT JOIN clients c ON o.client_id = c.id
    LEFT JOIN users u ON o.created_by = u.id
    WHERE o.id = ?
  `).get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  order.shipments = db.prepare('SELECT * FROM shipments WHERE order_id = ?').all(req.params.id);
  order.invoices = db.prepare('SELECT * FROM invoices WHERE order_id = ?').all(req.params.id);

  res.json(order);
});

// ============ PRODUCTS ============

router.get('/products', authenticate, (req, res) => {
  const db = getDb();
  const products = db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY name').all();
  res.json(products);
});

router.post('/products', authenticate, (req, res) => {
  const db = getDb();
  const { name, category, active_ingredient, concentration, description, base_price, currency } = req.body;
  const id = uuidv4();
  db.prepare(`
    INSERT INTO products (id, name, category, active_ingredient, concentration, description, base_price, currency)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, category, active_ingredient, concentration, description, base_price || 0, currency || 'USD');
  res.status(201).json({ id, name });
});

module.exports = router;
