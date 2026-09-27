/* ============================================================
   teacher.js — شاشة الأستاذ الكاملة
   يشمل: الأسئلة، الامتحانات، الاستطلاعات، الحصص المباشرة،
          التسجيلات، الطلاب، الفصول، البحث، الإحصائيات + Push
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
      status.textContent = '❌ أدخل رداً على الأقل';
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
        status.textContent = '✅ تم الإرسال';
        status.style.color = 'var(--success)';
        showToast('✅ تم إرسال الرد');
        setTimeout(() => { backdrop.remove(); loadQuestions(); }, 700);
      }
    } catch (e) {
      status.textContent = '❌ فشل';
      status.style.color = 'var(--danger)';
    }
  };
}

function renderMedia(url, type) {
  return `
    <div style="margin-top:8px">
      ${type === 'audio' ? `<audio controls src="${url}" style="width:100%; border-radius:10px"></audio>`
                          : `<video controls src="${url}" style="width:100%; border-radius:10px"></video>`}
      <a href="${url}" download class="btn-search" style="display:inline-block; margin-top:6px; text-decoration:none; color:var(--primary-dark)">⬇️ تنزيل</a>
    </div>
  `;
}

function exportQuestionPDF(q) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setFontSize(18);
  doc.text('Question Report', 105, 15, { align: 'center' });
  doc.setFontSize(11);
  doc.text('Student: ' + (q.student_name || ''), 15, 30);
  doc.text('Date: ' + new Date(q.created_at).toLocaleString(), 15, 37);
  let y = 50;
  const items = [
    ['Topic', q.topic_text], ['Understanding', q.understanding_text],
    ['Evidence', q.evidence_text], ['Objection', q.objection_text],
    ['Problem', q.problem_text], ['Formulation', q.question_formulation],
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
}

/* ============================================================
   بناء الامتحان
   ============================================================ */
let examQuestions = [];

