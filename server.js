/* ============================================================
   server.js — الخادم الكامل للمنصة التعليمية
   ============================================================ */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.webm';
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2) + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadDir));
app.use(express.static(path.join(__dirname, 'public')));

function requireBackupToken(req, res, next) {
  const token = req.headers['x-backup-token'] || req.query.token;
  const validToken = process.env.BACKUP_TOKEN;
  if (!validToken) return res.status(500).json({ error: 'BACKUP_TOKEN غير مضبوط' });
  if (token !== validToken) return res.status(401).json({ error: 'رمز غير صالح' });
  next();
}

/* ====================== تسجيل الدخول ====================== */
app.post('/api/login', (req, res) => {
  const { name, email, role, teacher_code } = req.body;
  if (!name || !role) return res.status(400).json({ error: 'الاسم والدور مطلوبان' });
  if (!['student', 'teacher'].includes(role)) return res.status(400).json({ error: 'الدور غير صالح' });

  const cleanName = name.trim();
  const cleanEmail = (email || '').trim().toLowerCase();
  if (cleanName.length < 3) return res.status(400).json({ error: 'الاسم قصير جداً' });

  if (role === 'teacher') {
    const codeSetting = db.prepare(`SELECT value FROM settings WHERE key = 'teacher_code'`).get();
    const requiredCode = codeSetting ? codeSetting.value : '';
    if (requiredCode && requiredCode !== '') {
      if (!teacher_code || teacher_code !== requiredCode) {
        return res.status(403).json({ error: 'wrong_code', message: 'رمز الأستاذ غير صحيح.' });
      }
    }
  }

  if (role === 'student') {
    const restrictSetting = db.prepare(`SELECT value FROM settings WHERE key = 'restrict_students'`).get();
    const isRestricted = restrictSetting && restrictSetting.value === '1';
    if (isRestricted) {
      const allowed = db.prepare(`SELECT * FROM allowed_students WHERE name = ?`).get(cleanName);
      if (!allowed) {
        return res.status(403).json({
          error: 'not_allowed',
          message: 'عذراً، لم يُصرّح لك بالتسجيل. تواصل مع الأستاذ.'
        });
      }
    }
  }

  let user = db.prepare(`SELECT * FROM users WHERE name = ? AND role = ?`).get(cleanName, role);
  if (!user) {
    const info = db.prepare(`INSERT INTO users (name, email, role) VALUES (?, ?, ?)`).run(cleanName, cleanEmail || null, role);
    user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(info.lastInsertRowid);
  } else if (cleanEmail && !user.email) {
    db.prepare(`UPDATE users SET email = ? WHERE id = ?`).run(cleanEmail, user.id);
    user.email = cleanEmail;
  }
  res.json(user);
});

/* ====================== رفع الملفات ====================== */
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'لا يوجد ملف' });

  const { kind, question_id, answer_id, uploaded_by } = req.body;
  const url = '/uploads/' + req.file.filename;

  const info = db.prepare(`INSERT INTO recordings
    (filename, url, mimetype, size, kind, question_id, answer_id, uploaded_by)
    VALUES (?,?,?,?,?,?,?,?)`).run(
      req.file.filename, url, req.file.mimetype, req.file.size,
      kind || 'audio',
      question_id ? parseInt(question_id) : null,
      answer_id ? parseInt(answer_id) : null,
      uploaded_by ? parseInt(uploaded_by) : null
    );

  res.json({ url, id: info.lastInsertRowid, size: req.file.size, mimetype: req.file.mimetype });
});

/* ====================== التسجيلات ====================== */
app.get('/api/recordings', (req, res) => {
  const { question_id, answer_id } = req.query;
  let sql = `SELECT r.*, u.name AS uploader_name FROM recordings r
    LEFT JOIN users u ON u.id = r.uploaded_by WHERE 1=1`;
  const params = [];
  if (question_id) { sql += ` AND r.question_id = ?`; params.push(question_id); }
  if (answer_id) { sql += ` AND r.answer_id = ?`; params.push(answer_id); }
  sql += ` ORDER BY r.created_at DESC`;
  res.json(db.prepare(sql).all(...params));
});

app.delete('/api/recordings/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'معرّف غير صالح' });

  const rec = db.prepare(`SELECT * FROM recordings WHERE id = ?`).get(id);
  if (!rec) return res.status(404).json({ error: 'التسجيل غير موجود' });

  const filePath = path.join(__dirname, rec.url);
  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch (e) { console.error(e); }
  }

  db.prepare(`DELETE FROM recordings WHERE id = ?`).run(id);
  res.json({ ok: true });
});

/* ====================== الإعدادات ====================== */
app.get('/api/settings', (req, res) => {
  const rows = db.prepare('SELECT * FROM settings').all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.json(settings);
});

