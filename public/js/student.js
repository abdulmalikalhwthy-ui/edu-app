/* ============ إعدادات ============ */
const user = JSON.parse(localStorage.getItem('user') || 'null');
if (!user || user.role !== 'student') {
  window.location.href = 'index.html';
}
document.getElementById('user-name').textContent = '👤 ' + user.name;
document.getElementById('logout').onclick = (e) => {
  e.preventDefault();
  localStorage.removeItem('user');
  window.location.href = 'index.html';
};

/* ============ حقول النموذج ============ */
const FIELDS = [
  { key: 'topic', num: '٢', label: 'موضوع السؤال', audio: true, text: true },
  { key: 'understanding', num: '٣', label: 'فهم الموضوع السابق', audio: true, text: true },
  { key: 'evidence', num: '٤', label: 'دليل الموضوع (آية / رواية)', audio: false, text: true, search: true },
  { key: 'evidence_snippet', num: '٥', label: 'شاهد السؤال من الدليل (جزء من الآية/الرواية)', audio: false, text: true },
  { key: 'objection', num: '٦', label: 'نقطة الاعتراض في الموضوع', audio: true, text: true },
  { key: 'problem', num: '٧', label: 'الإشكال القائم', audio: true, text: true },
  { key: 'question_formulation', num: '٨', label: 'صيغة سؤال الإشكال', audio: false, text: true },
  { key: 'expected_answer', num: '٩', label: 'الإجابة المفترض سماعها', audio: true, text: true }
];

const audioUrls = {};

/* ============ بناء النموذج ============ */
function buildForm() {
  const form = document.getElementById('question-form');
  form.innerHTML = `
    <div class="field">
      <label>١- نوع السؤال</label>
      <select name="question_type">
        <option value="new">جديد</option>
        <option value="previous">ناتج درس سابق</option>
      </select>
    </div>
  `;

  FIELDS.forEach(f => {
    const div = document.createElement('div');
    div.className = 'field';
    div.innerHTML = `
      <label>${f.num}- ${f.label}</label>
      <textarea name="${f.key}_text" rows="3" placeholder="اكتب هنا..."></textarea>
      ${f.search ? `<button type="button" class="btn-search" data-key="${f.key}">🔍 بحث في القرآن والروايات</button>
                    <div class="search-area" data-key="${f.key}"></div>` : ''}
      ${f.audio ? `
        <button type="button" class="btn-toggle-audio" data-key="${f.key}">🎙️ إضافة تسجيل صوتي</button>
        <div class="audio-container" data-key="${f.key}" style="display:none"></div>
      ` : ''}
    `;
    form.appendChild(div);
  });

  form.insertAdjacentHTML('beforeend', `
    <button type="submit" class="btn-submit">📤 إرسال السؤال</button>
    <div id="form-status" style="text-align:center; margin-top:8px"></div>
  `);

  // تفعيل أزرار التسجيل الصوتي
  form.querySelectorAll('.btn-toggle-audio').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.key;
      const container = form.querySelector(`.audio-container[data-key="${key}"]`);
      if (container.style.display === 'none') {
        container.style.display = 'block';
        if (!container.dataset.init) {
          container.dataset.init = '1';
          new MediaRecorderHelper(container, {
            video: false,
            onComplete: (url) => {
              audioUrls[key] = url;
              showToast('✅ تم حفظ التسجيل الصوتي');
            }
          });
        }
      } else {
        container.style.display = 'none';
      }
    };
  });

  // تفعيل أزرار البحث
  form.querySelectorAll('.btn-search').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.key;
      const area = form.querySelector(`.search-area[data-key="${key}"]`);
      if (area.style.display === 'none' || !area.dataset.init) {
        area.style.display = 'block';
        if (!area.dataset.init) {
          area.dataset.init = '1';
          renderSearchResults(area, key);
        }
      } else {
        area.style.display = 'none';
      }
    };
  });

  form.onsubmit = submitQuestion;
}

