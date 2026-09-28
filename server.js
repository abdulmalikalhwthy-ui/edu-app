/* ============================================================
   server.js — المنصة التعليمية الكاملة
   ============================================================ */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const webpush = require('web-push');
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

/* ====================== VAPID Setup ====================== */
let vapidPublicKey = '';

function initVapid() {
  try {
    let pub = db.prepare(`SELECT value FROM settings WHERE key = 'vapid_public'`).get();
    let priv = db.prepare(`SELECT value FROM settings WHERE key = 'vapid_private'`).get();

    if (!pub || !priv || !pub.value || !priv.value) {
      const keys = webpush.generateVAPIDKeys();
      db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('vapid_public', ?)`).run(keys.publicKey);
      db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('vapid_private', ?)`).run(keys.privateKey);
      vapidPublicKey = keys.publicKey;
      webpush.setVapidDetails('mailto:admin@edu-app.local', keys.publicKey, keys.privateKey);
      console.log('✅ تم توليد VAPID keys جديدة');
    } else {
      vapidPublicKey = pub.value;
      webpush.setVapidDetails('mailto:admin@edu-app.local', pub.value, priv.value);
      console.log('✅ VAPID keys جاهزة');
    }
  } catch (e) {
    console.error('❌ خطأ VAPID:', e);
  }
}
initVapid();

/* ====================== Push Helpers ====================== */
async function sendPushToUser(userId, payload) {
  const subs = db.prepare(`SELECT * FROM push_subscriptions WHERE user_id = ?`).all(userId);
  const promises = subs.map(async (s) => {
    try {
      const subscription = JSON.parse(s.subscription_json);
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      return { ok: true, id: s.id };
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        db.prepare(`DELETE FROM push_subscriptions WHERE id = ?`).run(s.id);
      }
      return { ok: false, id: s.id, error: err.message };
    }
  });
  return Promise.all(promises);
}

async function sendPushToAllStudents(payload, classId) {
  let students;
  if (classId) {
    students = db.prepare(`SELECT DISTINCT u.id FROM users u
      LEFT JOIN allowed_students a ON a.name = u.name
      WHERE u.role = 'student' AND (a.class_id = ? OR a.class_id IS NULL)`).all(classId);
  } else {
    students = db.prepare(`SELECT id FROM users WHERE role = 'student'`).all();
  }
  const results = [];
  for (const s of students) {
    const r = await sendPushToUser(s.id, payload);
    results.push({ user_id: s.id, results: r });
  }
  return results;
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
        return res.status(403).json({ error: 'not_allowed', message: 'عذراً، لم يُصرّح لك بالتسجيل.' });
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

/* ====================== Push Endpoints ====================== */
app.get('/api/push/vapid-public-key', (req, res) => {
  res.json({ publicKey: vapidPublicKey });
});

app.post('/api/push/subscribe', (req, res) => {
  const { user_id, subscription } = req.body;
  if (!user_id || !subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'بيانات ناقصة' });
  }
  try {
    db.prepare(`INSERT OR REPLACE INTO push_subscriptions
      (user_id, endpoint, subscription_json) VALUES (?, ?, ?)`).run(
        user_id, subscription.endpoint, JSON.stringify(subscription)
      );
    res.json({ ok: true });
  } catch (e) {
    console.error('Push subscribe error:', e);
    res.status(500).json({ error: 'فشل الحفظ' });
  }
});

