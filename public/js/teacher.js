/* ============================================================
   teacher.js — نسخة مطوّرة كاملة
   ============================================================ */

const user = JSON.parse(localStorage.getItem('user') || 'null');
if (!user || user.role !== 'teacher') window.location.href = 'index.html';

document.getElementById('user-name').textContent = '👤 ' + user.name;
document.getElementById('logout').onclick = (e) => {
  e.preventDefault();
  localStorage.removeItem('user');
  window.location.href = 'index.html';
};

let allClasses = [];

/* ============================================================
   الأسئلة
   ============================================================ */
async function loadQuestions() {
  const classId = document.getElementById('filter-class').value;
  const status = document.getElementById('filter-status').value;
  let url = '/api/questions?';
  if (classId) url += `class_id=${classId}&`;
  if (status) url += `status=${status}&`;

  const r = await fetch(url);
  const list = await r.json();
  const container = document.getElementById('questions-list');
  if (!list.length) {
    container.innerHTML = '<div class="card" style="text-align:center;padding:30px">لا توجد أسئلة.</div>';
    return;
  }
  container.innerHTML = '';
  list.forEach(q => {
    const div = document.createElement('div');
    div.className = 'question-item';
    div.innerHTML = `
      <h3>${q.question_formulation || q.topic_text || 'سؤال بدون عنوان'}
        <span class="badge ${q.status}">${q.status === 'answered' ? 'تم الرد' : 'قيد الانتظار'}</span>
      </h3>
      <div class="meta">👨‍🎓 ${q.student_name} ${q.student_email ? '• 📧 ' + q.student_email : ''}</div>
      <div class="meta">📅 ${new Date(q.created_at).toLocaleString('ar-EG')}</div>
      ${q.class_name ? `<div class="meta">📚 ${q.class_name}</div>` : ''}
    `;
    div.onclick = () => openQuestionModal(q);
    container.appendChild(div);
  });
}

