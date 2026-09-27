/* ============ إعدادات النظام ============ */
app.get('/api/settings', (req, res) => {
  const rows = db.prepare('SELECT * FROM settings').all();
  const settings = {};
  rows.forEach(r => settings[r.key] = r.value);
  res.json(settings);
});

app.post('/api/settings', (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'key مطلوب' });
  db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`).run(key, String(value));
  res.json({ ok: true });
});

/* ============ الطلاب المسموح لهم ============ */
app.get('/api/allowed-students', (req, res) => {
  const rows = db.prepare(`SELECT * FROM allowed_students ORDER BY name ASC`).all();
  res.json(rows);
});

app.post('/api/allowed-students', (req, res) => {
  const { name, added_by } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'الاسم مطلوب' });
  try {
    const info = db.prepare(`INSERT INTO allowed_students (name, added_by) VALUES (?, ?)`)
      .run(name.trim(), added_by || null);
    res.json({ id: info.lastInsertRowid, ok: true });
  } catch (e) {
    if (String(e).includes('UNIQUE')) {
      return res.status(400).json({ error: 'الاسم مُضاف مسبقاً' });
    }
    res.status(500).json({ error: 'فشل الإضافة' });
  }
});

app.delete('/api/allowed-students/:id', (req, res) => {
  db.prepare(`DELETE FROM allowed_students WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

/* تعديل /api/login ليشمل التحقق من الصلاحيات */
app.post('/api/login', (req, res) => {
  const { name, role } = req.body;
  if (!name || !role) return res.status(400).json({ error: 'الاسم والدور مطلوبان' });

  // التحقق من الصلاحيات للطالب
  if (role === 'student') {
    const restrictSetting = db.prepare(`SELECT value FROM settings WHERE key = 'restrict_students'`).get();
    const isRestricted = restrictSetting && restrictSetting.value === '1';
    if (isRestricted) {
      const allowed = db.prepare(`SELECT * FROM allowed_students WHERE name = ?`).get(name.trim());
      if (!allowed) {
        return res.status(403).json({
          error: 'not_allowed',
          message: 'عذراً، لم يُصرّح لك بالتسجيل. تواصل مع الأستاذ.'
        });
      }
    }
  }

  let user = db.prepare('SELECT * FROM users WHERE name = ? AND role = ?').get(name, role);
  if (!user) {
    const info = db.prepare('INSERT INTO users (name, role) VALUES (?, ?)').run(name, role);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  }
  res.json(user);
});
