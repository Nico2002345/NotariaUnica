const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'notaria.db');
let db = null;

async function initDatabase() {
  const SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
    console.log('✅ Conectado a base de datos: notaria.db');
  } else {
    db = new SQL.Database();
    console.log('✅ Nueva base de datos creada: notaria.db');
  }

  db.run('PRAGMA foreign_keys = ON');
  createTables();
  seedData();
  saveDatabase();
}

function createTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'notario',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS document_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      description TEXT,
      icon TEXT DEFAULT 'bi-file-text',
      fields_template TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pendiente',
      fields_data TEXT DEFAULT '{}',
      created_by INTEGER NOT NULL,
      updated_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (type_id) REFERENCES document_types(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS document_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_type TEXT,
      file_size INTEGER,
      is_scanned INTEGER DEFAULT 0,
      uploaded_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES documents(id),
      FOREIGN KEY (uploaded_by) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_docs_type ON documents(type_id);
    CREATE INDEX IF NOT EXISTS idx_docs_status ON documents(status);
    CREATE INDEX IF NOT EXISTS idx_docs_created ON documents(created_at);
    CREATE INDEX IF NOT EXISTS idx_files_doc ON document_files(document_id);
  `);
}

function seedData() {
  const adminExists = getQuery('SELECT id FROM users WHERE username = ?', ['admin']);
  if (!adminExists) {
    runQuery('INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)',
      ['admin', bcrypt.hashSync('Admin2024!', 10), 'Administrador del Sistema', 'admin']);
    runQuery('INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)',
      ['notario', bcrypt.hashSync('Notario2024!', 10), 'Notario Principal', 'notario']);
    console.log('👤 Usuario admin creado: admin / Admin2024!');
    console.log('👤 Usuario notario creado: notario / Notario2024!');
  }

  const typesExist = getQuery('SELECT COUNT(*) as count FROM document_types', []);
  if (!typesExist || typesExist.count === 0) {
    const types = [
      {
        name: 'Escrituras Públicas', code: 'escrituras',
        description: 'Compraventas, hipotecas, donaciones y otros actos jurídicos',
        icon: 'bi-file-earmark-text',
        fields: [
          { name: 'numero_escritura', label: 'Número de Escritura', type: 'text', required: true },
          { name: 'fecha_otorgamiento', label: 'Fecha de Otorgamiento', type: 'date', required: true },
          { name: 'tipo_acto', label: 'Tipo de Acto Jurídico', type: 'select', required: true, options: ['Compraventa', 'Hipoteca', 'Donación', 'Permuta', 'Constitución de Sociedad', 'Otro'] },
          { name: 'otorgante', label: 'Otorgante(s)', type: 'textarea', required: true },
          { name: 'beneficiario', label: 'Beneficiario(s)', type: 'textarea', required: true },
          { name: 'descripcion_bien', label: 'Descripción del Bien', type: 'textarea', required: false },
          { name: 'valor', label: 'Valor del Acto (USD)', type: 'number', required: false },
          { name: 'observaciones', label: 'Observaciones', type: 'textarea', required: false }
        ]
      },
      {
        name: 'Poderes Notariales', code: 'poderes',
        description: 'Poderes generales, especiales y amplios',
        icon: 'bi-person-badge',
        fields: [
          { name: 'numero_poder', label: 'Número de Poder', type: 'text', required: true },
          { name: 'fecha_otorgamiento', label: 'Fecha de Otorgamiento', type: 'date', required: true },
          { name: 'tipo_poder', label: 'Tipo de Poder', type: 'select', required: true, options: ['General', 'Especial', 'Amplio', 'Judicial', 'Mercantil'] },
          { name: 'poderdante', label: 'Poderdante', type: 'textarea', required: true },
          { name: 'apoderado', label: 'Apoderado', type: 'textarea', required: true },
          { name: 'facultades', label: 'Facultades Conferidas', type: 'textarea', required: true },
          { name: 'vigencia', label: 'Vigencia', type: 'text', required: false },
          { name: 'observaciones', label: 'Observaciones', type: 'textarea', required: false }
        ]
      },
      {
        name: 'Testamentos', code: 'testamentos',
        description: 'Testamentos abiertos y cerrados',
        icon: 'bi-journal-bookmark',
        fields: [
          { name: 'numero_testamento', label: 'Número de Testamento', type: 'text', required: true },
          { name: 'fecha_otorgamiento', label: 'Fecha de Otorgamiento', type: 'date', required: true },
          { name: 'tipo_testamento', label: 'Tipo de Testamento', type: 'select', required: true, options: ['Abierto', 'Cerrado', 'Ológrafo'] },
          { name: 'testador', label: 'Testador', type: 'textarea', required: true },
          { name: 'cedula_testador', label: 'Cédula del Testador', type: 'text', required: true },
          { name: 'beneficiarios', label: 'Beneficiarios / Herederos', type: 'textarea', required: true },
          { name: 'bienes', label: 'Descripción de Bienes', type: 'textarea', required: false },
          { name: 'testigos', label: 'Testigos', type: 'textarea', required: false },
          { name: 'observaciones', label: 'Observaciones', type: 'textarea', required: false }
        ]
      },
      {
        name: 'Declaraciones Juramentadas', code: 'declaraciones',
        description: 'Declaraciones bajo juramento ante notario',
        icon: 'bi-clipboard-check',
        fields: [
          { name: 'numero_declaracion', label: 'Número de Declaración', type: 'text', required: true },
          { name: 'fecha', label: 'Fecha', type: 'date', required: true },
          { name: 'declarante', label: 'Declarante', type: 'textarea', required: true },
          { name: 'cedula_declarante', label: 'Cédula del Declarante', type: 'text', required: true },
          { name: 'motivo', label: 'Motivo de la Declaración', type: 'text', required: true },
          { name: 'contenido', label: 'Contenido de la Declaración', type: 'textarea', required: true },
          { name: 'observaciones', label: 'Observaciones', type: 'textarea', required: false }
        ]
      },
      {
        name: 'Actas de Matrimonio y Divorcio', code: 'actas',
        description: 'Actas del estado civil y actos relacionados',
        icon: 'bi-heart',
        fields: [
          { name: 'numero_acta', label: 'Número de Acta', type: 'text', required: true },
          { name: 'fecha', label: 'Fecha', type: 'date', required: true },
          { name: 'tipo_acta', label: 'Tipo de Acta', type: 'select', required: true, options: ['Matrimonio', 'Divorcio', 'Unión de Hecho', 'Reconocimiento de Hijo', 'Otro'] },
          { name: 'contrayente1', label: 'Primer Contrayente / Parte', type: 'textarea', required: true },
          { name: 'contrayente2', label: 'Segundo Contrayente / Parte', type: 'textarea', required: true },
          { name: 'testigos', label: 'Testigos', type: 'textarea', required: false },
          { name: 'lugar', label: 'Lugar del Acto', type: 'text', required: false },
          { name: 'observaciones', label: 'Observaciones', type: 'textarea', required: false }
        ]
      },
      {
        name: 'Autenticaciones y Apostillas', code: 'autenticaciones',
        description: 'Certificaciones, autenticaciones y apostillas de documentos',
        icon: 'bi-patch-check',
        fields: [
          { name: 'numero_autenticacion', label: 'Número de Autenticación', type: 'text', required: true },
          { name: 'fecha', label: 'Fecha', type: 'date', required: true },
          { name: 'tipo', label: 'Tipo', type: 'select', required: true, options: ['Autenticación de Firma', 'Apostilla', 'Certificación de Copia', 'Reconocimiento de Firma', 'Legalización'] },
          { name: 'solicitante', label: 'Solicitante', type: 'textarea', required: true },
          { name: 'cedula_solicitante', label: 'Cédula del Solicitante', type: 'text', required: true },
          { name: 'documento_presentado', label: 'Documento Presentado', type: 'text', required: true },
          { name: 'destino', label: 'País / Entidad Destino', type: 'text', required: false },
          { name: 'observaciones', label: 'Observaciones', type: 'textarea', required: false }
        ]
      }
    ];

    types.forEach(t => {
      runQuery(
        'INSERT INTO document_types (name, code, description, icon, fields_template) VALUES (?, ?, ?, ?, ?)',
        [t.name, t.code, t.description, t.icon, JSON.stringify(t.fields)]
      );
    });
    console.log('📋 Tipos de documentos creados');
  }
}

// ===== Helpers =====
function saveDatabase() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

function getLastInsertId() {
  // Use db.exec which returns results directly and doesn't interfere with other statements
  const result = db.exec('SELECT last_insert_rowid() as id');
  if (result && result[0] && result[0].values && result[0].values[0]) {
    return result[0].values[0][0];
  }
  return null;
}

function runQuery(sql, params = []) {
  if (!db) throw new Error('Base de datos no inicializada');
  db.run(sql, params);
  const lastID = getLastInsertId(); // Get ID before saveDatabase
  const changes = db.getRowsModified();
  saveDatabase();
  return { lastID, changes };
}

function getQuery(sql, params = []) {
  if (!db) throw new Error('Base de datos no inicializada');
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const result = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return result;
}

function allQuery(sql, params = []) {
  if (!db) throw new Error('Base de datos no inicializada');
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const results = [];
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

module.exports = { initDatabase, runQuery, getQuery, allQuery, saveDatabase };