function openQuestionModal(q) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <h2>سؤال من: ${q.student_name}</h2>
      <div id="modal-details"></div>
      <hr style="margin:16px 0; border:none; border-top:2px solid var(--border)">
      <h2>✍️ الرد على السؤال</h2>
      <div class="field">
        <label>الرد الكتابي</label>
        <textarea id="answer-text" rows="4" placeholder="اكتب ردك..."></textarea>
      </div>
      <div class="field">
        <label>🎙️ تسجيل صوتي</label>
        <button type="button" class="btn-toggle-audio" id="toggle-audio-answer">إظهار/إخفاء المسجل</button>
        <div id="answer-audio-container" style="display:none; margin-top:10px"></div>
      </div>
      <div class="field">
        <label>🎥 تسجيل مرئي</label>
        <button type="button" class="btn-toggle-audio" id="toggle-video-answer">إظهار/إخفاء المسجل</button>
        <div id="answer-video-container" style="display:none; margin-top:10px"></div>
      </div>
      <div class="modal-actions">
        <button id="export-pdf" class="btn-search">📄 PDF</button>
        <button id="send-answer" class="btn-submit" style="flex:1">📤 إرسال الرد</button>
        <button id="close-modal" class="btn-danger">إغلاق</button>
      </div>
      <div id="answer-status" style="text-align:center; margin-top:10px"></div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const details = backdrop.querySelector('#modal-details');
  const fieldMap = [
    ['نوع السؤال', q.question_type === 'new' ? 'جديد' : 'ناتج درس سابق'],
    ['موضوع السؤال', q.topic_text, q.topic_audio],
    ['فهم الموضوع السابق', q.understanding_text, q.understanding_audio],
    ['دليل الموضوع', q.evidence_text],
    ['شاهد السؤال من الدليل', q.evidence_snippet],
    ['نقطة الاعتراض', q.objection_text, q.objection_audio],
    ['الإشكال القائم', q.problem_text, q.problem_audio],
    ['صيغة سؤال الإشكال', q.question_formulation],
    ['الإجابة المفترض سماعها', q.expected_answer_text, q.expected_answer_audio]
  ];
  fieldMap.forEach(([label, text, audio]) => {
    if (!text && !audio) return;
    details.insertAdjacentHTML('beforeend', `
      <div class="field">
        <label>${label}</label>
        ${text ? `<div style="background:#f8fafc; padding:12px; border-radius:10px; border:1px solid var(--border)">${text}</div>` : ''}
        ${audio ? renderMedia(audio, 'audio') : ''}
      </div>
    `);
  });

  if (q.answers && q.answers.length) {
    details.insertAdjacentHTML('beforeend', `<h3 style="margin-top:16px; color:var(--primary-dark)">الردود السابقة:</h3>`);
    q.answers.forEach(a => {
      details.insertAdjacentHTML('beforeend', `
        <div class="answer-block">
          ${a.answer_text ? `<p>${a.answer_text}</p>` : ''}
          ${a.answer_audio ? renderMedia(a.answer_audio, 'audio') : ''}
          ${a.answer_video ? renderMedia(a.answer_video, 'video') : ''}
          <div class="meta">${new Date(a.created_at).toLocaleString('ar-EG')}</div>
        </div>
      `);
    });
  }

  let answerAudioUrl = null, answerVideoUrl = null;

  backdrop.querySelector('#toggle-audio-answer').onclick = () => {
    const c = backdrop.querySelector('#answer-audio-container');
    if (c.style.display === 'none') {
      c.style.display = 'block';
      if (!c.dataset.init) {
        c.dataset.init = '1';
        new MediaRecorderHelper(c, {
          video: false,
          onComplete: (url) => { answerAudioUrl = url; showToast('✅ تم رفع الصوت'); }
        });
      }
    } else c.style.display = 'none';
  };

  backdrop.querySelector('#toggle-video-answer').onclick = () => {
    const c = backdrop.querySelector('#answer-video-container');
    if (c.style.display === 'none') {
      c.style.display = 'block';
      if (!c.dataset.init) {
        c.dataset.init = '1';
        new MediaRecorderHelper(c, {
          video: true,
          onComplete: (url) => { answerVideoUrl = url; showToast('✅ تم رفع الفيديو'); }
        });
      }
    } else c.style.display = 'none';
  };

  backdrop.querySelector('#close-modal').onclick = () => backdrop.remove();
  backdrop.querySelector('#export-pdf').onclick = () => exportQuestionPDF(q);

  backdrop.querySelector('#send-answer').onclick = async () => {
    const status = backdrop.querySelector('#answer-status');
    const answer_text = backdrop.querySelector('#answer-text').value.trim();
    if (!answer_text && !answerAudioUrl && !answerVideoUrl) {
      status.textContent = '❌ أدخل رداً واحداً على الأقل';
      status.style.color = 'var(--danger)';
      return;
    }
    status.textContent = '⏳ جاري الإرسال...';
    try {
      const r = await fetch('/api/answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: q.id, teacher_id: user.id,
          answer_text: answer_text || null,
          answer_audio: answerAudioUrl, answer_video: answerVideoUrl
        })
      });
      const data = await r.json();
      if (data.ok) {
        status.textContent = '✅ تم إرسال الرد';
        status.style.color = 'var(--success)';
        showToast('✅ تم إرسال الرد');
        setTimeout(() => { backdrop.remove(); loadQuestions(); }, 700);
      }
    } catch (e) {
      status.textContent = '❌ فشل الإرسال';
      status.style.color = 'var(--danger)';
    }
  };
}

function renderMedia(url, type) {
  const dlAttr = `download`;
  return `
    <div style="margin-top:8px">
      ${type === 'audio'
        ? `<audio controls src="${url}" style="width:100%; border-radius:10px"></audio>`
        : `<video controls src="${url}" style="width:100%; border-radius:10px"></video>`}
      <a href="${url}" ${dlAttr} class="btn-search" style="display:inline-block; margin-top:6px; text-decoration:none; color:var(--primary-dark)">
        ⬇️ تنزيل
      </a>
    </div>
  `;
}

/* ============================================================
   تصدير PDF
   ============================================================ */