app.post('/api/push/unsubscribe', (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'endpoint مطلوب' });
  db.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`).run(endpoint);
  res.json({ ok: true });
});

app.post('/api/push/test', async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id مطلوب' });
  const results = await sendPushToUser(user_id, {
    title: '🔔 اختبار',
    body: 'إذا قرأت هذا، الإشعارات تعمل!',
    url: '/student.html'
  });
  res.json({ results });
});

/* ====================== المكالمات ====================== */
app.get('/api/contacts', (req, res) => {
  const { user_id, role } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id مطلوب' });

  let rows;
  if (role === 'teacher') {
    rows = db.prepare(`
      SELECT DISTINCT id, name, email, role, created_at
      FROM users
      WHERE role = 'student' AND id != ?
      ORDER BY name ASC
    `).all(user_id);
  } else {
    rows = db.prepare(`
      SELECT DISTINCT id, name, email, role, created_at
      FROM users
      WHERE id != ?
      ORDER BY role DESC, name ASC
    `).all(user_id);
  }
  res.json(rows);
});

app.post('/api/calls/initiate', async (req, res) => {
  const { from_user_id, to_user_id, call_type } = req.body;
  if (!from_user_id || !to_user_id) {
    return res.status(400).json({ error: 'بيانات ناقصة' });
  }

  db.prepare(`
    UPDATE calls SET status = 'missed', ended_at = CURRENT_TIMESTAMP
    WHERE status = 'ringing' AND (from_user_id = ? OR to_user_id = ?)
  `).run(from_user_id, to_user_id);

  const roomName = 'edu-call-' + from_user_id + '-' + to_user_id + '-' + Date.now().toString(36);
  const roomLink = 'https://meet.jit.si/' + roomName;

  const fromUser = db.prepare(`SELECT name FROM users WHERE id = ?`).get(from_user_id);
  const toUser = db.prepare(`SELECT name FROM users WHERE id = ?`).get(to_user_id);

  try {
    const info = db.prepare(`
      INSERT INTO calls (from_user_id, to_user_id, room_name, room_link, call_type, status)
      VALUES (?, ?, ?, ?, ?, 'ringing')
    `).run(from_user_id, to_user_id, roomName, roomLink, call_type || 'video');

    db.prepare(`
      INSERT INTO notifications (student_id, type, message, related_id)
      VALUES (?, 'call', ?, ?)
    `).run(to_user_id, `📞 مكالمة ${call_type === 'audio' ? 'صوتية' : 'مرئية'} من ${fromUser?.name || 'مستخدم'}`, info.lastInsertRowid);

    sendPushToUser(to_user_id, {
      title: '📞 مكالمة واردة',
      body: `${fromUser?.name || 'مستخدم'} يتصل بك الآن`,
      type: 'call',
      url: '/',
      room_link: roomLink,
      call_id: info.lastInsertRowid,
      from_user_id,
      call_type: call_type || 'video'
    }).catch(e => console.error('Call push error:', e));

    res.json({
      id: info.lastInsertRowid,
      room_link: roomLink,
      room_name: roomName,
      ok: true
    });
  } catch (e) {
    console.error('Call initiate error:', e);
    res.status(500).json({ error: 'فشل الإنشاء' });
  }
});

app.get('/api/calls/pending', (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id مطلوب' });

  const rows = db.prepare(`
    SELECT c.*, u.name AS from_user_name, u.email AS from_user_email
    FROM calls c
    JOIN users u ON u.id = c.from_user_id
    WHERE c.to_user_id = ? AND c.status = 'ringing'
      AND c.created_at > datetime('now', '-60 seconds')
    ORDER BY c.created_at DESC
    LIMIT 1
  `).all(user_id);

  res.json(rows);
});

app.post('/api/calls/:id/answer', (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'معرّف غير صالح' });

  db.prepare(`
    UPDATE calls SET status = 'active', answered_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);

  const call = db.prepare(`SELECT * FROM calls WHERE id = ?`).get(id);
  res.json({ ok: true, call });
});

app.post('/api/calls/:id/reject', (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'معرّف غير صالح' });

  db.prepare(`
    UPDATE calls SET status = 'rejected', ended_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);

  res.json({ ok: true });
});

app.post('/api/calls/:id/end', (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'معرّف غير صالح' });

  db.prepare(`
    UPDATE calls SET status = 'ended', ended_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);

  res.json({ ok: true });
});

app.get('/api/calls/current', (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id مطلوب' });

  const call = db.prepare(`
    SELECT c.*, 
      u1.name AS from_user_name,
      u2.name AS to_user_name
    FROM calls c
    JOIN users u1 ON u1.id = c.from_user_id
    JOIN users u2 ON u2.id = c.to_user_id
    WHERE (c.from_user_id = ? OR c.to_user_id = ?)
      AND c.status IN ('ringing', 'active')
      AND c.created_at > datetime('now', '-5 minutes')
    ORDER BY c.created_at DESC
    LIMIT 1
  `).get(user_id, user_id);

  res.json(call || null);
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
  if (!rec) return res.status(404).json({ error: 'غير موجود' });
  const filePath = path.join(__dirname, rec.url);
  if (fs.existsSync(filePath)) { try { fs.unlinkSync(filePath); } catch (e) {} }
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
    if (String(e).includes('UNIQUE')) return res.status(400).json({ error: 'الاسم موجود' });
    res.status(500).json({ error: 'فشل' });
  }
});

