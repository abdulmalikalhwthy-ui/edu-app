const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// مجلد الرفع
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.webm';
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2) + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadDir));
app.use(express.static(path.join(__dirname, 'public')));

/* ====================== تسجيل الدخول المبسط ====================== */
app.post('/api/login', (req, res) => {
  const { name, role } = req.body;
  if (!name || !role) return res.status(400).json({ error: 'الاسم والدور مطلوبان' });
  let user = db.prepare('SELECT * FROM users WHERE name = ? AND role = ?').get(name, role);
  if (!user) {
    const info = db.prepare('INSERT INTO users (name, role) VALUES (?, ?)').run(name, role);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  }
  res.json(user);
});

/* ====================== رفع الملفات ====================== */
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'لا يوجد ملف' });
  res.json({ url: '/uploads/' + req.file.filename });
});

/* ====================== الأسئلة ====================== */
app.post('/api/questions', (req, res) => {
  const b = req.body;
  if (!b.student_id) return res.status(400).json({ error: 'student_id مطلوب' });
  const stmt = db.prepare(`INSERT INTO questions (
    student_id, question_type, topic_text, topic_audio,
    understanding_text, understanding_audio,
    evidence_text, evidence_source, evidence_snippet,
    objection_text, objection_audio,
    problem_text, problem_audio,
    question_formulation,
    expected_answer_text, expected_answer_audio
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const info = stmt.run(
    b.student_id, b.question_type || 'new',
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
  const { student_id } = req.query;
  let rows;
  if (student_id) {
    rows = db.prepare(`SELECT q.*, u.name AS student_name FROM questions q
      JOIN users u ON u.id = q.student_id
      WHERE q.student_id = ?
      ORDER BY q.created_at DESC`).all(student_id);
  } else {
    rows = db.prepare(`SELECT q.*, u.name AS student_name FROM questions q
      JOIN users u ON u.id = q.student_id
      ORDER BY q.created_at DESC`).all();
  }
  const ansStmt = db.prepare(`SELECT a.*, u.name AS teacher_name FROM answers a
    JOIN users u ON u.id = a.teacher_id WHERE a.question_id = ? ORDER BY a.created_at DESC`);
  rows.forEach(r => { r.answers = ansStmt.all(r.id); });
  res.json(rows);
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
  db.prepare('UPDATE questions SET status = ? WHERE id = ?').run('answered', b.question_id);
  res.json({ id: info.lastInsertRowid, ok: true });
});

/* ====================== البحث في القرآن ====================== */
app.get('/api/search/quran', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ matches: [] });
  try {
    const url = `https://api.alquran.cloud/v1/search/${encodeURIComponent(q)}/all/ar`;
    const r = await fetch(url);
    const data = await r.json();
    const matches = (data.data?.matches || []).slice(0, 25).map(m => ({
      text: m.text,
      reference: `${m.surah?.name || ''} - الآية ${m.numberInSurah}`
    }));
    res.json({ matches });
  } catch (e) {
    res.json({ matches: [], error: 'فشل البحث' });
  }
});

/* ====================== البحث في الروايات ====================== */
app.get('/api/search/hadith', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ matches: [] });
  try {
    const url = `https://dorar.net/dorar_api.json?skey=${encodeURIComponent(q)}`;
    const r = await fetch(url);
    const data = await r.json();
    // dorar يعيد HTML، نعيده للواجهة لتعرضه
    res.json({ html: data.ahadith || '', matches: [] });
  } catch (e) {
    res.json({ matches: [], html: '', error: 'فشل البحث' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ الخادم يعمل على http://localhost:${PORT}`);
});