function renderExamBuilder() {
  const container = document.getElementById('exam-questions-builder');
  if (!examQuestions.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--text-light);padding:14px">لا توجد أسئلة بعد</div>';
    return;
  }

  container.innerHTML = '';
  examQuestions.forEach((q, idx) => {
    const div = document.createElement('div');
    div.className = 'field';
    div.style.border = '2px solid var(--border)';
    div.style.padding = '12px';
    div.style.borderRadius = '12px';
    div.style.marginBottom = '10px';

    let optionsHtml = '';
    if (q.question_type === 'mcq') {
      optionsHtml = `
        <label>الخيارات (كل سطر خيار)</label>
        <textarea class="q-options" rows="4" placeholder="خيار 1&#10;خيار 2&#10;خيار 3">${(q.options || []).join('\n')}</textarea>
      `;
    }

    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px">
        <b>سؤال ${idx + 1}</b>
        <button type="button" class="remove-btn remove-q" data-idx="${idx}">🗑️</button>
      </div>
      <label>نص السؤال</label>
      <input type="text" class="q-text" value="${(q.question_text || '').replace(/"/g, '&quot;')}" placeholder="اكتب السؤال هنا...">
      <label style="margin-top:8px">النوع</label>
      <select class="q-type">
        <option value="mcq" ${q.question_type === 'mcq' ? 'selected' : ''}>اختيار من متعدد</option>
        <option value="truefalse" ${q.question_type === 'truefalse' ? 'selected' : ''}>صحيح / خطأ</option>
        <option value="essay" ${q.question_type === 'essay' ? 'selected' : ''}>مقالي</option>
      </select>
      ${optionsHtml}
      <label style="margin-top:8px">الإجابة الصحيحة</label>
      <input type="text" class="q-answer" value="${(q.correct_answer || '').replace(/"/g, '&quot;')}" placeholder="اكتب الإجابة الصحيحة">
      <label style="margin-top:8px">النقاط</label>
      <input type="number" class="q-points" value="${q.points || 1}" min="1">
    `;

    div.querySelector('.remove-q').onclick = () => {
      examQuestions.splice(idx, 1);
      renderExamBuilder();
    };
    div.querySelector('.q-text').oninput = (e) => { examQuestions[idx].question_text = e.target.value; };
    div.querySelector('.q-type').onchange = (e) => {
      examQuestions[idx].question_type = e.target.value;
      renderExamBuilder();
    };
    const opts = div.querySelector('.q-options');
    if (opts) opts.oninput = (e) => {
      examQuestions[idx].options = e.target.value.split('\n').filter(x => x.trim());
    };
    div.querySelector('.q-answer').oninput = (e) => { examQuestions[idx].correct_answer = e.target.value; };
    div.querySelector('.q-points').oninput = (e) => { examQuestions[idx].points = parseInt(e.target.value) || 1; };

    container.appendChild(div);
  });
}

document.getElementById('add-question-btn').onclick = () => {
  examQuestions.push({ question_text: '', question_type: 'mcq', options: [], correct_answer: '', points: 1 });
  renderExamBuilder();
};

document.getElementById('create-exam-btn').onclick = async () => {
  const title = document.getElementById('exam-title').value.trim();
  const description = document.getElementById('exam-description').value.trim();
  const classId = document.getElementById('exam-class').value;
  const duration = parseInt(document.getElementById('exam-duration').value) || 30;
  const statusEl = document.getElementById('exam-status');

  if (!title) { statusEl.textContent = '⚠️ اكتب عنوان الامتحان'; statusEl.style.color = 'var(--warning)'; return; }
  if (!examQuestions.length) { statusEl.textContent = '⚠️ أضف سؤالاً واحداً'; statusEl.style.color = 'var(--warning)'; return; }
  if (examQuestions.some(q => !q.question_text.trim())) { statusEl.textContent = '⚠️ بعض الأسئلة بدون نص'; statusEl.style.color = 'var(--warning)'; return; }

  statusEl.textContent = '⏳ جاري الإنشاء...';
  statusEl.style.color = 'var(--text-light)';

  try {
    const r = await fetch('/api/exams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title, description,
        class_id: classId ? parseInt(classId) : null,
        teacher_id: user.id,
        duration_minutes: duration,
        questions: examQuestions
      })
    });
    const data = await r.json();
    if (data.ok) {
      statusEl.textContent = '✅ تم نشر الامتحان!';
      statusEl.style.color = 'var(--success)';
      showToast('✅ تم نشر الامتحان');
      document.getElementById('exam-title').value = '';
      document.getElementById('exam-description').value = '';
      examQuestions = [];
      renderExamBuilder();
      loadExams();
    } else {
      statusEl.textContent = '❌ ' + (data.error || 'فشل');
      statusEl.style.color = 'var(--danger)';
    }
  } catch (e) {
    statusEl.textContent = '❌ فشل الاتصال';
    statusEl.style.color = 'var(--danger)';
  }
};

async function loadExams() {
  const r = await fetch('/api/exams');
  const list = await r.json();
  const container = document.getElementById('exams-list');
  if (!list.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--text-light);padding:20px">لا توجد امتحانات</div>';
    return;
  }

  container.innerHTML = '';
  list.forEach(exam => {
    const div = document.createElement('div');
    div.className = 'question-item';
    div.innerHTML = `
      <h3>📝 ${exam.title} <span class="badge answered">${exam.status === 'published' ? 'منشور' : 'مسودة'}</span></h3>
      <div class="meta">⏱️ ${exam.duration_minutes} دقيقة — 🎯 ${exam.total_points} نقطة</div>
      ${exam.class_name ? `<div class="meta">📚 ${exam.class_name}</div>` : ''}
      <div class="meta">📅 ${new Date(exam.created_at).toLocaleString('ar-EG')}</div>
      <div class="modal-actions" style="margin-top:10px">
        <button class="btn-search view-attempts" data-id="${exam.id}" type="button">👁️ النتائج</button>
        <button class="btn-danger delete-exam" data-id="${exam.id}" type="button">🗑️ حذف</button>
      </div>
    `;
    div.querySelector('.view-attempts').onclick = () => viewExamAttempts(exam.id, exam.title);
    div.querySelector('.delete-exam').onclick = async () => {
      if (!confirm(`حذف امتحان "${exam.title}"؟`)) return;
      await fetch('/api/exams/' + exam.id, { method: 'DELETE' });
      showToast('✅ تم الحذف');
      loadExams();
    };
    container.appendChild(div);
  });
}

async function viewExamAttempts(examId, title) {
  const r = await fetch(`/api/exams/${examId}/attempts`);
  const list = await r.json();

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  let attemptsHtml = '';
  if (!list.length) {
    attemptsHtml = '<div style="text-align:center;color:var(--text-light);padding:20px">لا توجد محاولات بعد</div>';
  } else {
    list.forEach(a => {
      const pct = a.max_score ? Math.round(a.score / a.max_score * 100) : 0;
      attemptsHtml += `
        <div class="student-row" style="flex-direction:column; align-items:stretch">
          <div style="display:flex; justify-content:space-between">
            <b>${a.student_name}</b>
            <span class="badge ${pct >= 50 ? 'answered' : 'pending'}">${a.score} / ${a.max_score} (${pct}%)</span>
          </div>
          ${a.student_email ? `<div class="student-meta">📧 ${a.student_email}</div>` : ''}
          <div class="student-meta">📅 ${new Date(a.submitted_at).toLocaleString('ar-EG')}</div>
        </div>
      `;
    });
  }

  backdrop.innerHTML = `
    <div class="modal">
      <h2>📊 نتائج: ${title}</h2>
      ${attemptsHtml}
      <button id="close-attempts" class="btn-danger" type="button" style="width:100%;margin-top:14px">إغلاق</button>
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.querySelector('#close-attempts').onclick = () => backdrop.remove();
}