app.delete('/api/classes/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'معرّف غير صالح' });
  const count = db.prepare(`SELECT COUNT(*) AS c FROM allowed_students WHERE class_id = ?`).get(id).c;
  if (count > 0) return res.status(400).json({ error: 'الفصل يحتوي على طلاب' });
  db.prepare(`DELETE FROM classes WHERE id = ?`).run(id);
  res.json({ ok: true });
});

/* ====================== الطلاب ====================== */
app.get('/api/allowed-students', (req, res) => {
  const rows = db.prepare(`
    SELECT s.*, c.name AS class_name FROM allowed_students s
    LEFT JOIN classes c ON c.id = s.class_id ORDER BY s.name ASC
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
    if (String(e).includes('UNIQUE')) return res.status(400).json({ error: 'مُضاف مسبقاً' });
    res.status(500).json({ error: 'فشل' });
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
    problem_text, problem_audio, question_formulation,
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
  let sql = `SELECT q.*, u.name AS student_name, u.email AS student_email, c.name AS class_name
    FROM questions q JOIN users u ON u.id = q.student_id
    LEFT JOIN classes c ON c.id = q.class_id WHERE 1=1`;
  const params = [];
  if (student_id) { sql += ` AND q.student_id = ?`; params.push(student_id); }
  if (class_id) { sql += ` AND q.class_id = ?`; params.push(class_id); }
  if (status) { sql += ` AND q.status = ?`; params.push(status); }
  sql += ` ORDER BY q.created_at DESC`;
  const rows = db.prepare(sql).all(...params);
  const ansStmt = db.prepare(`SELECT a.*, u.name AS teacher_name FROM answers a
    JOIN users u ON u.id = a.teacher_id WHERE a.question_id = ? ORDER BY a.created_at DESC`);
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
  const rows = db.prepare(`SELECT s.*, u.name AS teacher_name, c.name AS class_name
    FROM live_sessions s JOIN users u ON u.id = s.teacher_id
    LEFT JOIN classes c ON c.id = s.class_id
    WHERE s.status = 'active' ORDER BY s.created_at DESC`).all();
  res.json(rows);
});

app.post('/api/live-sessions', async (req, res) => {
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

    let students;
    if (class_id) {
      students = db.prepare(`SELECT DISTINCT u.id FROM users u
        LEFT JOIN allowed_students a ON a.name = u.name
        WHERE u.role = 'student' AND (a.class_id = ? OR a.class_id IS NULL)`).all(class_id);
    } else {
      students = db.prepare(`SELECT id FROM users WHERE role = 'student'`).all();
    }

    const notifStmt = db.prepare(`INSERT INTO notifications
      (student_id, type, message, related_id) VALUES (?, ?, ?, ?)`);
    students.forEach(s => {
      notifStmt.run(s.id, 'live_session', `🔴 الأستاذ بدأ حصة مباشرة: ${title || 'حصة'}`, info.lastInsertRowid);
    });

    const pushResults = await sendPushToAllStudents({
      title: '🔴 حصة مباشرة الآن!',
      body: `${title || 'حصة'} — انقر للانضمام`,
      type: 'live_session',
      url: '/student.html',
      room_link: roomLink,
      password: password || null
    }, class_id);

    res.json({
      id: info.lastInsertRowid,
      room_link: roomLink,
      password,
      notifications_sent: students.length,
      push_results: pushResults.length,
      ok: true
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'فشل: ' + e.message });
  }
});

app.delete('/api/live-sessions/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'معرّف غير صالح' });
  db.prepare(`UPDATE live_sessions SET status = 'ended', ended_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
  res.json({ ok: true });
});

/* ====================== الإشعارات ====================== */
app.get('/api/notifications', (req, res) => {
  const { student_id, unread_only } = req.query;
  if (!student_id) return res.status(400).json({ error: 'student_id مطلوب' });
  let sql = `SELECT * FROM notifications WHERE student_id = ?`;
  if (unread_only === '1') sql += ` AND is_read = 0`;
  sql += ` ORDER BY created_at DESC LIMIT 30`;
  res.json(db.prepare(sql).all(student_id));
});

app.post('/api/notifications/read/:id', (req, res) => {
  const id = parseInt(req.params.id);
  db.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ?`).run(id);
  res.json({ ok: true });
});

app.post('/api/notifications/read-all', (req, res) => {
  const { student_id } = req.body;
  if (!student_id) return res.status(400).json({ error: 'student_id مطلوب' });
  db.prepare(`UPDATE notifications SET is_read = 1 WHERE student_id = ?`).run(student_id);
  res.json({ ok: true });
});

/* ====================== الامتحانات ====================== */
app.get('/api/exams', (req, res) => {
  const { class_id, status } = req.query;
  let sql = `SELECT e.*, u.name AS teacher_name, c.name AS class_name
    FROM exams e JOIN users u ON u.id = e.teacher_id
    LEFT JOIN classes c ON c.id = e.class_id WHERE 1=1`;
  const params = [];
  if (class_id) { sql += ` AND e.class_id = ?`; params.push(class_id); }
  if (status) { sql += ` AND e.status = ?`; params.push(status); }
  sql += ` ORDER BY e.created_at DESC`;
  res.json(db.prepare(sql).all(...params));
});

app.get('/api/exams/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'معرّف غير صالح' });
  const exam = db.prepare(`SELECT e.*, c.name AS class_name FROM exams e
    LEFT JOIN classes c ON c.id = e.class_id WHERE e.id = ?`).get(id);
  if (!exam) return res.status(404).json({ error: 'غير موجود' });
  exam.questions = db.prepare(`SELECT * FROM exam_questions WHERE exam_id = ? ORDER BY order_index ASC, id ASC`).all(id);
  exam.questions.forEach(q => {
    if (q.options_json) { try { q.options = JSON.parse(q.options_json); } catch (e) { q.options = []; } }
  });
  res.json(exam);
});

app.post('/api/exams', (req, res) => {
  const { title, description, class_id, teacher_id, duration_minutes, questions } = req.body;
  if (!title || !teacher_id) return res.status(400).json({ error: 'العنوان والأستاذ مطلوبان' });
  if (!Array.isArray(questions) || questions.length === 0) return res.status(400).json({ error: 'أضف سؤالاً' });

  const totalPoints = questions.reduce((sum, q) => sum + (parseInt(q.points) || 1), 0);

  try {
    const info = db.prepare(`INSERT INTO exams
      (title, description, class_id, teacher_id, duration_minutes, total_points, status)
      VALUES (?, ?, ?, ?, ?, ?, 'published')`).run(
        title.trim(), description || null,
        class_id || null, teacher_id,
        parseInt(duration_minutes) || 30,
        totalPoints
      );

    const examId = info.lastInsertRowid;
    const qStmt = db.prepare(`INSERT INTO exam_questions
      (exam_id, order_index, question_text, question_type, options_json, correct_answer, points)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);

    questions.forEach((q, i) => {
      qStmt.run(
        examId, i,
        q.question_text, q.question_type || 'mcq',
        q.options ? JSON.stringify(q.options) : null,
        q.correct_answer || null,
        parseInt(q.points) || 1
      );
    });

    const students = db.prepare(`SELECT id FROM users WHERE role = 'student'`).all();
    const notifStmt = db.prepare(`INSERT INTO notifications
      (student_id, type, message, related_id) VALUES (?, ?, ?, ?)`);
    students.forEach(s => {
      notifStmt.run(s.id, 'exam', `📝 امتحان جديد: ${title}`, examId);
    });

    sendPushToAllStudents({
      title: '📝 امتحان جديد',
      body: title,
      type: 'exam',
      url: '/student.html'
    }, class_id).catch(e => console.error('Push exam error:', e));

    res.json({ id: examId, ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'فشل: ' + e.message });
  }
});

