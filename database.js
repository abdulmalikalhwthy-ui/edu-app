const Database = require('better-sqlite3');
const db = new Database('eduapp.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('student','teacher')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
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
    FOREIGN KEY(student_id) REFERENCES users(id)
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
    added_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(added_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('restrict_students', '0')`).run();

module.exports = db;
