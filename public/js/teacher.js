/* ============================================================
   teacher.js — شاشة الأستاذ (نسخة مطوّرة)
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
      <div class="meta">👨‍🎓 ${q.student_name} — 📅 ${new Date(q.created_at).toLocaleString('ar-EG')}</div>
      ${q.class_name ? `<div class="meta">📚 ${q.class_name}</div>` : ''}
      <div class="meta">موضوع: ${q.topic_text || '—'}</div>
    `;
    div.onclick = () => openQuestionModal(q);
    container.appendChild(div);
  });
}

/* ============================================================
   نافذة السؤال والرد
   ============================================================ */
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
      <div class="field">
        <label>🔴 بث مباشر (اختياري)</label>
        <button type="button" class="btn-search" id="create-live">إنشاء جلسة مباشرة</button>
        <div id="live-info" style="margin-top:10px"></div>
      </div>
      <div class="modal-actions">
        <button id="export-pdf" class="btn-search">📄 تصدير PDF</button>
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
        ${audio ? `<audio controls src="${audio}" style="width:100%; margin-top:8px; border-radius:10px"></audio>` : ''}
      </div>
    `);
  });

  if (q.answers && q.answers.length) {
    details.insertAdjacentHTML('beforeend', `<h3 style="margin-top:16px; color:var(--primary-dark)">الردود السابقة:</h3>`);
    q.answers.forEach(a => {
      details.insertAdjacentHTML('beforeend', `
        <div class="answer-block">
          ${a.answer_text ? `<p>${a.answer_text}</p>` : ''}
          ${a.answer_audio ? `<audio controls src="${a.answer_audio}" style="width:100%; margin-top:6px"></audio>` : ''}
          ${a.answer_video ? `<video controls src="${a.answer_video}" style="width:100%; margin-top:6px"></video>` : ''}
          <div class="meta">${new Date(a.created_at).toLocaleString('ar-EG')}</div>
        </div>
      `);
    });
  }

  let answerAudioUrl = null, answerVideoUrl = null, liveLink = null;

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

  backdrop.querySelector('#create-live').onclick = () => {
    const room = 'edu-q' + q.id + '-' + Math.random().toString(36).slice(2, 8);
    liveLink = 'https://meet.jit.si/' + room;
    backdrop.querySelector('#live-info').innerHTML = `
      <div style="background:#fff3cd; padding:12px; border-radius:10px; border:2px solid #fbbf24">
        🔴 <b>رابط الجلسة:</b> <a href="${liveLink}" target="_blank">${liveLink}</a>
      </div>
    `;
  };

  backdrop.querySelector('#close-modal').onclick = () => backdrop.remove();

  /* تصدير PDF */
  backdrop.querySelector('#export-pdf').onclick = () => exportQuestionPDF(q);

  backdrop.querySelector('#send-answer').onclick = async () => {
    const status = backdrop.querySelector('#answer-status');
    const answer_text = backdrop.querySelector('#answer-text').value.trim();
    if (!answer_text && !answerAudioUrl && !answerVideoUrl && !liveLink) {
      status.textContent = '❌ أدخل رداً واحداً على الأقل';
      status.style.color = 'var(--danger)';
      return;
    }
    status.textContent = '⏳ جاري الإرسال...';
    status.style.color = 'var(--text-light)';
    try {
      const r = await fetch('/api/answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: q.id,
          teacher_id: user.id,
          answer_text: answer_text || null,
          answer_audio: answerAudioUrl,
          answer_video: answerVideoUrl,
          is_live: liveLink ? 1 : 0,
          room_link: liveLink
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

/* ============================================================
   تصدير PDF
   ============================================================ */
function exportQuestionPDF(q) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFont('helvetica');
  doc.setFontSize(18);
  doc.text('Question Report', 105, 15, { align: 'center' });
  doc.setFontSize(11);
  doc.text('Student: ' + (q.student_name || ''), 15, 30);
  doc.text('Date: ' + new Date(q.created_at).toLocaleString(), 15, 37);
  if (q.class_name) doc.text('Class: ' + q.class_name, 15, 44);

  let y = 55;
  const items = [
    ['Question Type', q.question_type === 'new' ? 'New' : 'From Previous'],
    ['Topic', q.topic_text],
    ['Understanding', q.understanding_text],
    ['Evidence', q.evidence_text],
    ['Evidence Snippet', q.evidence_snippet],
    ['Objection', q.objection_text],
    ['Problem', q.problem_text],
    ['Formulation', q.question_formulation],
    ['Expected Answer', q.expected_answer_text]
  ];

  items.forEach(([label, value]) => {
    if (!value) return;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(label + ':', 15, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(value, 180);
    doc.text(lines, 15, y);
    y += lines.length * 6 + 4;
    if (y > 270) { doc.addPage(); y = 20; }
  });

  doc.save(`question-${q.id}.pdf`);
  showToast('📄 تم تصدير PDF');
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
    container.innerHTML = '<div style="text-align:center; color:var(--text-light); padding:20px">لا يوجد طلاب مُضافون بعد</div>';
    return;
  }
  container.innerHTML = '';
  list.forEach(s => {
    const div = document.createElement('div');
    div.className = 'student-row';
    div.innerHTML = `
      <div style="flex:1">
        <div class="student-name">👨‍🎓 ${s.name}</div>
        <div class="student-meta">${s.class_name ? '📚 ' + s.class_name + ' • ' : ''}📅 ${new Date(s.created_at).toLocaleDateString('ar-EG')}</div>
      </div>
      <button class="remove-btn" data-id="${s.id}" type="button">🗑️ حذف</button>
    `;
    div.querySelector('.remove-btn').onclick = async (e) => {
      e.stopPropagation();
      if (!confirm(`حذف الطالب "${s.name}"؟`)) return;
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
}

document.getElementById('restrict-toggle').onchange = async (e) => {
  await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'restrict_students', value: e.target.checked ? '1' : '0' })
  });
  showToast(e.target.checked ? '🔒 تم تفعيل التقييد' : '🔓 تم فتح التسجيل');
};

document.getElementById('save-code-btn').onclick = async () => {
  const code = document.getElementById('teacher-code-input').value.trim();
  const status = document.getElementById('code-status');

  await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'teacher_code', value: code })
  });

  if (code) {
    status.textContent = '✅ تم تفعيل حماية الرمز';
    status.style.color = 'var(--success)';
  } else {
    status.textContent = '🔓 تم إلغاء حماية الرمز';
    status.style.color = 'var(--warning)';
  }

  showToast('✅ تم الحفظ');
};

document.getElementById('add-student-btn').onclick = async () => {
  const input = document.getElementById('new-student-name');
  const classSelect = document.getElementById('new-student-class');
  const name = input.value.trim();
  if (!name) return showToast('اكتب اسم الطالب');

  const r = await fetch('/api/allowed-students', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      added_by: user.id,
      class_id: classSelect.value ? parseInt(classSelect.value) : null
    })
  });
  const data = await r.json();
  if (data.ok) {
    showToast('✅ تمت إضافة الطالب');
    input.value = '';
    loadStudents();
  } else {
    showToast('❌ ' + (data.error || 'فشل الإضافة'));
  }
};

/* ============================================================
   الفصول
   ============================================================ */
async function loadClasses() {
  const r = await fetch('/api/classes');
  allClasses = await r.json();
  document.getElementById('classes-count').textContent = allClasses.length;

  // قائمة الفصول في النموذج
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
          ${c.description ? `<div class="student-meta">${c.description}</div>` : ''}
        </div>
        <button class="remove-btn" data-id="${c.id}" type="button">🗑️ حذف</button>
      `;
      div.querySelector('.remove-btn').onclick = async (e) => {
        e.stopPropagation();
        if (!confirm(`حذف الفصل "${c.name}"؟`)) return;
        const r = await fetch('/api/classes/' + c.id, { method: 'DELETE' });
        const data = await r.json();
        if (data.ok) {
          showToast('✅ تم الحذف');
          loadClasses();
        } else {
          showToast('❌ ' + (data.error || 'فشل'));
        }
      };
      container.appendChild(div);
    });
  }

  // تحديث قوائم الاختيار
  const studentClassSelect = document.getElementById('new-student-class');
  const filterClassSelect = document.getElementById('filter-class');

  const options = allClasses.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

  if (studentClassSelect) studentClassSelect.innerHTML = `<option value="">بدون فصل</option>${options}`;
  if (filterClassSelect) filterClassSelect.innerHTML = `<option value="">كل الفصول</option>${options}`;
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
  if (data.ok) {
    showToast('✅ تمت إضافة الفصل');
    input.value = '';
    loadClasses();
  } else {
    showToast('❌ ' + (data.error || 'فشل'));
  }
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
      <div class="stat-card blue">
        <div class="stat-value">${s.questions}</div>
        <div class="stat-label">📋 إجمالي الأسئلة</div>
      </div>
      <div class="stat-card green">
        <div class="stat-value">${s.answered}</div>
        <div class="stat-label">✅ تم الرد</div>
      </div>
      <div class="stat-card orange">
        <div class="stat-value">${s.pending}</div>
        <div class="stat-label">⏳ قيد الانتظار</div>
      </div>
      <div class="stat-card purple">
        <div class="stat-value">${s.students}</div>
        <div class="stat-label">👨‍🎓 الطلاب</div>
      </div>
      <div class="stat-card teal">
        <div class="stat-value">${s.allowed_students}</div>
        <div class="stat-label">✅ المصرّح لهم</div>
      </div>
      <div class="stat-card pink">
        <div class="stat-value">${s.classes}</div>
        <div class="stat-label">📚 الفصول</div>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <h2>🏆 أنشط الطلاب</h2>
      <div id="top-students"></div>
    </div>
  `;

  const topContainer = container.querySelector('#top-students');
  if (!s.top_students || !s.top_students.length) {
    topContainer.innerHTML = '<div style="text-align:center;color:var(--text-light);padding:20px">لا بيانات بعد</div>';
  } else {
    s.top_students.forEach((st, i) => {
      const medal = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][i] || '▪️';
      topContainer.insertAdjacentHTML('beforeend', `
        <div class="student-row">
          <div style="flex:1">
            <div class="student-name">${medal} ${st.name}</div>
          </div>
          <div class="badge answered">${st.count} سؤال</div>
        </div>
      `);
    });
  }
}

/* ============================================================
   التبويبات
   ============================================================ */
const tabs = ['questions', 'search', 'students', 'classes', 'stats'];
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
  };
});

document.getElementById('refresh-btn').onclick = loadQuestions;
document.getElementById('filter-class').onchange = loadQuestions;
document.getElementById('filter-status').onchange = loadQuestions;

/* ============================================================
   تشغيل
   ============================================================ */
loadQuestions();
loadClasses();
setInterval(loadQuestions, 30000);