function exportQuestionPDF(q) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setFontSize(18);
  doc.text('Question Report', 105, 15, { align: 'center' });
  doc.setFontSize(11);
  doc.text('Student: ' + (q.student_name || ''), 15, 30);
  doc.text('Date: ' + new Date(q.created_at).toLocaleString(), 15, 37);
  if (q.class_name) doc.text('Class: ' + q.class_name, 15, 44);

  let y = 55;
  const items = [
    ['Type', q.question_type === 'new' ? 'New' : 'Previous'],
    ['Topic', q.topic_text],
    ['Understanding', q.understanding_text],
    ['Evidence', q.evidence_text],
    ['Snippet', q.evidence_snippet],
    ['Objection', q.objection_text],
    ['Problem', q.problem_text],
    ['Formulation', q.question_formulation],
    ['Expected', q.expected_answer_text]
  ];
  items.forEach(([label, value]) => {
    if (!value) return;
    doc.setFontSize(11); doc.setFont(undefined, 'bold');
    doc.text(label + ':', 15, y); y += 6;
    doc.setFont(undefined, 'normal');
    const lines = doc.splitTextToSize(value, 180);
    doc.text(lines, 15, y);
    y += lines.length * 6 + 4;
    if (y > 270) { doc.addPage(); y = 20; }
  });
  doc.save(`question-${q.id}.pdf`);
  showToast('📄 تم تصدير PDF');
}

/* ============================================================
   الحصص المباشرة
   ============================================================ */
async function loadLiveSessions() {
  const r = await fetch('/api/live-sessions');
  const list = await r.json();
  const container = document.getElementById('live-sessions-list');
  if (!list.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--text-light);padding:20px">لا توجد حصص نشطة حالياً</div>';
    return;
  }
  container.innerHTML = '';
  list.forEach(s => {
    const div = document.createElement('div');
    div.className = 'question-item';
    div.innerHTML = `
      <h3>🔴 ${s.title}
        <span class="badge answered">نشطة</span>
      </h3>
      <div class="meta">👨‍🏫 ${s.teacher_name}</div>
      ${s.class_name ? `<div class="meta">📚 ${s.class_name}</div>` : ''}
      <div class="meta">📅 ${new Date(s.created_at).toLocaleString('ar-EG')}</div>
      ${s.password ? `<div class="meta">🔐 كلمة المرور: <b style="color:var(--danger); font-family:monospace">${s.password}</b></div>` : ''}
      <div class="modal-actions" style="margin-top:10px">
        <a href="${s.room_link}${s.password ? '#config.callPassword=' + encodeURIComponent(s.password) : ''}" target="_blank" class="btn-submit" style="text-decoration:none; text-align:center; padding:10px">🚪 دخول القاعة</a>
        <button class="btn-danger end-live" data-id="${s.id}" type="button">⏹️ إنهاء</button>
      </div>
    `;
    div.querySelector('.end-live').onclick = async (e) => {
      e.stopPropagation();
      if (!confirm('إنهاء هذه الحصة؟')) return;
      await fetch('/api/live-sessions/' + s.id, { method: 'DELETE' });
      showToast('✅ تم إنهاء الحصة');
      loadLiveSessions();
    };
    container.appendChild(div);
  });
}

document.getElementById('create-live-btn').onclick = async () => {
  const title = document.getElementById('live-title').value.trim();
  const classId = document.getElementById('live-class').value;
  const password = document.getElementById('live-password').value.trim();
  const status = document.getElementById('live-create-status');

  if (!title) {
    status.textContent = '⚠️ اكتب عنوان الحصة';
    status.style.color = 'var(--warning)';
    return;
  }

  status.textContent = '⏳ جاري الإنشاء...';
  status.style.color = 'var(--text-light)';

  try {
    const r = await fetch('/api/live-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title, teacher_id: user.id,
        class_id: classId ? parseInt(classId) : null,
        password: password || null
      })
    });
    const data = await r.json();
    if (data.ok) {
      status.textContent = '✅ تم إنشاء الحصة!';
      status.style.color = 'var(--success)';
      showToast('✅ تم إنشاء الحصة');
      document.getElementById('live-title').value = '';
      document.getElementById('live-password').value = '';
      loadLiveSessions();
    } else {
      status.textContent = '❌ ' + (data.error || 'فشل');
      status.style.color = 'var(--danger)';
    }
  } catch (e) {
    status.textContent = '❌ فشل الاتصال';
    status.style.color = 'var(--danger)';
  }
};