/* ============================================================
   بناء الاستطلاع
   ============================================================ */
let pollOptions = ['', ''];

function renderPollBuilder() {
  const container = document.getElementById('poll-options-builder');
  container.innerHTML = '';
  pollOptions.forEach((opt, idx) => {
    const div = document.createElement('div');
    div.style.display = 'flex';
    div.style.gap = '8px';
    div.style.marginBottom = '8px';
    div.innerHTML = `
      <input type="text" class="poll-opt" value="${opt.replace(/"/g, '&quot;')}" placeholder="خيار ${idx + 1}">
      ${pollOptions.length > 2 ? `<button type="button" class="remove-btn remove-opt" data-idx="${idx}">🗑️</button>` : ''}
    `;
    div.querySelector('.poll-opt').oninput = (e) => { pollOptions[idx] = e.target.value; };
    const rm = div.querySelector('.remove-opt');
    if (rm) rm.onclick = () => { pollOptions.splice(idx, 1); renderPollBuilder(); };
    container.appendChild(div);
  });
}

document.getElementById('add-option-btn').onclick = () => {
  pollOptions.push('');
  renderPollBuilder();
};

document.getElementById('create-poll-btn').onclick = async () => {
  const question = document.getElementById('poll-question').value.trim();
  const classId = document.getElementById('poll-class').value;
  const statusEl = document.getElementById('poll-create-status');

  const cleanOptions = pollOptions.filter(o => o.trim());
  if (!question) { statusEl.textContent = '⚠️ اكتب السؤال'; statusEl.style.color = 'var(--warning)'; return; }
  if (cleanOptions.length < 2) { statusEl.textContent = '⚠️ أضف خيارين على الأقل'; statusEl.style.color = 'var(--warning)'; return; }

  statusEl.textContent = '⏳ جاري النشر...';
  try {
    const r = await fetch('/api/polls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question, options: cleanOptions,
        class_id: classId ? parseInt(classId) : null,
        teacher_id: user.id
      })
    });
    const data = await r.json();
    if (data.ok) {
      statusEl.textContent = '✅ تم النشر';
      statusEl.style.color = 'var(--success)';
      showToast('✅ تم النشر');
      document.getElementById('poll-question').value = '';
      pollOptions = ['', ''];
      renderPollBuilder();
      loadPolls();
    } else {
      statusEl.textContent = '❌ ' + (data.error || 'فشل');
      statusEl.style.color = 'var(--danger)';
    }
  } catch (e) {
    statusEl.textContent = '❌ فشل الاتصال';
    statusEl.style.color = 'var(--danger)';
  }
};