app.delete('/api/exams/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'معرّف غير صالح' });
  db.prepare(`DELETE FROM exam_questions WHERE exam_id = ?`).run(id);
  db.prepare(`DELETE FROM exam_attempts WHERE exam_id = ?`).run(id);
  db.prepare(`DELETE FROM exams WHERE id = ?`).run(id);
  res.json({ ok: true });
});

app.post('/api/exams/:id/attempt', (req, res) => {
  const examId = parseInt(req.params.id);
  const { student_id, answers } = req.body;
  if (!examId || !student_id) return res.status(400).json({ error: 'بيانات ناقصة' });

  const existing = db.prepare(`SELECT * FROM exam_attempts WHERE exam_id = ? AND student_id = ? AND submitted_at IS NOT NULL`).get(examId, student_id);
  if (existing) return res.status(400).json({ error: 'قدّمت الامتحان مسبقاً' });

  const questions = db.prepare(`SELECT * FROM exam_questions WHERE exam_id = ? ORDER BY id ASC`).all(examId);
  let score = 0, maxScore = 0;

  questions.forEach(q => {
    maxScore += q.points;
    const studentAns = (answers[q.id] || '').toString().trim();
    if (q.question_type === 'mcq' || q.question_type === 'truefalse') {
      if (studentAns === (q.correct_answer || '').toString().trim()) score += q.points;
    }
  });

  const info = db.prepare(`INSERT INTO exam_attempts
    (exam_id, student_id, answers_json, score, max_score, submitted_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`).run(
      examId, student_id, JSON.stringify(answers), score, maxScore
    );

  res.json({ ok: true, score, max_score: maxScore, attempt_id: info.lastInsertRowid });
});