/* ============================================================
   التسجيلات
   ============================================================ */
async function loadRecordings() {
  const r = await fetch('/api/recordings');
  const list = await r.json();
  const container = document.getElementById('recordings-list');

  if (!list.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--text-light);padding:20px">لا توجد تسجيلات</div>';
    return;
  }

  const totalSize = list.reduce((acc, r) => acc + (r.size || 0), 0);
  container.innerHTML = `<div style="text-align:center;color:var(--text-light);margin-bottom:12px;font-size:.85rem">
    📦 ${list.length} تسجيل — الحجم الكلي: ${(totalSize / 1024).toFixed(1)} KB
  </div>`;

  list.forEach(rec => {
    const div = document.createElement('div');
    div.className = 'question-item';
    const isVideo = (rec.mimetype || '').includes('video');
    div.innerHTML = `
      <h3>${isVideo ? '🎥' : '🎙️'} ${rec.filename.slice(0, 30)}...
        <span class="badge ${rec.kind === 'audio' ? 'pending' : 'answered'}">${rec.kind === 'audio' ? 'صوتي' : 'مرئي'}</span>
      </h3>
      <div class="meta">👤 ${rec.uploader_name || 'غير معروف'}</div>
      <div class="meta">📅 ${new Date(rec.created_at).toLocaleString('ar-EG')}</div>
      <div class="meta">📦 ${(rec.size / 1024).toFixed(1)} KB</div>
      ${rec.question_id ? `<div class="meta">📝 سؤال رقم: ${rec.question_id}</div>` : ''}
      ${rec.answer_id ? `<div class="meta">💬 إجابة رقم: ${rec.answer_id}</div>` : ''}
      <div style="margin-top:8px">
        ${isVideo
          ? `<video controls src="${rec.url}" style="width:100%; border-radius:8px; max-height:180px"></video>`
          : `<audio controls src="${rec.url}" style="width:100%"></audio>`}
      </div>
      <div class="modal-actions" style="margin-top:10px">
        <a href="${rec.url}" download class="btn-search" style="text-decoration:none; padding:8px 14px">⬇️ تنزيل</a>
        <button class="btn-danger delete-rec" data-id="${rec.id}" data-url="${rec.url}" type="button">🗑️ حذف</button>
      </div>
    `;
    div.querySelector('.delete-rec').onclick = async (e) => {
      e.stopPropagation();
      if (!confirm('حذف هذا التسجيل نهائياً من السيرفر؟')) return;
      const id = e.target.dataset.id;
      const resp = await fetch('/api/recordings/' + id, { method: 'DELETE' });
      const data = await resp.json();
      if (data.ok) {
        showToast('✅ تم الحذف');
        loadRecordings();
      } else {
        showToast('❌ فشل الحذف');
      }
    };
    container.appendChild(div);
  });
}

/* ============================================================
   الطلاب
   ============================================================ */
async function loadStudents() {
  const r = await fetch('/api/allowed-students');
  const list = await r.json();
  document.getElementById('students-count').textContent = list.length;
  const container = document.getElementById('students-list');
  if (!list.length) {
    container.innerHTML = '<div style="text-align:center; color:var(--text-light); padding:20px">لا يوجد طلاب</div>';
    return;
  }
  container.innerHTML = '';
  list.forEach(s => {
    const div = document.createElement('div');
    div.className = 'student-row';
    div.innerHTML = `
      <div style="flex:1">
        <div class="student-name">👨‍🎓 ${s.name}</div>
        ${s.email ? `<div class="student-meta">📧 ${s.email}</div>` : ''}
        <div class="student-meta">${s.class_name ? '📚 ' + s.class_name + ' • ' : ''}📅 ${new Date(s.created_at).toLocaleDateString('ar-EG')}</div>
      </div>
      <button class="remove-btn" data-id="${s.id}" type="button">🗑️</button>
    `;
    div.querySelector('.remove-btn').onclick = async (e) => {
      e.stopPropagation();
      if (!confirm(`حذف "${s.name}"؟`)) return;
      await fetch('/api/allowed-students/' + s.id, { method: 'DELETE' });
      showToast('✅ تم الحذف');
      loadStudents();
    };
    container.appendChild(div);
  });
}