async function loadPolls() {
  const r = await fetch('/api/polls');
  const list = await r.json();
  const container = document.getElementById('polls-list');
  if (!list.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--text-light);padding:20px">لا توجد استطلاعات</div>';
    return;
  }

  container.innerHTML = '';
  for (const poll of list) {
    const resResp = await fetch(`/api/polls/${poll.id}/results`);
    const { results, total_votes } = await resResp.json();

    let bars = results.map(r => {
      const pct = total_votes ? Math.round(r.count / total_votes * 100) : 0;
      return `
        <div style="margin-bottom:8px">
          <div style="display:flex; justify-content:space-between; font-size:.85rem; margin-bottom:3px">
            <b>${r.label}</b><span>${r.count} (${pct}%)</span>
          </div>
          <div style="background:#e2e8f0; border-radius:8px; height:18px; overflow:hidden">
            <div style="background:linear-gradient(90deg, #2563eb, #7c3aed); height:100%; width:${pct}%"></div>
          </div>
        </div>
      `;
    }).join('');

    const div = document.createElement('div');
    div.className = 'question-item';
    div.innerHTML = `
      <h3>📊 ${poll.question} <span class="badge ${poll.status === 'active' ? 'answered' : 'pending'}">${poll.status === 'active' ? 'نشط' : 'منتهي'}</span></h3>
      <div class="meta">📅 ${new Date(poll.created_at).toLocaleString('ar-EG')}</div>
      <div class="meta">🗳️ إجمالي الأصوات: <b>${total_votes}</b></div>
      <div style="margin-top:12px">${bars}</div>
      ${poll.status === 'active' ? `<button class="btn-danger end-poll" data-id="${poll.id}" type="button" style="margin-top:10px; width:100%">⏹️ إنهاء الاستطلاع</button>` : ''}
    `;
    const endBtn = div.querySelector('.end-poll');
    if (endBtn) endBtn.onclick = async () => {
      if (!confirm('إنهاء هذا الاستطلاع؟')) return;
      await fetch('/api/polls/' + poll.id, { method: 'DELETE' });
      showToast('✅ تم الإنهاء');
      loadPolls();
    };
    container.appendChild(div);
  }
}

/* ============================================================
   الحصص المباشرة
   ============================================================ */
async function loadLiveSessions() {
  const r = await fetch('/api/live-sessions');
  const list = await r.json();
  const container = document.getElementById('live-sessions-list');
  if (!list.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--text-light);padding:20px">لا توجد حصص نشطة</div>';
    return;
  }

  container.innerHTML = '';
  list.forEach(s => {
    const div = document.createElement('div');
    div.className = 'live-item';
    div.innerHTML = `
      <h3>🔴 ${s.title}</h3>
      <div class="live-meta">👨‍🏫 ${s.teacher_name}</div>
      ${s.class_name ? `<div class="live-meta">📚 ${s.class_name}</div>` : ''}
      <div class="live-meta">📅 ${new Date(s.created_at).toLocaleString('ar-EG')}</div>
      ${s.password ? `<div class="live-meta">🔐 كلمة المرور: <span class="live-password">${s.password}</span></div>` : ''}
      <div class="modal-actions" style="margin-top:10px">
        <a href="${s.room_link}" target="_blank" class="btn-submit" style="text-decoration:none; text-align:center; padding:10px; flex:1">🚪 دخول القاعة</a>
        <button class="btn-danger end-live" data-id="${s.id}" type="button">⏹️ إنهاء</button>
      </div>
    `;
    div.querySelector('.end-live').onclick = async (e) => {
      e.stopPropagation();
      if (!confirm('إنهاء الحصة؟')) return;
      await fetch('/api/live-sessions/' + s.id, { method: 'DELETE' });
      showToast('✅ تم الإنهاء');
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

  if (!title) { status.textContent = '⚠️ اكتب عنوان الحصة'; status.style.color = 'var(--warning)'; return; }

  status.textContent = '⏳ جاري الإنشاء...';
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
      status.textContent = `✅ تم إنشاء الحصة! (${data.notifications_sent} طالب تم إشعارهم)`;
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
  container.innerHTML = `<div style="text-align:center;color:var(--text-light);margin-bottom:12px;font-size:.85rem">📦 ${list.length} تسجيل — ${(totalSize / 1024).toFixed(1)} KB</div>`;

  list.forEach(rec => {
    const isVideo = (rec.mimetype || '').includes('video');
    const div = document.createElement('div');
    div.className = 'question-item';
    div.innerHTML = `
      <h3>${isVideo ? '🎥' : '🎙️'} ${rec.filename.slice(0, 25)}...
        <span class="badge ${rec.kind === 'audio' ? 'pending' : 'answered'}">${rec.kind === 'audio' ? 'صوتي' : 'مرئي'}</span>
      </h3>
      <div class="meta">👤 ${rec.uploader_name || 'غير معروف'}</div>
      <div class="meta">📅 ${new Date(rec.created_at).toLocaleString('ar-EG')}</div>
      <div class="meta">📦 ${(rec.size / 1024).toFixed(1)} KB</div>
      <div style="margin-top:8px">
        ${isVideo ? `<video controls src="${rec.url}" style="width:100%;border-radius:8px;max-height:180px"></video>`
                  : `<audio controls src="${rec.url}" style="width:100%"></audio>`}
      </div>
      <div class="modal-actions" style="margin-top:10px">
        <a href="${rec.url}" download class="btn-search" style="text-decoration:none; padding:8px 14px">⬇️ تنزيل</a>
        <button class="btn-danger delete-rec" data-id="${rec.id}" type="button">🗑️ حذف</button>
      </div>
    `;
    div.querySelector('.delete-rec').onclick = async (e) => {
      e.stopPropagation();
      if (!confirm('حذف هذا التسجيل نهائياً؟')) return;
      const id = e.target.dataset.id;
      const resp = await fetch('/api/recordings/' + id, { method: 'DELETE' });
      if ((await resp.json()).ok) { showToast('✅ تم الحذف'); loadRecordings(); }
    };
    container.appendChild(div);
  });
}

/* ============================================================
   الطلاب + الفصول
   ============================================================ */
async function loadStudents() {
  const r = await fetch('/api/allowed-students');
  const list = await r.json();
  document.getElementById('students-count').textContent = list.length;
  const container = document.getElementById('students-list');
  if (!list.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--text-light);padding:20px">لا يوجد طلاب</div>';
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
    div.querySelector('.remove-btn').onclick = async () => {
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
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'restrict_students', value: e.target.checked ? '1' : '0' })
  });
  showToast(e.target.checked ? '🔒 تم التفعيل' : '🔓 تم الفتح');
};