app.post('/api/settings', (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'key مطلوب' });
  db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`).run(key, String(value));
  res.json({ ok: true });
});

/* ====================== الفصول ====================== */
app.get('/api/classes', (req, res) => {
  res.json(db.prepare(`SELECT * FROM classes ORDER BY name ASC`).all());
});

app.post('/api/classes', (req, res) => {
  const { name, description } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'اسم الفصل مطلوب' });
  try {
    const info = db.prepare(`INSERT INTO classes (name, description) VALUES (?, ?)`).run(name.trim(), description || null);
    res.json({ id: info.lastInsertRowid, ok: true });
  } catch (e) {
    if (String(e).includes('UNIQUE')) return res.status(400).json({ error: 'الاسم موجود مسبقاً' });
    res.status(500).json({ error: 'فشل الإضافة' });
  }
});

app.delete('/api/classes/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'معرّف غير صالح' });
  const count = db.prepare(`SELECT COUNT(*) AS c FROM allowed_students WHERE class_id = ?`).get(id).c;
  if (count > 0) return res.status(400).json({ error: 'الفصل يحتوي على طلاب، احذفهم أولاً' });
  db.prepare(`DELETE FROM classes WHERE id = ?`).run(id);
  res.json({ ok: true });
});

/* ====================== الطلاب المصرّح لهم ====================== */
app.get('/api/allowed-students', (req, res) => {
  const rows = db.prepare(`
    SELECT s.*, c.name AS class_name
    FROM allowed_students s
    LEFT JOIN classes c ON c.id = s.class_id
    ORDER BY s.name ASC
  `).all();
  res.json(rows);
});

app.post('/api/allowed-students', (req, res) => {
  const { name, email, added_by, class_id } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'الاسم مطلوب' });
  try {
    const info = db.prepare(`INSERT INTO allowed_students (name, email, added_by, class_id) VALUES (?, ?, ?, ?)`)
      .run(name.trim(), (email || '').trim().toLowerCase() || null, added_by || null, class_id || null);
    res.json({ id: info.lastInsertRowid, ok: true });
  } catch (e) {
    if (String(e).includes('UNIQUE')) return res.status(400).json({ error: 'الاسم مُضاف مسبقاً' });
    res.status(500).json({ error: 'فشل الإضافة' });
  }
});

app.delete('/api/allowed-students/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'معرّف غير صالح' });
  db.prepare(`DELETE FROM allowed_students WHERE id = ?`).run(id);
  res.json({ ok: true });
});

/* ====================== الأسئلة ====================== */
app.post('/api/questions', (req, res) => {
  const b = req.body;
  if (!b.student_id) return res.status(400).json({ error: 'student_id مطلوب' });
  const stmt = db.prepare(`INSERT INTO questions (
    student_id, class_id, question_type, topic_text, topic_audio,
    understanding_text, understanding_audio,
    evidence_text, evidence_source, evidence_snippet,
    objection_text, objection_audio,
    problem_text, problem_audio,
    question_formulation,
    expected_answer_text, expected_answer_audio
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const info = stmt.run(
    b.student_id, b.class_id || null, b.question_type || 'new',
    b.topic_text || null, b.topic_audio || null,
    b.understanding_text || null, b.understanding_audio || null,
    b.evidence_text || null, b.evidence_source || null, b.evidence_snippet || null,
    b.objection_text || null, b.objection_audio || null,
    b.problem_text || null, b.problem_audio || null,
    b.question_formulation || null,
    b.expected_answer_text || null, b.expected_answer_audio || null
  );
  res.json({ id: info.lastInsertRowid, ok: true });
});

app.get('/api/questions', (req, res) => {
  const { student_id, class_id, status } = req.query;
  let sql = `
    SELECT q.*, u.name AS student_name, u.email AS student_email, c.name AS class_name
    FROM questions q
    JOIN users u ON u.id = q.student_id
    LEFT JOIN classes c ON c.id = q.class_id
    WHERE 1=1
  `;
  const params = [];
  if (student_id) { sql += ` AND q.student_id = ?`; params.push(student_id); }
  if (class_id) { sql += ` AND q.class_id = ?`; params.push(class_id); }
  if (status) { sql += ` AND q.status = ?`; params.push(status); }
  sql += ` ORDER BY q.created_at DESC`;
  const rows = db.prepare(sql).all(...params);

  const ansStmt = db.prepare(`
    SELECT a.*, u.name AS teacher_name FROM answers a
    JOIN users u ON u.id = a.teacher_id
    WHERE a.question_id = ? ORDER BY a.created_at DESC
  `);
  rows.forEach(r => { r.answers = ansStmt.all(r.id); });
  res.json(rows);
});

app.delete('/api/questions/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'معرّف غير صالح' });
  db.prepare(`DELETE FROM answers WHERE question_id = ?`).run(id);
  db.prepare(`DELETE FROM questions WHERE id = ?`).run(id);
  res.json({ ok: true });
});

/* ====================== الإجابات ====================== */
app.post('/api/answers', (req, res) => {
  const b = req.body;
  if (!b.question_id || !b.teacher_id) return res.status(400).json({ error: 'بيانات ناقصة' });
  const info = db.prepare(`INSERT INTO answers
    (question_id, teacher_id, answer_text, answer_audio, answer_video, is_live, room_link)
    VALUES (?,?,?,?,?,?,?)`).run(
      b.question_id, b.teacher_id,
      b.answer_text || null, b.answer_audio || null,
      b.answer_video || null, b.is_live ? 1 : 0, b.room_link || null
    );
  db.prepare(`UPDATE questions SET status = 'answered' WHERE id = ?`).run(b.question_id);
  res.json({ id: info.lastInsertRowid, ok: true });
});