async function loadSettings() {
  const r = await fetch('/api/settings');
  const s = await r.json();
  document.getElementById('restrict-toggle').checked = s.restrict_students === '1';
  document.getElementById('teacher-code-input').value = s.teacher_code || '';
}

document.getElementById('restrict-toggle').onchange = async (e) => {
  await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'restrict_students', value: e.target.checked ? '1' : '0' })
  });
  showToast(e.target.checked ? '🔒 تم التفعيل' : '🔓 تم الفتح');
};

document.getElementById('save-code-btn').onclick = async () => {
  const code = document.getElementById('teacher-code-input').value.trim();
  await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'teacher_code', value: code })
  });
  const status = document.getElementById('code-status');
  if (code) {
    status.textContent = '✅ تم تفعيل حماية الرمز';
    status.style.color = 'var(--success)';
  } else {
    status.textContent = '🔓 تم إلغاء الحماية';
    status.style.color = 'var(--warning)';
  }
  showToast('✅ تم الحفظ');
};

document.getElementById('add-student-btn').onclick = async () => {
  const nameInput = document.getElementById('new-student-name');
  const emailInput = document.getElementById('new-student-email');
  const classSelect = document.getElementById('new-student-class');
  const name = nameInput.value.trim();
  const email = emailInput.value.trim();
  if (!name) return showToast('اكتب اسم الطالب');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showToast('البريد غير صحيح');

  const r = await fetch('/api/allowed-students', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name, email: email || null,
      added_by: user.id,
      class_id: classSelect.value ? parseInt(classSelect.value) : null
    })
  });
  const data = await r.json();
  if (data.ok) {
    showToast('✅ تمت الإضافة');
    nameInput.value = '';
    emailInput.value = '';
    loadStudents();
  } else {
    showToast('❌ ' + (data.error || 'فشل'));
  }
};

/* ============================================================
   الفصول
   ============================================================ */
async function loadClasses() {
  const r = await fetch('/api/classes');
  allClasses = await r.json();
  document.getElementById('classes-count').textContent = allClasses.length;

  const container = document.getElementById('classes-list');
  container.innerHTML = '';
  if (!allClasses.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--text-light);padding:20px">لا توجد فصول</div>';
  } else {
    allClasses.forEach(c => {
      const div = document.createElement('div');
      div.className = 'student-row';
      div.innerHTML = `
        <div style="flex:1">
          <div class="student-name">📚 ${c.name}</div>
        </div>
        <button class="remove-btn" data-id="${c.id}" type="button">🗑️</button>
      `;
      div.querySelector('.remove-btn').onclick = async (e) => {
        e.stopPropagation();
        if (!confirm(`حذف "${c.name}"؟`)) return;
        const r = await fetch('/api/classes/' + c.id, { method: 'DELETE' });
        const data = await r.json();
        if (data.ok) { showToast('✅ تم الحذف'); loadClasses(); }
        else showToast('❌ ' + (data.error || 'فشل'));
      };
      container.appendChild(div);
    });
  }

  const options = allClasses.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  document.getElementById('new-student-class').innerHTML = `<option value="">بدون فصل</option>${options}`;
  document.getElementById('filter-class').innerHTML = `<option value="">كل الفصول</option>${options}`;
  document.getElementById('live-class').innerHTML = `<option value="">كل الطلاب</option>${options}`;
}

