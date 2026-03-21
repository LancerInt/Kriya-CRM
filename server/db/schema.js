const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', '..', 'gtip.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initializeDatabase() {
  const db = getDb();

  db.exec(`
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'executive' CHECK(role IN ('admin','manager','executive')),
      phone TEXT,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Clients table
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      country TEXT,
      address TEXT,
      business_type TEXT,
      delivery_terms TEXT DEFAULT 'FOB',
      preferred_currency TEXT DEFAULT 'USD' CHECK(preferred_currency IN ('INR','USD','EUR')),
      credit_days INTEGER DEFAULT 30,
      credit_limit REAL DEFAULT 0,
      payment_mode TEXT,
      primary_executive_id TEXT,
      status TEXT DEFAULT 'active' CHECK(status IN ('active','inactive')),
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (primary_executive_id) REFERENCES users(id)
    );

    -- Client secondary executives
    CREATE TABLE IF NOT EXISTS client_executives (
      client_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      PRIMARY KEY (client_id, user_id),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Client destination ports
    CREATE TABLE IF NOT EXISTS client_ports (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      port_name TEXT NOT NULL,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    -- Contacts table
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      whatsapp TEXT,
      designation TEXT,
      is_primary INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    -- Communications table
    CREATE TABLE IF NOT EXISTS communications (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      contact_id TEXT,
      user_id TEXT,
      type TEXT NOT NULL CHECK(type IN ('email','whatsapp','note','call')),
      direction TEXT CHECK(direction IN ('inbound','outbound')),
      subject TEXT,
      body TEXT,
      status TEXT DEFAULT 'sent',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (contact_id) REFERENCES contacts(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Communication attachments
    CREATE TABLE IF NOT EXISTS comm_attachments (
      id TEXT PRIMARY KEY,
      communication_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      mimetype TEXT,
      size INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (communication_id) REFERENCES communications(id) ON DELETE CASCADE
    );

    -- Tasks table
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      client_id TEXT,
      linked_type TEXT,
      linked_id TEXT,
      owner_id TEXT NOT NULL,
      created_by TEXT,
      due_date DATETIME,
      priority TEXT DEFAULT 'medium' CHECK(priority IN ('low','medium','high','urgent')),
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed','cancelled')),
      auto_generated INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
      FOREIGN KEY (owner_id) REFERENCES users(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    -- Products table
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      active_ingredient TEXT,
      concentration TEXT,
      description TEXT,
      base_price REAL DEFAULT 0,
      currency TEXT DEFAULT 'USD',
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Inquiries / Pipeline
    CREATE TABLE IF NOT EXISTS inquiries (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      contact_id TEXT,
      user_id TEXT,
      source TEXT DEFAULT 'manual' CHECK(source IN ('email','whatsapp','manual')),
      stage TEXT DEFAULT 'inquiry' CHECK(stage IN ('inquiry','discussion','sample','quotation','negotiation','order_confirmed','lost')),
      product_id TEXT,
      product_name TEXT,
      quantity TEXT,
      requirements TEXT,
      notes TEXT,
      expected_value REAL DEFAULT 0,
      currency TEXT DEFAULT 'USD',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (contact_id) REFERENCES contacts(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    -- Quotations
    CREATE TABLE IF NOT EXISTS quotations (
      id TEXT PRIMARY KEY,
      inquiry_id TEXT,
      client_id TEXT NOT NULL,
      quotation_number TEXT UNIQUE NOT NULL,
      version INTEGER DEFAULT 1,
      parent_quotation_id TEXT,
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft','pending_approval','approved','sent','accepted','rejected','expired')),
      items TEXT NOT NULL,
      subtotal REAL DEFAULT 0,
      total REAL DEFAULT 0,
      currency TEXT DEFAULT 'USD',
      delivery_terms TEXT,
      packaging_details TEXT,
      validity_days INTEGER DEFAULT 30,
      notes TEXT,
      approved_by TEXT,
      approved_at DATETIME,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (inquiry_id) REFERENCES inquiries(id),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_quotation_id) REFERENCES quotations(id),
      FOREIGN KEY (approved_by) REFERENCES users(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    -- Orders
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_number TEXT UNIQUE NOT NULL,
      quotation_id TEXT,
      client_id TEXT NOT NULL,
      status TEXT DEFAULT 'confirmed' CHECK(status IN ('confirmed','processing','shipped','delivered','cancelled')),
      items TEXT NOT NULL,
      total REAL DEFAULT 0,
      currency TEXT DEFAULT 'USD',
      delivery_terms TEXT,
      notes TEXT,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (quotation_id) REFERENCES quotations(id),
      FOREIGN KEY (client_id) REFERENCES clients(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    -- Shipments
    CREATE TABLE IF NOT EXISTS shipments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      shipment_number TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','packed','dispatched','in_transit','delivered')),
      container_number TEXT,
      bl_number TEXT,
      forwarder TEXT,
      port_of_loading TEXT,
      port_of_discharge TEXT,
      delivery_terms TEXT,
      dispatch_date DATETIME,
      transit_days INTEGER,
      estimated_arrival DATETIME,
      actual_arrival DATETIME,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (client_id) REFERENCES clients(id)
    );

    -- Invoices
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      invoice_number TEXT UNIQUE NOT NULL,
      order_id TEXT,
      client_id TEXT NOT NULL,
      type TEXT DEFAULT 'commercial' CHECK(type IN ('proforma','commercial')),
      items TEXT NOT NULL,
      subtotal REAL DEFAULT 0,
      tax REAL DEFAULT 0,
      total REAL DEFAULT 0,
      currency TEXT DEFAULT 'USD',
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft','sent','paid','partial','overdue','cancelled')),
      due_date DATETIME,
      notes TEXT,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (client_id) REFERENCES clients(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    -- Payments
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      invoice_id TEXT,
      client_id TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'USD',
      payment_date DATETIME,
      mode TEXT CHECK(mode IN ('TT','LC','advance','credit')),
      reference TEXT,
      firc_status TEXT DEFAULT 'pending' CHECK(firc_status IN ('pending','received','na')),
      firc_document TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id),
      FOREIGN KEY (client_id) REFERENCES clients(id)
    );

    -- Documents
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      client_id TEXT,
      order_id TEXT,
      shipment_id TEXT,
      category TEXT CHECK(category IN ('commercial','quality','regulatory','financial','sample','other')),
      name TEXT NOT NULL,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      mimetype TEXT,
      size INTEGER,
      version INTEGER DEFAULT 1,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (shipment_id) REFERENCES shipments(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    -- Samples
    CREATE TABLE IF NOT EXISTS samples (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      product_id TEXT,
      product_name TEXT,
      quantity TEXT,
      dispatch_date DATETIME,
      courier_details TEXT,
      tracking_number TEXT,
      status TEXT DEFAULT 'requested' CHECK(status IN ('requested','prepared','dispatched','delivered','feedback_pending','feedback_received')),
      feedback_rating INTEGER,
      feedback_comments TEXT,
      feedback_issues TEXT,
      bulk_interest INTEGER DEFAULT 0,
      notes TEXT,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    -- Call Logs
    CREATE TABLE IF NOT EXISTS call_logs (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      contact_id TEXT,
      user_id TEXT NOT NULL,
      scheduled_at DATETIME,
      agenda TEXT,
      call_notes TEXT,
      duration_minutes INTEGER,
      status TEXT DEFAULT 'scheduled' CHECK(status IN ('scheduled','completed','missed','cancelled')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (contact_id) REFERENCES contacts(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // Seed admin user if none exists
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count === 0) {
    const { v4: uuidv4 } = require('uuid');
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT INTO users (id, name, email, password, role)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), 'Admin User', 'admin@kriya.com', hashedPassword, 'admin');

    // Seed sample executive
    const execId = uuidv4();
    db.prepare(`
      INSERT INTO users (id, name, email, password, role)
      VALUES (?, ?, ?, ?, ?)
    `).run(execId, 'Rahul Sharma', 'rahul@kriya.com', bcrypt.hashSync('exec123', 10), 'executive');

    // Seed manager
    db.prepare(`
      INSERT INTO users (id, name, email, password, role)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), 'Priya Patel', 'priya@kriya.com', bcrypt.hashSync('mgr123', 10), 'manager');

    // Seed some products
    const products = [
      { name: 'Humic Acid 90%', category: 'Soil Conditioner', ingredient: 'Humic Acid', concentration: '90%' },
      { name: 'Seaweed Extract', category: 'Bio Stimulant', ingredient: 'Ascophyllum Nodosum', concentration: '100%' },
      { name: 'Amino Acid 80%', category: 'Plant Growth', ingredient: 'L-Amino Acids', concentration: '80%' },
      { name: 'Fulvic Acid 90%', category: 'Soil Conditioner', ingredient: 'Fulvic Acid', concentration: '90%' },
      { name: 'NPK 19-19-19', category: 'Fertilizer', ingredient: 'NPK Complex', concentration: '57%' },
    ];
    const insertProduct = db.prepare(`
      INSERT INTO products (id, name, category, active_ingredient, concentration)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const p of products) {
      insertProduct.run(uuidv4(), p.name, p.category, p.ingredient, p.concentration);
    }

    console.log('Database seeded with default data.');
  }

  console.log('Database initialized successfully.');
}

module.exports = { getDb, initializeDatabase };