/* ====================== الحصص المباشرة ====================== */
app.get('/api/live-sessions', (req, res) => {
  const rows = db.prepare(`
    SELECT s.*, u.name AS teacher_name, c.name AS class_name
    FROM live_sessions s
    JOIN users u ON u.id = s.teacher_id
    LEFT JOIN classes c ON c.id = s.class_id
    WHERE s.status = 'active'
    ORDER BY s.created_at DESC
  `).all();
  res.json(rows);
});

app.post('/api/live-sessions', (req, res) => {
  const { title, teacher_id, class_id, password } = req.body;
  if (!teacher_id) return res.status(400).json({ error: 'teacher_id مطلوب' });

  const roomName = 'edu-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  const roomLink = 'https://meet.jit.si/' + roomName;

  try {
    const info = db.prepare(`INSERT INTO live_sessions
      (room_name, room_link, password, teacher_id, class_id, title)
      VALUES (?, ?, ?, ?, ?, ?)`).run(
        roomName, roomLink, password || null,
        teacher_id, class_id || null, title || 'حصة مباشرة'
      );
    res.json({ id: info.lastInsertRowid, room_link: roomLink, password, ok: true });
  } catch (e) {
    res.status(500).json({ error: 'فشل الإنشاء' });
  }
});

app.delete('/api/live-sessions/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'معرّف غير صالح' });
  db.prepare(`UPDATE live_sessions SET status = 'ended', ended_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
  res.json({ ok: true });
});

/* ====================== البحث ====================== */
app.get('/api/search/quran', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ matches: [] });
  try {
    const r = await fetch(`https://api.alquran.cloud/v1/search/${encodeURIComponent(q)}/all/ar`);
    const data = await r.json();
    const matches = (data.data?.matches || []).slice(0, 25).map(m => ({
      text: m.text,
      reference: `${m.surah?.name || ''} - الآية ${m.numberInSurah}`
    }));
    res.json({ matches });
  } catch (e) { res.json({ matches: [], error: 'فشل البحث' }); }
});

app.get('/api/search/hadith', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ matches: [] });
  try {
    const r = await fetch(`https://dorar.net/dorar_api.json?skey=${encodeURIComponent(q)}`);
    const data = await r.json();
    res.json({ html: data.ahadith || '', matches: [] });
  } catch (e) { res.json({ matches: [], html: '', error: 'فشل البحث' }); }
});

/* ====================== الإحصائيات ====================== */
app.get('/api/stats', (req, res) => {
  try {
    const totalQuestions = db.prepare(`SELECT COUNT(*) AS c FROM questions`).get().c;
    const answeredQuestions = db.prepare(`SELECT COUNT(*) AS c FROM questions WHERE status = 'answered'`).get().c;
    const totalStudents = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE role = 'student'`).get().c;
    const allowedCount = db.prepare(`SELECT COUNT(*) AS c FROM allowed_students`).get().c;
    const classCount = db.prepare(`SELECT COUNT(*) AS c FROM classes`).get().c;
    const recordingsCount = db.prepare(`SELECT COUNT(*) AS c FROM recordings`).get().c;
    const recordingsSize = db.prepare(`SELECT COALESCE(SUM(size), 0) AS s FROM recordings`).get().s;
    const liveCount = db.prepare(`SELECT COUNT(*) AS c FROM live_sessions WHERE status = 'active'`).get().c;

    const topStudents = db.prepare(`
      SELECT u.name, COUNT(q.id) AS count
      FROM users u LEFT JOIN questions q ON q.student_id = u.id
      WHERE u.role = 'student'
      GROUP BY u.id ORDER BY count DESC LIMIT 5
    `).all();

    res.json({
      questions: totalQuestions, answered: answeredQuestions,
      pending: totalQuestions - answeredQuestions,
      students: totalStudents, allowed_students: allowedCount,
      classes: classCount,
      recordings: recordingsCount,
      recordings_size: recordingsSize,
      live_sessions: liveCount,
      top_students: topStudents
    });
  } catch (e) {
    console.error('Stats error:', e);
    res.status(500).json({ error: 'فشل جلب الإحصائيات' });
  }
});

/* ====================== النسخ الاحتياطي ====================== */
app.get('/api/backup', requireBackupToken, (req, res) => {
  const dbPath = path.join(__dirname, 'eduapp.db');
  if (!fs.existsSync(dbPath)) return res.status(404).json({ error: 'قاعدة البيانات غير موجودة' });
  res.download(dbPath, `eduapp-backup-${new Date().toISOString().slice(0, 10)}.db`);
});

/* ====================== معالجة الأخطاء ====================== */
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'الملف أكبر من الحد المسموح' });
  res.status(500).json({ error: 'خطأ داخلي في الخادم' });
});

app.listen(PORT, () => {
  console.log(`✅ الخادم يعمل على المنفذ ${PORT}`);
});