/* ============ إرسال السؤال ============ */
async function submitQuestion(e) {
  e.preventDefault();
  const form = e.target;
  const status = document.getElementById('form-status');
  const payload = { student_id: user.id };

  // نوع السؤال
  payload.question_type = form.question_type.value;

  // حقول النص
  FIELDS.forEach(f => {
    const ta = form.querySelector(`textarea[name="${f.key}_text"]`);
    if (ta && ta.value.trim()) payload[`${f.key}_text`] = ta.value.trim();
    if (audioUrls[f.key]) payload[`${f.key}_audio`] = audioUrls[f.key];
  });

  // المادة الرابع (الدليل) قد تحتوي على مصدر - افتراضياً نتركها فارغة
  payload.evidence_source = '';

  // التحقق من الحد الأدنى
  if (!payload.topic_text && !payload.topic_audio) {
    status.textContent = '❌ يجب إدخال موضوع السؤال على الأقل';
    status.style.color = 'red';
    return;
  }

  status.textContent = '⏳ جاري الإرسال...';
  status.style.color = '#666';

  try {
    const r = await fetch('/api/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await r.json();
    if (data.ok) {
      status.textContent = '✅ تم إرسال السؤال بنجاح';
      status.style.color = 'green';
      showToast('✅ تم إرسال السؤال');
      setTimeout(() => {
        form.reset();
        Object.keys(audioUrls).forEach(k => delete audioUrls[k]);
        document.querySelectorAll('.audio-container, .search-area').forEach(el => {
          el.style.display = 'none';
          el.innerHTML = '';
          delete el.dataset.init;
        });
        loadMyQuestions();
      }, 800);
    } else {
      throw new Error(data.error || 'فشل');
    }
  } catch (err) {
    status.textContent = '❌ فشل الإرسال: ' + err.message;
    status.style.color = 'red';
  }
}

/* ============ قائمة أسئلتي ============ */
async function loadMyQuestions() {
  const r = await fetch('/api/questions?student_id=' + user.id);
  const list = await r.json();
  const container = document.getElementById('questions-list');
  if (!list.length) {
    container.innerHTML = '<div class="card">لا توجد أسئلة بعد.</div>';
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
      <div class="meta">📅 ${new Date(q.created_at).toLocaleString('ar-EG')}</div>
    `;
    if (q.answers && q.answers.length) {
      q.answers.forEach(a => {
        div.insertAdjacentHTML('beforeend', renderAnswerBlock(a));
      });
    }
    container.appendChild(div);
  });
}

function renderAnswerBlock(a) {
  let inner = `<div class="answer-block">
    <div style="font-size:.85rem; color:#555">👨‍🏫 ${a.teacher_name} — ${new Date(a.created_at).toLocaleString('ar-EG')}</div>`;
  if (a.answer_text) inner += `<p style="margin-top:6px">${a.answer_text}</p>`;
  if (a.answer_audio) inner += `<audio controls src="${a.answer_audio}" style="margin-top:6px; width:100%"></audio>`;
  if (a.answer_video) inner += `<video controls src="${a.answer_video}" style="margin-top:6px; width:100%"></video>`;
  if (a.is_live && a.room_link) inner += `<p style="margin-top:6px">🔴 جلسة مباشرة: <a href="${a.room_link}" target="_blank">${a.room_link}</a></p>`;
  inner += `</div>`;
  return inner;
}

/* ============ التبويبات ============ */
document.getElementById('tab-form').onclick = () => {
  document.getElementById('tab-form').classList.add('active');
  document.getElementById('tab-list').classList.remove('active');
  document.getElementById('view-form').style.display = 'block';
  document.getElementById('view-list').style.display = 'none';
};
document.getElementById('tab-list').onclick = () => {
  document.getElementById('tab-list').classList.add('active');
  document.getElementById('tab-form').classList.remove('active');
  document.getElementById('view-form').style.display = 'none';
  document.getElementById('view-list').style.display = 'block';
  loadMyQuestions();
};

/* ============ تشغيل ============ */
buildForm();