app.get('/api/exams/:id/attempts', (req, res) => {
  const examId = parseInt(req.params.id);
  if (!examId) return res.status(400).json({ error: 'معرّف غير صالح' });
  const rows = db.prepare(`SELECT a.*, u.name AS student_name, u.email AS student_email
    FROM exam_attempts a JOIN users u ON u.id = a.student_id
    WHERE a.exam_id = ? ORDER BY a.submitted_at DESC`).all(examId);
  res.json(rows);
});

app.get('/api/exams/:id/my-attempt', (req, res) => {
  const examId = parseInt(req.params.id);
  const { student_id } = req.query;
  if (!examId || !student_id) return res.status(400).json({ error: 'بيانات ناقصة' });
  const attempt = db.prepare(`SELECT * FROM exam_attempts WHERE exam_id = ? AND student_id = ? AND submitted_at IS NOT NULL`).get(examId, student_id);
  res.json(attempt || null);
});

/* ====================== الاستطلاعات ====================== */
app.get('/api/polls', (req, res) => {
  const { class_id, status } = req.query;
  let sql = `SELECT p.*, u.name AS teacher_name, c.name AS class_name
    FROM polls p JOIN users u ON u.id = p.teacher_id
    LEFT JOIN classes c ON c.id = p.class_id WHERE 1=1`;
  const params = [];
  if (class_id) { sql += ` AND p.class_id = ?`; params.push(class_id); }
  if (status) { sql += ` AND p.status = ?`; params.push(status); }
  sql += ` ORDER BY p.created_at DESC`;
  const rows = db.prepare(sql).all(...params);
  rows.forEach(p => { try { p.options = JSON.parse(p.options_json); } catch (e) { p.options = []; } });
  res.json(rows);
});

app.get('/api/polls/:id/results', (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'معرّف غير صالح' });
  const poll = db.prepare(`SELECT * FROM polls WHERE id = ?`).get(id);
  if (!poll) return res.status(404).json({ error: 'غير موجود' });
  let options = [];
  try { options = JSON.parse(poll.options_json); } catch (e) { options = []; }

  const votes = db.prepare(`SELECT choice_index, COUNT(*) AS count FROM poll_votes
    WHERE poll_id = ? GROUP BY choice_index`).all(id);

  const results = options.map((label, i) => ({
    label, index: i,
    count: (votes.find(v => v.choice_index === i) || {}).count || 0
  }));

  const totalVotes = results.reduce((sum, r) => sum + r.count, 0);
  res.json({ poll, results, total_votes: totalVotes });
});

app.post('/api/polls', (req, res) => {
  const { question, options, class_id, teacher_id } = req.body;
  if (!question || !teacher_id) return res.status(400).json({ error: 'السؤال والأستاذ مطلوبان' });
  if (!Array.isArray(options) || options.length < 2) return res.status(400).json({ error: 'أضف خيارين' });

  try {
    const info = db.prepare(`INSERT INTO polls
      (question, options_json, class_id, teacher_id) VALUES (?, ?, ?, ?)`).run(
        question.trim(), JSON.stringify(options), class_id || null, teacher_id
      );

    const students = db.prepare(`SELECT id FROM users WHERE role = 'student'`).all();
    const notifStmt = db.prepare(`INSERT INTO notifications
      (student_id, type, message, related_id) VALUES (?, ?, ?, ?)`);
    students.forEach(s => {
      notifStmt.run(s.id, 'poll', `📊 استطلاع جديد: ${question}`, info.lastInsertRowid);
    });

    sendPushToAllStudents({
      title: '📊 استطلاع جديد',
      body: question,
      type: 'poll',
      url: '/student.html'
    }, class_id).catch(e => console.error('Push poll error:', e));

    res.json({ id: info.lastInsertRowid, ok: true });
  } catch (e) {
    res.status(500).json({ error: 'فشل' });
  }
});

