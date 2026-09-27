const Database = require('better-sqlite3');
const db = new Database('eduapp.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    role TEXT NOT NULL CHECK(role IN ('student','teacher')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    class_id INTEGER,
    question_type TEXT NOT NULL,
    topic_text TEXT,
    topic_audio TEXT,
    understanding_text TEXT,
    understanding_audio TEXT,
    evidence_text TEXT,
    evidence_source TEXT,
    evidence_snippet TEXT,
    objection_text TEXT,
    objection_audio TEXT,
    problem_text TEXT,
    problem_audio TEXT,
    question_formulation TEXT,
    expected_answer_text TEXT,
    expected_answer_audio TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(student_id) REFERENCES users(id),
    FOREIGN KEY(class_id) REFERENCES classes(id)
  );

  CREATE TABLE IF NOT EXISTS answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL,
    teacher_id INTEGER NOT NULL,
    answer_text TEXT,
    answer_audio TEXT,
    answer_video TEXT,
    is_live INTEGER DEFAULT 0,
    room_link TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(question_id) REFERENCES questions(id),
    FOREIGN KEY(teacher_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS allowed_students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    email TEXT,
    class_id INTEGER,
    added_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(class_id) REFERENCES classes(id),
    FOREIGN KEY(added_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS recordings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    url TEXT NOT NULL,
    mimetype TEXT,
    size INTEGER,
    kind TEXT,
    question_id INTEGER,
    answer_id INTEGER,
    uploaded_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS live_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_name TEXT UNIQUE NOT NULL,
    room_link TEXT NOT NULL,
    password TEXT,
    teacher_id INTEGER NOT NULL,
    class_id INTEGER,
    title TEXT,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    FOREIGN KEY(teacher_id) REFERENCES users(id),
    FOREIGN KEY(class_id) REFERENCES classes(id)
  );
`);

db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('restrict_students', '0')`).run();
db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('teacher_code', '')`).run();
db.prepare(`INSERT OR IGNORE INTO classes (name, description) VALUES ('عام', 'الفصل الافتراضي')`).run();

module.exports = db;
