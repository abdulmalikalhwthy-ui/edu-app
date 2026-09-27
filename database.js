db.exec(`
  CREATE TABLE IF NOT EXISTS allowed_students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    added_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(added_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// إعداد افتراضي: التسجيل مفتوح للجميع
db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('restrict_students', '0')`).run();