document.getElementById('add-class-btn').onclick = async () => {
  const input = document.getElementById('new-class-name');
  const name = input.value.trim();
  if (!name) return showToast('اكتب اسم الفصل');
  const r = await fetch('/api/classes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  const data = await r.json();
  if (data.ok) { showToast('✅ تمت الإضافة'); input.value = ''; loadClasses(); }
  else showToast('❌ ' + (data.error || 'فشل'));
};

/* ============================================================
   الإحصائيات
   ============================================================ */
async function loadStats() {
  const r = await fetch('/api/stats');
  const s = await r.json();
  const container = document.getElementById('stats-content');
  container.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card blue"><div class="stat-value">${s.questions}</div><div class="stat-label">📋 الأسئلة</div></div>
      <div class="stat-card green"><div class="stat-value">${s.answered}</div><div class="stat-label">✅ تم الرد</div></div>
      <div class="stat-card orange"><div class="stat-value">${s.pending}</div><div class="stat-label">⏳ قيد الانتظار</div></div>
      <div class="stat-card purple"><div class="stat-value">${s.students}</div><div class="stat-label">👨‍🎓 الطلاب</div></div>
      <div class="stat-card teal"><div class="stat-value">${s.allowed_students}</div><div class="stat-label">✅ مصرّح لهم</div></div>
      <div class="stat-card pink"><div class="stat-value">${s.classes}</div><div class="stat-label">📚 الفصول</div></div>
      <div class="stat-card blue"><div class="stat-value">${s.recordings}</div><div class="stat-label">🎙️ التسجيلات</div></div>
      <div class="stat-card purple"><div class="stat-value">${(s.recordings_size / 1024 / 1024).toFixed(1)}</div><div class="stat-label">💾 مساحة (MB)</div></div>
      <div class="stat-card orange"><div class="stat-value">${s.live_sessions}</div><div class="stat-label">🔴 حصص نشطة</div></div>
    </div>
    <div class="card" style="margin-top:14px">
      <h2>🏆 أنشط الطلاب</h2>
      <div id="top-students"></div>
    </div>
  `;
  const topContainer = container.querySelector('#top-students');
  if (!s.top_students || !s.top_students.length) {
    topContainer.innerHTML = '<div style="text-align:center;color:var(--text-light);padding:20px">لا بيانات</div>';
  } else {
    s.top_students.forEach((st, i) => {
      const medal = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][i] || '▪️';
      topContainer.insertAdjacentHTML('beforeend', `
        <div class="student-row">
          <div style="flex:1"><div class="student-name">${medal} ${st.name}</div></div>
          <div class="badge answered">${st.count} سؤال</div>
        </div>
      `);
    });
  }
}

/* ============================================================
   التبويبات
   ============================================================ */
const tabs = ['questions', 'live', 'recordings', 'students', 'classes', 'search', 'stats'];
tabs.forEach(t => {
  document.getElementById('tab-' + t).onclick = () => {
    tabs.forEach(x => {
      document.getElementById('tab-' + x).classList.toggle('active', x === t);
      document.getElementById('view-' + x).style.display = x === t ? 'block' : 'none';
    });
    if (t === 'search' && !document.getElementById('teacher-search').dataset.init) {
      document.getElementById('teacher-search').dataset.init = '1';
      renderSearchResults(document.getElementById('teacher-search'), '_teacher');
    }
    if (t === 'students') { loadStudents(); loadSettings(); loadClasses(); }
    if (t === 'classes') loadClasses();
    if (t === 'stats') loadStats();
    if (t === 'recordings') loadRecordings();
    if (t === 'live') { loadLiveSessions(); loadClasses(); }
  };
});

document.getElementById('refresh-btn').onclick = loadQuestions;
document.getElementById('filter-class').onchange = loadQuestions;
document.getElementById('filter-status').onchange = loadQuestions;
document.getElementById('refresh-live-btn').onclick = loadLiveSessions;
document.getElementById('refresh-recordings-btn').onclick = loadRecordings;

loadQuestions();
loadClasses();
setInterval(loadQuestions, 30000);
setInterval(loadLiveSessions, 60000);