app.post('/api/polls/:id/vote', (req, res) => {
  const pollId = parseInt(req.params.id);
  const { student_id, choice_index } = req.body;
  if (!pollId || !student_id) return res.status(400).json({ error: 'بيانات ناقصة' });

  const poll = db.prepare(`SELECT * FROM polls WHERE id = ?`).get(pollId);
  if (!poll || poll.status !== 'active') return res.status(400).json({ error: 'غير نشط' });

  try {
    db.prepare(`INSERT INTO poll_votes (poll_id, student_id, choice_index) VALUES (?, ?, ?)`)
      .run(pollId, student_id, parseInt(choice_index));
    res.json({ ok: true });
  } catch (e) {
    if (String(e).includes('UNIQUE')) return res.status(400).json({ error: 'صوّت مسبقاً' });
    res.status(500).json({ error: 'فشل' });
  }
});

app.get('/api/polls/:id/my-vote', (req, res) => {
  const pollId = parseInt(req.params.id);
  const { student_id } = req.query;
  if (!pollId || !student_id) return res.status(400).json({ error: 'بيانات ناقصة' });
  const vote = db.prepare(`SELECT * FROM poll_votes WHERE poll_id = ? AND student_id = ?`).get(pollId, student_id);
  res.json(vote || null);
});

app.delete('/api/polls/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'معرّف غير صالح' });
  db.prepare(`UPDATE polls SET status = 'ended', ended_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
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
      text: m.text, reference: `${m.surah?.name || ''} - الآية ${m.numberInSurah}`
    }));
    res.json({ matches });
  } catch (e) { res.json({ matches: [], error: 'فشل' }); }
});

app.get('/api/search/hadith', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ matches: [] });
  try {
    const r = await fetch(`https://dorar.net/dorar_api.json?skey=${encodeURIComponent(q)}`);
    const data = await r.json();
    res.json({ html: data.ahadith || '', matches: [] });
  } catch (e) { res.json({ matches: [], html: '', error: 'فشل' }); }
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
    const examCount = db.prepare(`SELECT COUNT(*) AS c FROM exams`).get().c;
    const pollCount = db.prepare(`SELECT COUNT(*) AS c FROM polls WHERE status = 'active'`).get().c;
    const pushCount = db.prepare(`SELECT COUNT(*) AS c FROM push_subscriptions`).get().c;
    const callsCount = db.prepare(`SELECT COUNT(*) AS c FROM calls`).get().c;

    const topStudents = db.prepare(`SELECT u.name, COUNT(q.id) AS count
      FROM users u LEFT JOIN questions q ON q.student_id = u.id
      WHERE u.role = 'student' GROUP BY u.id ORDER BY count DESC LIMIT 5`).all();

    res.json({
      questions: totalQuestions, answered: answeredQuestions,
      pending: totalQuestions - answeredQuestions,
      students: totalStudents, allowed_students: allowedCount, classes: classCount,
      recordings: recordingsCount, recordings_size: recordingsSize,
      live_sessions: liveCount, exams: examCount, polls: pollCount,
      push_subscriptions: pushCount, calls: callsCount,
      top_students: topStudents
    });
  } catch (e) {
    res.status(500).json({ error: 'فشل' });
  }
});

/* ====================== النسخ الاحتياطي ====================== */
app.get('/api/backup', (req, res) => {
  const token = req.headers['x-backup-token'] || req.query.token;
  const validToken = process.env.BACKUP_TOKEN;
  if (!validToken) return res.status(500).json({ error: 'BACKUP_TOKEN غير مضبوط' });
  if (token !== validToken) return res.status(401).json({ error: 'رمز غير صالح' });
  const dbPath = path.join(__dirname, 'eduapp.db');
  if (!fs.existsSync(dbPath)) return res.status(404).json({ error: 'غير موجود' });
  res.download(dbPath, `eduapp-backup-${new Date().toISOString().slice(0, 10)}.db`);
});

/* ====================== معالجة الأخطاء ====================== */
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'الملف كبير' });
  res.status(500).json({ error: 'خطأ داخلي' });
});

app.listen(PORT, () => {
  console.log(`✅ الخادم يعمل على المنفذ ${PORT}`);
});
