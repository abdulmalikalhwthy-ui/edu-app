const user = JSON.parse(localStorage.getItem('user') || 'null');
if (!user || user.role !== 'teacher') {
  window.location.href = 'index.html';
}
document.getElementById('user-name').textContent = '👤 ' + user.name;
document.getElementById('logout').onclick = (e) => {
  e.preventDefault();
  localStorage.removeItem('user');
  window.location.href = 'index.html';
};

/* ============ تحميل قائمة الأسئلة ============ */
async function loadQuestions() {
  const r = await fetch('/api/questions');
  const list = await r.json();
  const container = document.getElementById('questions-list');
  if (!list.length) {
    container.innerHTML = '<div class="item">لا توجد أسئلة بعد.</div>';
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
      <div class="meta">موضوع: ${q.topic_text || '—'}</div>
    `;
    div.onclick = () => openQuestionModal(q);
    container.appendChild(div);
  });
}

/* ============ نافذة عرض السؤال والرد ============ */
function openQuestionModal(q) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <h2>سؤال من: ${q.student_name}</h2>
      <div id="modal-details"></div>
      <hr style="margin:14px 0">
      <h2>✍️ الرد على السؤال</h2>
      <div class="field">
        <label>الرد الكتابي</label>
        <textarea id="answer-text" rows="4" placeholder="اكتب ردك..."></textarea>
      </div>
      <div class="field">
        <label>🎙️ تسجيل صوتي</label>
        <button type="button" id="toggle-audio-answer">إظهار/إخفاء المسجل الصوتي</button>
        <div id="answer-audio-container" style="display:none; margin-top:8px"></div>
      </div>
      <div class="field">
        <label>🎥 تسجيل مرئي</label>
        <button type="button" id="toggle-video-answer">إظهار/إخفاء المسجل المرئي</button>
        <div id="answer-video-container" style="display:none; margin-top:8px"></div>
      </div>
      <div class="field">
        <label>🔴 بث مباشر (اختياري) — إنشاء رابط غرفة</label>
        <button type="button" id="create-live">إنشاء جلسة مباشرة</button>
        <div id="live-info" style="margin-top:8px"></div>
      </div>
      <div class="modal-actions">
        <button id="send-answer" class="btn-submit" style="flex:1">📤 إرسال الرد</button>
        <button id="close-modal" class="btn-danger">إغلاق</button>
      </div>
      <div id="answer-status" style="text-align:center; margin-top:8px"></div>
    </div>
  `;
  document.body.appendChild(backdrop);

  // عرض تفاصيل السؤال
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
        ${text ? `<div style="background:#f8fafc; padding:8px; border-radius:6px">${text}</div>` : ''}
        ${audio ? `<audio controls src="${audio}" style="width:100%; margin-top:6px"></audio>` : ''}
      </div>
    `);
  });

  // الردود السابقة
  if (q.answers && q.answers.length) {
    details.insertAdjacentHTML('beforeend', `<h3 style="margin-top:12px">الردود السابقة:</h3>`);
    q.answers.forEach(a => {
      details.insertAdjacentHTML('beforeend', `
        <div class="answer-block">
          ${a.answer_text ? `<p>${a.answer_text}</p>` : ''}
          ${a.answer_audio ? `<audio controls src="${a.answer_audio}" style="width:100%; margin-top:4px"></audio>` : ''}
          ${a.answer_video ? `<video controls src="${a.answer_video}" style="width:100%; margin-top:4px"></video>` : ''}
          <div class="meta">${new Date(a.created_at).toLocaleString('ar-EG')}</div>
        </div>
      `);
    });
  }

  // أدوات الرد
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
      <div style="background:#fff3cd; padding:10px; border-radius:8px">
        🔴 رابط الجلسة المباشرة: <a href="${liveLink}" target="_blank">${liveLink}</a>
        <br><small>شارك الرابط مع الطالب للانضمام</small>
      </div>
    `;
  };

  backdrop.querySelector('#close-modal').onclick = () => backdrop.remove();

  backdrop.querySelector('#send-answer').onclick = async () => {
    const status = backdrop.querySelector('#answer-status');
    const answer_text = backdrop.querySelector('#answer-text').value.trim();
    if (!answer_text && !answerAudioUrl && !answerVideoUrl && !liveLink) {
      status.textContent = '❌ أدخل رداً واحداً على الأقل';
      status.style.color = 'red';
      return;
    }
    status.textContent = '⏳ جاري الإرسال...';
    status.style.color = '#666';
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
        status.style.color = 'green';
        showToast('✅ تم إرسال الرد');
        setTimeout(() => { backdrop.remove(); loadQuestions(); }, 700);
      }
    } catch (e) {
      status.textContent = '❌ فشل الإرسال';
      status.style.color = 'red';
    }
  };
}

/* ============ التبويبات ============ */
document.getElementById('tab-questions').onclick = () => {
  document.getElementById('tab-questions').classList.add('active');
  document.getElementById('tab-search').classList.remove('active');
  document.getElementById('view-questions').style.display = 'block';
  document.getElementById('view-search').style.display = 'none';
};
document.getElementById('tab-search').onclick = () => {
  document.getElementById('tab-search').classList.add('active');
  document.getElementById('tab-questions').classList.remove('active');
  document.getElementById('view-questions').style.display = 'none';
  document.getElementById('view-search').style.display = 'block';
  if (!document.getElementById('teacher-search').dataset.init) {
    document.getElementById('teacher-search').dataset.init = '1';
    renderSearchResults(document.getElementById('teacher-search'), '_teacher');
  }
};

document.getElementById('refresh-btn').onclick = loadQuestions;

/* ============ تشغيل ============ */
loadQuestions();
setInterval(loadQuestions, 30000); // تحديث تلقائي كل 30 ثانية
