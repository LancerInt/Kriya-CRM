const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Get all clients (with role-based filtering)
router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const { search, status, country } = req.query;

  let query = `
    SELECT c.*, u.name as executive_name,
    (SELECT COUNT(*) FROM contacts WHERE client_id = c.id) as contact_count,
    (SELECT COUNT(*) FROM orders WHERE client_id = c.id) as order_count
    FROM clients c
    LEFT JOIN users u ON c.primary_executive_id = u.id
    WHERE 1=1
  `;
  const params = [];

  // Role-based access
  if (req.user.role === 'executive') {
    query += ` AND (c.primary_executive_id = ? OR c.id IN (SELECT client_id FROM client_executives WHERE user_id = ?))`;
    params.push(req.user.id, req.user.id);
  }

  if (search) {
    query += ` AND (c.company_name LIKE ? OR c.country LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }
  if (status) {
    query += ` AND c.status = ?`;
    params.push(status);
  }
  if (country) {
    query += ` AND c.country = ?`;
    params.push(country);
  }

  query += ` ORDER BY c.updated_at DESC`;
  const clients = db.prepare(query).all(...params);
  res.json(clients);
});

// Get single client
router.get('/:id', authenticate, (req, res) => {
  const db = getDb();
  const client = db.prepare(`
    SELECT c.*, u.name as executive_name
    FROM clients c
    LEFT JOIN users u ON c.primary_executive_id = u.id
    WHERE c.id = ?
  `).get(req.params.id);

  if (!client) return res.status(404).json({ error: 'Client not found' });

  // Get contacts
  client.contacts = db.prepare('SELECT * FROM contacts WHERE client_id = ? ORDER BY is_primary DESC, name').all(req.params.id);

  // Get ports
  client.ports = db.prepare('SELECT * FROM client_ports WHERE client_id = ?').all(req.params.id);

  // Get secondary executives
  client.secondary_executives = db.prepare(`
    SELECT u.id, u.name, u.email FROM client_executives ce
    JOIN users u ON ce.user_id = u.id WHERE ce.client_id = ?
  `).all(req.params.id);

  // Get counts for related data
  client.stats = {
    communications: db.prepare('SELECT COUNT(*) as count FROM communications WHERE client_id = ?').get(req.params.id).count,
    orders: db.prepare('SELECT COUNT(*) as count FROM orders WHERE client_id = ?').get(req.params.id).count,
    quotations: db.prepare('SELECT COUNT(*) as count FROM quotations WHERE client_id = ?').get(req.params.id).count,
    tasks: db.prepare("SELECT COUNT(*) as count FROM tasks WHERE client_id = ? AND status != 'completed'").get(req.params.id).count,
    invoices: db.prepare('SELECT COUNT(*) as count FROM invoices WHERE client_id = ?').get(req.params.id).count,
    samples: db.prepare('SELECT COUNT(*) as count FROM samples WHERE client_id = ?').get(req.params.id).count,
  };

  res.json(client);
});

// Create client
router.post('/', authenticate, (req, res) => {
  const db = getDb();
  const { company_name, country, address, business_type, delivery_terms, preferred_currency,
    credit_days, credit_limit, payment_mode, primary_executive_id, contacts, ports, notes } = req.body;

  if (!company_name) return res.status(400).json({ error: 'Company name is required' });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO clients (id, company_name, country, address, business_type, delivery_terms,
    preferred_currency, credit_days, credit_limit, payment_mode, primary_executive_id, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, company_name, country, address, business_type, delivery_terms || 'FOB',
    preferred_currency || 'USD', credit_days || 30, credit_limit || 0, payment_mode,
    primary_executive_id || req.user.id, notes);

  // Insert contacts
  if (contacts && contacts.length > 0) {
    const insertContact = db.prepare(`
      INSERT INTO contacts (id, client_id, name, email, phone, whatsapp, designation, is_primary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const c of contacts) {
      insertContact.run(uuidv4(), id, c.name, c.email, c.phone, c.whatsapp, c.designation, c.is_primary ? 1 : 0);
    }
  }

  // Insert ports
  if (ports && ports.length > 0) {
    const insertPort = db.prepare('INSERT INTO client_ports (id, client_id, port_name) VALUES (?, ?, ?)');
    for (const p of ports) {
      insertPort.run(uuidv4(), id, p);
    }
  }

  res.status(201).json({ id, company_name });
});

// Update client
router.put('/:id', authenticate, (req, res) => {
  const db = getDb();
  const { company_name, country, address, business_type, delivery_terms, preferred_currency,
    credit_days, credit_limit, payment_mode, primary_executive_id, status, notes } = req.body;

  db.prepare(`
    UPDATE clients SET company_name = ?, country = ?, address = ?, business_type = ?,
    delivery_terms = ?, preferred_currency = ?, credit_days = ?, credit_limit = ?,
    payment_mode = ?, primary_executive_id = ?, status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(company_name, country, address, business_type, delivery_terms, preferred_currency,
    credit_days, credit_limit, payment_mode, primary_executive_id, status, notes, req.params.id);

  res.json({ success: true });
});

// Delete client
router.delete('/:id', authenticate, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Add contact to client
router.post('/:id/contacts', authenticate, (req, res) => {
  const db = getDb();
  const { name, email, phone, whatsapp, designation, is_primary } = req.body;
  const id = uuidv4();
  db.prepare(`
    INSERT INTO contacts (id, client_id, name, email, phone, whatsapp, designation, is_primary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.params.id, name, email, phone, whatsapp, designation, is_primary ? 1 : 0);
  res.status(201).json({ id, name });
});

// Get client communications timeline
router.get('/:id/timeline', authenticate, (req, res) => {
  const db = getDb();
  const comms = db.prepare(`
    SELECT c.*, u.name as user_name, ct.name as contact_name
    FROM communications c
    LEFT JOIN users u ON c.user_id = u.id
    LEFT JOIN contacts ct ON c.contact_id = ct.id
    WHERE c.client_id = ?
    ORDER BY c.created_at DESC
  `).all(req.params.id);

  const tasks = db.prepare(`
    SELECT t.*, u.name as owner_name
    FROM tasks t
    LEFT JOIN users u ON t.owner_id = u.id
    WHERE t.client_id = ?
    ORDER BY t.created_at DESC
  `).all(req.params.id);

  // Merge into a single timeline
  const timeline = [
    ...comms.map(c => ({ ...c, timeline_type: 'communication' })),
    ...tasks.map(t => ({ ...t, timeline_type: 'task' })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  res.json(timeline);
});

module.exports = router;