document.getElementById('save-code-btn').onclick = async () => {
  const code = document.getElementById('teacher-code-input').value.trim();
  await fetch('/api/settings', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'teacher_code', value: code })
  });
  const status = document.getElementById('code-status');
  if (code) { status.textContent = '✅ تم تفعيل الحماية'; status.style.color = 'var(--success)'; }
  else { status.textContent = '🔓 تم الإلغاء'; status.style.color = 'var(--warning)'; }
  showToast('✅ تم الحفظ');
};

document.getElementById('add-student-btn').onclick = async () => {
  const name = document.getElementById('new-student-name').value.trim();
  const email = document.getElementById('new-student-email').value.trim();
  const classSelect = document.getElementById('new-student-class');
  if (!name) return showToast('اكتب اسم الطالب');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showToast('البريد غير صحيح');

  const r = await fetch('/api/allowed-students', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email: email || null, added_by: user.id, class_id: classSelect.value ? parseInt(classSelect.value) : null })
  });
  const data = await r.json();
  if (data.ok) {
    showToast('✅ تمت الإضافة');
    document.getElementById('new-student-name').value = '';
    document.getElementById('new-student-email').value = '';
    loadStudents();
  } else showToast('❌ ' + (data.error || 'فشل'));
};

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
      div.innerHTML = `<div style="flex:1"><div class="student-name">📚 ${c.name}</div></div>
        <button class="remove-btn" data-id="${c.id}" type="button">🗑️</button>`;
      div.querySelector('.remove-btn').onclick = async () => {
        if (!confirm(`حذف "${c.name}"؟`)) return;
        const resp = await fetch('/api/classes/' + c.id, { method: 'DELETE' });
        const data = await resp.json();
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
  document.getElementById('exam-class').innerHTML = `<option value="">كل الطلاب</option>${options}`;
  document.getElementById('poll-class').innerHTML = `<option value="">كل الطلاب</option>${options}`;
}

document.getElementById('add-class-btn').onclick = async () => {
  const input = document.getElementById('new-class-name');
  const name = input.value.trim();
  if (!name) return showToast('اكتب اسم الفصل');

  const r = await fetch('/api/classes', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
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
      <div class="stat-card orange"><div class="stat-value">${s.pending}</div><div class="stat-label">⏳ انتظار</div></div>
      <div class="stat-card purple"><div class="stat-value">${s.students}</div><div class="stat-label">👨‍🎓 الطلاب</div></div>
      <div class="stat-card teal"><div class="stat-value">${s.allowed_students}</div><div class="stat-label">✅ مصرّح</div></div>
      <div class="stat-card pink"><div class="stat-value">${s.classes}</div><div class="stat-label">📚 الفصول</div></div>
      <div class="stat-card blue"><div class="stat-value">${s.recordings}</div><div class="stat-label">🎙️ تسجيلات</div></div>
      <div class="stat-card purple"><div class="stat-value">${(s.recordings_size / 1024 / 1024).toFixed(1)}</div><div class="stat-label">💾 MB</div></div>
      <div class="stat-card orange"><div class="stat-value">${s.live_sessions}</div><div class="stat-label">🔴 حصص</div></div>
      <div class="stat-card green"><div class="stat-value">${s.exams}</div><div class="stat-label">📝 امتحانات</div></div>
      <div class="stat-card pink"><div class="stat-value">${s.polls}</div><div class="stat-label">📊 استطلاعات</div></div>
      <div class="stat-card teal"><div class="stat-value">${s.push_subscriptions || 0}</div><div class="stat-label">🔔 مشتركين</div></div>
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
const tabs = ['questions', 'exams', 'polls', 'live', 'recordings', 'students', 'classes', 'search', 'stats'];

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
    if (t === 'exams') { loadExams(); loadClasses(); }
    if (t === 'polls') { loadPolls(); loadClasses(); }
  };
});

document.getElementById('refresh-btn').onclick = loadQuestions;
document.getElementById('filter-class').onchange = loadQuestions;
document.getElementById('filter-status').onchange = loadQuestions;
document.getElementById('refresh-live-btn').onclick = loadLiveSessions;
document.getElementById('refresh-recordings-btn').onclick = loadRecordings;
document.getElementById('refresh-exams-btn').onclick = loadExams;
document.getElementById('refresh-polls-btn').onclick = loadPolls;

/* ============================================================
   تشغيل
   ============================================================ */
loadQuestions();
loadClasses();
renderExamBuilder();
renderPollBuilder();
setInterval(loadQuestions, 30000);
setInterval(loadLiveSessions, 60000);

/* ============================================================
   تفعيل الإشعارات - طلب إذن + اشتراك
   ============================================================ */
(async function initPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push غير مدعوم');
    return;
  }

  try {
    await navigator.serviceWorker.ready;
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      console.log('✅ اشتراك push موجود');
      return;
    }

    setTimeout(async () => {
      if (Notification.permission === 'granted') {
        const u = JSON.parse(localStorage.getItem('user') || 'null');
        if (u && u.id) await PushClient.subscribeToPush(u.id);
      } else if (Notification.permission !== 'denied') {
        const box = document.createElement('div');
        box.style.cssText = 'position:fixed; bottom:80px; left:16px; right:16px; background:linear-gradient(135deg,#fef3c7,#fde68a); border:3px solid #f59e0b; border-radius:18px; padding:16px; z-index:3000; box-shadow:0 10px 30px rgba(245,158,11,.3); text-align:center;';
        box.innerHTML = `
          <div style="font-weight:800; color:#78350f; margin-bottom:10px; font-size:1rem">🔔 فعّل الإشعارات</div>
          <div style="font-size:.85rem; color:#92400e; margin-bottom:12px; line-height:1.6">
            لتصلك إشعارات الحصص المباشرة والامتحانات فوراً، حتى لو كان التطبيق مغلقاً.
          </div>
          <button id="enable-push-btn" style="background:linear-gradient(180deg,#f59e0b,#d97706); padding:12px 24px; border-radius:12px; color:#fff; font-weight:800; border:none; box-shadow:0 4px 0 #92400e; cursor:pointer">
            ✅ تفعيل الآن
          </button>
          <button id="dismiss-push-btn" style="background:transparent; border:none; color:#92400e; margin-top:8px; cursor:pointer; font-size:.85rem; font-weight:600">لاحقاً</button>
        `;
        document.body.appendChild(box);

        document.getElementById('enable-push-btn').onclick = async () => {
          const u = JSON.parse(localStorage.getItem('user') || 'null');
          if (!u || !u.id) return;
          const ok = await PushClient.subscribeToPush(u.id);
          if (ok) {
            box.innerHTML = '<div style="font-weight:800; color:#065f46; font-size:1rem">✅ تم تفعيل الإشعارات!</div>';
            setTimeout(() => box.remove(), 2000);
          } else {
            box.innerHTML = '<div style="font-weight:800; color:#991b1b; font-size:1rem">⚠️ تعذّر التفعيل</div>';
            setTimeout(() => box.remove(), 4000);
          }
        };
        document.getElementById('dismiss-push-btn').onclick = () => box.remove();
      }
    }, 2500);
  } catch (e) {
    console.error('Push init error:', e);
  }
})();
