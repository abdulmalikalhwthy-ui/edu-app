/* ============================================================
   student.js — شاشة الطالب الكاملة (مع المكالمات)
   ============================================================ */

const user = JSON.parse(localStorage.getItem('user') || 'null');
if (!user || user.role !== 'student') window.location.href = 'index.html';

document.getElementById('user-name').textContent = '👤 ' + user.name;
document.getElementById('logout').onclick = (e) => {
  e.preventDefault();
  localStorage.removeItem('user');
  window.location.href = 'index.html';
};

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
let classesList = [];
let lastNotifiedSessionId = null;

/* ============================================================
   نظام الرنين القوي
   ============================================================ */
let ringtoneAudio = null;
let ringtoneVibrateLoop = null;
let ringtoneActive = false;

function startRingtone() {
  if (ringtoneActive) return;
  ringtoneActive = true;

  try {
    if (!ringtoneAudio) {
      ringtoneAudio = new Audio('/ring.mp3');
      ringtoneAudio.loop = true;
      ringtoneAudio.volume = 1.0;
      ringtoneAudio.preload = 'auto';
    }

    const playPromise = ringtoneAudio.play();
    if (playPromise) {
      playPromise.catch(err => {
        console.warn('الصوت محظور');
        const unlock = () => {
          if (ringtoneActive && ringtoneAudio) {
            ringtoneAudio.play().catch(() => {});
          }
          document.removeEventListener('click', unlock);
          document.removeEventListener('touchstart', unlock);
        };
        document.addEventListener('click', unlock);
        document.addEventListener('touchstart', unlock);
      });
    }

    const vibrate = () => {
      if (navigator.vibrate) navigator.vibrate([800, 200, 800, 200, 800]);
    };
    vibrate();
    ringtoneVibrateLoop = setInterval(vibrate, 1800);

    showStopRingButton();
  } catch (e) {
    console.error('Ring error:', e);
  }
}

function stopRingtone() {
  ringtoneActive = false;
  if (ringtoneAudio) {
    try {
      ringtoneAudio.pause();
      ringtoneAudio.currentTime = 0;
    } catch (e) {}
  }
  if (ringtoneVibrateLoop) {
    clearInterval(ringtoneVibrateLoop);
    ringtoneVibrateLoop = null;
  }
  if (navigator.vibrate) navigator.vibrate(0);
  hideStopRingButton();
}

function showStopRingButton() {
  let btn = document.getElementById('stop-ring-btn');
  if (btn) return;
  btn = document.createElement('button');
  btn.id = 'stop-ring-btn';
  btn.type = 'button';
  btn.innerHTML = '🔕 إيقاف الرنين';
  btn.style.cssText = `
    position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
    background: linear-gradient(180deg, #ef4444, #b91c1c);
    color: #fff; font-weight: 900; font-size: 1.05rem;
    padding: 16px 32px; border-radius: 50px; border: 3px solid #fff;
    box-shadow: 0 10px 40px rgba(220, 38, 38, 0.6), 0 0 0 6px rgba(220, 38, 38, 0.2);
    z-index: 99999; cursor: pointer; animation: ringPulse 1s infinite; font-family: inherit;
  `;
  btn.onclick = (e) => { e.stopPropagation(); stopRingtone(); };
  document.body.appendChild(btn);
}

function hideStopRingButton() {
  const btn = document.getElementById('stop-ring-btn');
  if (btn) btn.remove();
}

(function addRingStyles() {
  if (document.getElementById('ring-styles')) return;
  const style = document.createElement('style');
  style.id = 'ring-styles';
  style.textContent = `
    @keyframes ringPulse {
      0%, 100% { transform: translateX(-50%) scale(1); box-shadow: 0 10px 40px rgba(220, 38, 38, 0.6), 0 0 0 6px rgba(220, 38, 38, 0.2); }
      50% { transform: translateX(-50%) scale(1.08); box-shadow: 0 10px 50px rgba(220, 38, 38, 0.9), 0 0 0 14px rgba(220, 38, 38, 0.35); }
    }
  `;
  document.head.appendChild(style);
})();

window.stopRingtone = stopRingtone;

/* ============================================================
   تحميل الفصول
   ============================================================ */
async function loadClasses() {
  try {
    const r = await fetch('/api/classes');
    classesList = await r.json();
  } catch (e) {
    classesList = [];
  }
}

/* ============================================================
   بناء نموذج السؤال
   ============================================================ */
async function buildForm() {
  await loadClasses();
  const form = document.getElementById('question-form');

  let classesOptions = '<option value="">— اختر الفصل —</option>';
  classesList.forEach(c => {
    classesOptions += `<option value="${c.id}">${c.name}</option>`;
  });

  form.innerHTML = `
    <div class="field">
      <label>١- نوع السؤال</label>
      <select name="question_type">
        <option value="new">جديد</option>
        <option value="previous">ناتج درس سابق</option>
      </select>
    </div>
    <div class="field">
      <label>الفصل / الشعبة</label>
      <select name="class_id">${classesOptions}</select>
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
      ${f.audio ? `<button type="button" class="btn-toggle-audio" data-key="${f.key}">🎙️ إضافة تسجيل صوتي</button>
                   <div class="audio-container" data-key="${f.key}" style="display:none"></div>` : ''}
    `;
    form.appendChild(div);
  });

  form.insertAdjacentHTML('beforeend', `
    <button type="submit" class="btn-submit">📤 إرسال السؤال</button>
    <div id="form-status" style="text-align:center; margin-top:8px"></div>
  `);

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
              showToast('✅ تم حفظ التسجيل');
            }
          });
        }
      } else container.style.display = 'none';
    };
  });

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
      } else area.style.display = 'none';
    };
  });

  form.onsubmit = submitQuestion;
}

/* ============================================================
   إرسال السؤال
   ============================================================ */
async function submitQuestion(e) {
  e.preventDefault();
  const form = e.target;
  const status = document.getElementById('form-status');
  const payload = { student_id: user.id };

  payload.question_type = form.question_type.value;
  const classSelect = form.querySelector('select[name="class_id"]');
  if (classSelect && classSelect.value) payload.class_id = parseInt(classSelect.value);

  FIELDS.forEach(f => {
    const ta = form.querySelector(`textarea[name="${f.key}_text"]`);
    if (ta && ta.value.trim()) payload[`${f.key}_text`] = ta.value.trim();
    if (audioUrls[f.key]) payload[`${f.key}_audio`] = audioUrls[f.key];
  });

  if (!payload.topic_text && !payload.topic_audio) {
    status.textContent = '❌ يجب إدخال موضوع السؤال';
    status.style.color = 'var(--danger)';
    return;
  }

  status.textContent = '⏳ جاري الإرسال...';
  status.style.color = 'var(--text-light)';

  try {
    const r = await fetch('/api/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await r.json();
    if (data.ok) {
      status.textContent = '✅ تم الإرسال';
      status.style.color = 'var(--success)';
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
    }
  } catch (err) {
    status.textContent = '❌ فشل الإرسال';
    status.style.color = 'var(--danger)';
  }
}

/* ============================================================
   قائمة أسئلتي
   ============================================================ */
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
      ${q.class_name ? `<div class="meta">📚 ${q.class_name}</div>` : ''}
    `;
    if (q.answers && q.answers.length) {
      q.answers.forEach(a => {
        let inner = `<div class="answer-block">
          <div style="font-size:.85rem;color:#555">👨‍🏫 ${a.teacher_name} — ${new Date(a.created_at).toLocaleString('ar-EG')}</div>`;
        if (a.answer_text) inner += `<p style="margin-top:6px">${a.answer_text}</p>`;
        if (a.answer_audio) inner += `<audio controls src="${a.answer_audio}" style="margin-top:6px;width:100%"></audio>`;
        if (a.answer_video) inner += `<video controls src="${a.answer_video}" style="margin-top:6px;width:100%"></video>`;
        inner += `</div>`;
        div.insertAdjacentHTML('beforeend', inner);
      });
    }
    container.appendChild(div);
  });
}

/* ============================================================
   الامتحانات
   ============================================================ */
async function loadExams() {
  const r = await fetch('/api/exams?status=published');
  const list = await r.json();
  const container = document.getElementById('exams-list');

  if (!list.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--text-light);padding:20px">لا توجد امتحانات متاحة</div>';
    return;
  }

  container.innerHTML = '';
  for (const exam of list) {
    const attemptResp = await fetch(`/api/exams/${exam.id}/my-attempt?student_id=${user.id}`);
    const attempt = await attemptResp.json();

    const div = document.createElement('div');
    div.className = 'question-item';
    div.innerHTML = `
      <h3>📝 ${exam.title}
        <span class="badge ${attempt ? 'answered' : 'pending'}">${attempt ? 'تم التقديم' : 'متاح'}</span>
      </h3>
      <div class="meta">👨‍🏫 ${exam.teacher_name}</div>
      ${exam.class_name ? `<div class="meta">📚 ${exam.class_name}</div>` : ''}
      <div class="meta">⏱️ ${exam.duration_minutes} دقيقة — 🎯 ${exam.total_points} نقطة</div>
      ${attempt ? `<div class="meta" style="color:var(--success);font-weight:900">🏆 نتيجتك: ${attempt.score} / ${attempt.max_score}</div>` : ''}
      <button class="btn-submit start-exam" data-id="${exam.id}" type="button" style="margin-top:10px" ${attempt ? 'disabled' : ''}>
        ${attempt ? '✅ تم التقديم' : '🚀 بدء الامتحان'}
      </button>
    `;
    div.querySelector('.start-exam').onclick = () => startExam(exam.id);
    container.appendChild(div);
  }
}

async function startExam(examId) {
  if (!confirm('هل أنت مستعد لبدء الامتحان؟')) return;

  const r = await fetch('/api/exams/' + examId);
  const exam = await r.json();

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  let questionsHtml = '';
  exam.questions.forEach((q, i) => {
    let optionsHtml = '';
    if (q.question_type === 'mcq') {
      optionsHtml = (q.options || []).map((opt) => `
        <label style="display:block; padding:10px; border:2px solid var(--border); border-radius:10px; margin-bottom:8px; cursor:pointer; background:#f8fafc">
          <input type="radio" name="q${q.id}" value="${opt}" style="margin-inline-end:8px">
          <b>${opt}</b>
        </label>
      `).join('');
    } else if (q.question_type === 'truefalse') {
      optionsHtml = `
        <label style="display:block; padding:10px; border:2px solid var(--border); border-radius:10px; margin-bottom:8px; cursor:pointer">
          <input type="radio" name="q${q.id}" value="صحيح" style="margin-inline-end:8px"> ✅ صحيح
        </label>
        <label style="display:block; padding:10px; border:2px solid var(--border); border-radius:10px; cursor:pointer">
          <input type="radio" name="q${q.id}" value="خطأ" style="margin-inline-end:8px"> ❌ خطأ
        </label>
      `;
    } else {
      optionsHtml = `<textarea class="essay-answer" data-qid="${q.id}" rows="4" placeholder="اكتب إجابتك..."></textarea>`;
    }
    questionsHtml += `
      <div class="field" data-qid="${q.id}" data-qtype="${q.question_type}" data-points="${q.points}">
        <label>س${i + 1}: ${q.question_text} <span style="color:var(--primary);font-size:.85rem">(${q.points} نقطة)</span></label>
        ${optionsHtml}
      </div>
    `;
  });

  backdrop.innerHTML = `
    <div class="modal" style="max-width:800px">
      <h2>📝 ${exam.title}</h2>
      <div style="background:#fee2e2; padding:12px; border-radius:12px; text-align:center; margin-bottom:14px">
        ⏱️ الوقت المتبقي: <b id="timer" style="font-size:1.4rem; font-family:monospace; color:var(--danger)">--:--</b>
      </div>
      <div id="exam-questions">${questionsHtml}</div>
      <button id="submit-exam" class="btn-submit" type="button">📤 تسليم الامتحان</button>
      <button id="close-exam" class="btn-danger" type="button" style="margin-top:8px; width:100%">إلغاء</button>
      <div id="exam-status" style="text-align:center; margin-top:10px"></div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const totalSeconds = (exam.duration_minutes || 30) * 60;
  let remaining = totalSeconds;
  const timerEl = backdrop.querySelector('#timer');

  const tick = () => {
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    timerEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    if (remaining <= 0) {
      clearInterval(interval);
      backdrop.querySelector('#submit-exam').click();
    }
    remaining--;
  };
  tick();
  const interval = setInterval(tick, 1000);

  backdrop.querySelector('#close-exam').onclick = () => {
    if (!confirm('هل تريد إلغاء الامتحان؟')) return;
    clearInterval(interval);
    backdrop.remove();
  };

  backdrop.querySelector('#submit-exam').onclick = async () => {
    if (!confirm('هل أنت متأكد من تسليم الامتحان؟')) return;
    clearInterval(interval);

    const answers = {};
    backdrop.querySelectorAll('#exam-questions .field').forEach(field => {
      const qid = field.dataset.qid;
      const qtype = field.dataset.qtype;
      if (qtype === 'essay') {
        const ta = field.querySelector('.essay-answer');
        answers[qid] = ta ? ta.value.trim() : '';
      } else {
        const selected = field.querySelector(`input[name="q${qid}"]:checked`);
        answers[qid] = selected ? selected.value : '';
      }
    });

    const status = backdrop.querySelector('#exam-status');
    status.textContent = '⏳ جاري التسليم...';

    try {
      const r = await fetch(`/api/exams/${examId}/attempt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: user.id, answers })
      });
      const data = await r.json();
      if (data.ok) {
        backdrop.querySelector('#exam-questions').innerHTML = `
          <div style="text-align:center; padding:30px; background:#d1fae5; border-radius:20px">
            <div style="font-size:4rem">🎉</div>
            <h2 style="color:#065f46">تم التسليم!</h2>
            <div style="font-size:2.5rem; font-weight:900; color:#059669; margin:16px 0">
              ${data.score} / ${data.max_score}
            </div>
            <p>نسبتك: <b>${Math.round(data.score / data.max_score * 100)}%</b></p>
          </div>
        `;
        backdrop.querySelector('#submit-exam').style.display = 'none';
        backdrop.querySelector('#close-exam').textContent = 'إغلاق';
        backdrop.querySelector('#close-exam').onclick = () => {
          backdrop.remove();
          loadExams();
        };
      } else {
        status.textContent = '❌ ' + (data.error || 'فشل');
        status.style.color = 'var(--danger)';
      }
    } catch (e) {
      status.textContent = '❌ خطأ';
      status.style.color = 'var(--danger)';
    }
  };
}

/* ============================================================
   الاستطلاعات
   ============================================================ */
async function loadPolls() {
  const r = await fetch('/api/polls?status=active');
  const list = await r.json();
  const container = document.getElementById('polls-list');

  if (!list.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--text-light);padding:20px">لا توجد استطلاعات</div>';
    return;
  }

  container.innerHTML = '';
  for (const poll of list) {
    const voteResp = await fetch(`/api/polls/${poll.id}/my-vote?student_id=${user.id}`);
    const myVote = await voteResp.json();

    const div = document.createElement('div');
    div.className = 'question-item';

    let optionsHtml = poll.options.map((opt, i) => {
      const isSelected = myVote && myVote.choice_index === i;
      return `
        <label style="display:block; padding:12px; border:2px solid ${isSelected ? 'var(--success)' : 'var(--border)'}; border-radius:12px; margin-bottom:8px; cursor:${myVote ? 'default' : 'pointer'}; background:${isSelected ? '#d1fae5' : '#f8fafc'}">
          ${myVote ? '' : `<input type="radio" name="poll${poll.id}" value="${i}" style="margin-inline-end:8px">`}
          <b>${opt}</b>
          ${isSelected ? '<span style="float:left; color:var(--success)">✅</span>' : ''}
        </label>
      `;
    }).join('');

    div.innerHTML = `
      <h3>📊 ${poll.question}
        <span class="badge ${myVote ? 'answered' : 'pending'}">${myVote ? 'صوّتت' : 'شارك'}</span>
      </h3>
      <div class="meta">👨‍🏫 ${poll.teacher_name}</div>
      <div style="margin-top:12px">${optionsHtml}</div>
      ${myVote ? '' : `<button class="btn-submit submit-poll" data-id="${poll.id}" type="button">✅ إرسال التصويت</button>`}
      <button class="btn-search show-results" data-id="${poll.id}" type="button" style="width:100%; margin-top:8px">📊 عرض النتائج</button>
    `;

    if (!myVote) {
      div.querySelector('.submit-poll').onclick = async () => {
        const sel = div.querySelector(`input[name="poll${poll.id}"]:checked`);
        if (!sel) return showToast('اختر خياراً');
        const r = await fetch(`/api/polls/${poll.id}/vote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ student_id: user.id, choice_index: parseInt(sel.value) })
        });
        const data = await r.json();
        if (data.ok) { showToast('✅ تم'); loadPolls(); }
        else showToast('❌ ' + (data.error || 'فشل'));
      };
    }

    div.querySelector('.show-results').onclick = () => showPollResults(poll.id);
    container.appendChild(div);
  }
}

async function showPollResults(pollId) {
  const r = await fetch(`/api/polls/${pollId}/results`);
  const data = await r.json();
  const { poll, results, total_votes } = data;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  let bars = results.map(r => {
    const pct = total_votes ? Math.round(r.count / total_votes * 100) : 0;
    return `
      <div style="margin-bottom:12px">
        <div style="display:flex; justify-content:space-between; margin-bottom:4px">
          <b>${r.label}</b>
          <span style="color:var(--text-light)">${r.count} (${pct}%)</span>
        </div>
        <div style="background:#e2e8f0; border-radius:10px; height:24px; overflow:hidden">
          <div style="background:linear-gradient(90deg, #2563eb, #7c3aed); height:100%; width:${pct}%"></div>
        </div>
      </div>
    `;
  }).join('');

  backdrop.innerHTML = `
    <div class="modal">
      <h2>📊 ${poll.question}</h2>
      <p style="text-align:center;color:var(--text-light);margin-bottom:16px">إجمالي: <b>${total_votes}</b></p>
      ${bars}
      <button id="close-results" class="btn-danger" type="button" style="width:100%;margin-top:14px">إغلاق</button>
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.querySelector('#close-results').onclick = () => backdrop.remove();
}

/* ============================================================
   الإشعارات
   ============================================================ */
async function loadNotifications() {
  const r = await fetch(`/api/notifications?student_id=${user.id}`);
  const list = await r.json();
  const unread = list.filter(n => !n.is_read).length;

  const badge = document.getElementById('notif-badge');
  const countEl = document.getElementById('notif-count');
  if (badge && countEl) {
    if (unread > 0) {
      badge.style.display = 'inline-block';
      countEl.textContent = unread;
    } else {
      badge.style.display = 'none';
    }
  }

  const container = document.getElementById('notifs-list');
  if (!container) return;

  if (!list.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--text-light);padding:20px">لا توجد إشعارات</div>';
    return;
  }

  container.innerHTML = '';
  list.forEach(n => {
    const div = document.createElement('div');
    div.className = 'question-item';
    div.style.opacity = n.is_read ? '0.6' : '1';
    div.innerHTML = `
      <div style="font-size:.95rem; font-weight:600">${n.is_read ? '✓' : '🔴'} ${n.message}</div>
      <div class="meta">📅 ${new Date(n.created_at).toLocaleString('ar-EG')}</div>
    `;
    container.appendChild(div);
  });
}

const readAllBtn = document.getElementById('read-all');
if (readAllBtn) {
  readAllBtn.onclick = async () => {
    await fetch('/api/notifications/read-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: user.id })
    });
    showToast('✅ تم');
    loadNotifications();
  };
}

const notifBadge = document.getElementById('notif-badge');
if (notifBadge) {
  notifBadge.onclick = () => {
    const tab = document.getElementById('tab-notifs');
    if (tab) tab.click();
  };
}

/* ============================================================
   زر تفعيل الإشعارات
   ============================================================ */
const enableNotifBtn = document.getElementById('enable-notifications');

async function updateEnableBtn() {
  if (!enableNotifBtn) return;
  if (!('Notification' in window)) {
    enableNotifBtn.textContent = '🔕';
    return;
  }
  if (Notification.permission === 'granted') {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        enableNotifBtn.textContent = '✅ مفعّل';
        enableNotifBtn.style.background = 'rgba(16,185,129,.5)';
        return;
      }
    } catch (e) {}
    enableNotifBtn.textContent = '⚠️ جزئي';
  } else if (Notification.permission === 'denied') {
    enableNotifBtn.textContent = '❌ محظور';
    enableNotifBtn.style.background = 'rgba(239,68,68,.5)';
  } else {
    enableNotifBtn.textContent = '🔔 تفعيل';
  }
}
updateEnableBtn();

if (enableNotifBtn) {
  enableNotifBtn.onclick = async (e) => {
    e.preventDefault();
    if (!('Notification' in window)) return showToast('⚠️ غير مدعوم');
    if (Notification.permission === 'denied') {
      alert('⚠️ محظور\n\nافتح إعدادات Chrome:\n🔒 → الإعدادات → الإشعارات → اسمح');
      return;
    }
    enableNotifBtn.textContent = '⏳...';
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        enableNotifBtn.textContent = '🔔 تفعيل';
        return showToast('❌');
      }
      if (window.PushClient) {
        await PushClient.subscribeToPush(user.id);
      }
      enableNotifBtn.textContent = '✅ مفعّل';
      enableNotifBtn.style.background = 'rgba(16,185,129,.5)';
      showToast('✅ تم التفعيل');
    } catch (err) {
      enableNotifBtn.textContent = '🔔 تفعيل';
      showToast('❌ ' + err.message);
    }
  };
}

/* ============================================================
   التنبيه بالحصة + الرنين
   ============================================================ */
async function checkLiveSessions() {
  try {
    const r = await fetch('/api/live-sessions');
    const sessions = await r.json();
    const alertBox = document.getElementById('live-alert');

    if (sessions.length > 0) {
      const latest = sessions[0];
      if (alertBox) {
        alertBox.style.display = 'block';
        alertBox.innerHTML = `
          <span>🔴 <b>${latest.title}</b> — بدأ الأستاذ ${latest.teacher_name} حصة مباشرة!</span>
          <a href="${latest.room_link}${latest.password ? '#config.callPassword=' + encodeURIComponent(latest.password) : ''}" target="_blank"
             class="btn-submit" style="display:block; text-decoration:none; text-align:center; margin-top:10px; padding:12px"
             onclick="if(window.stopRingtone) window.stopRingtone();">
             🚪 دخول القاعة
          </a>
          ${latest.password ? `<div style="text-align:center; margin-top:8px; font-size:.85rem">🔐 كلمة المرور: <b style="font-family:monospace; color:var(--danger)">${latest.password}</b></div>` : ''}
        `;
      }

      if (latest.id !== lastNotifiedSessionId) {
        lastNotifiedSessionId = latest.id;
        startRingtone();

        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg && reg.showNotification) {
              await reg.showNotification('🔴 حصة مباشرة الآن!', {
                body: `${latest.title} — انقر للانضمام`,
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                vibrate: [800, 200, 800, 200, 800],
                requireInteraction: true,
                tag: 'live-session-' + latest.id,
                renotify: true,
                dir: 'rtl',
                lang: 'ar',
                data: {
                  url: latest.room_link + (latest.password ? '#config.callPassword=' + encodeURIComponent(latest.password) : ''),
                  type: 'live_session',
                  room_link: latest.room_link,
                  password: latest.password || null
                },
                actions: [
                  { action: 'join', title: '🚪 دخول القاعة' },
                  { action: 'close', title: 'إيقاف' }
                ]
              });
            }
          } catch (e) {}
        }
      }
    } else {
      if (alertBox) alertBox.style.display = 'none';
      if (lastNotifiedSessionId !== null) stopRingtone();
      lastNotifiedSessionId = null;
    }
  } catch (e) {}
}

/* ============================================================
   التبويبات
   ============================================================ */
const tabs = ['form', 'list', 'exams', 'polls', 'notifs', 'calls'];
tabs.forEach(t => {
  const tabEl = document.getElementById('tab-' + t);
  if (!tabEl) return;
  tabEl.onclick = () => {
    tabs.forEach(x => {
      const tb = document.getElementById('tab-' + x);
      const vw = document.getElementById('view-' + x);
      if (tb) tb.classList.toggle('active', x === t);
      if (vw) vw.style.display = x === t ? 'block' : 'none';
    });
    if (t === 'list') loadMyQuestions();
    if (t === 'exams') loadExams();
    if (t === 'polls') loadPolls();
    if (t === 'notifs') loadNotifications();
    if (t === 'calls' && window.CallsApp) {
      window.CallsApp.loadContacts(document.getElementById('contacts-list'));
    }
  };
});

const refreshExamsBtn = document.getElementById('refresh-exams');
if (refreshExamsBtn) refreshExamsBtn.onclick = loadExams;

const refreshPollsBtn = document.getElementById('refresh-polls');
if (refreshPollsBtn) refreshPollsBtn.onclick = loadPolls;

window.addEventListener('beforeunload', () => { stopRingtone(); });

/* ============================================================
   تشغيل
   ============================================================ */
buildForm();
loadNotifications();
checkLiveSessions();

setInterval(loadNotifications, 30000);
setInterval(checkLiveSessions, 20000);

/* ============================================================
   تفعيل Push تلقائياً
   ============================================================ */
(async function initPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    await navigator.serviceWorker.ready;
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) return;

    setTimeout(async () => {
      if (Notification.permission === 'granted') {
        const u = JSON.parse(localStorage.getItem('user') || 'null');
        if (u && u.id && window.PushClient) {
          await PushClient.subscribeToPush(u.id);
        }
      } else if (Notification.permission !== 'denied') {
        const box = document.createElement('div');
        box.style.cssText = 'position:fixed; bottom:100px; left:16px; right:16px; background:linear-gradient(135deg,#fef3c7,#fde68a); border:3px solid #f59e0b; border-radius:18px; padding:16px; z-index:3000; box-shadow:0 10px 30px rgba(245,158,11,.3); text-align:center;';
        box.innerHTML = `
          <div style="font-weight:800; color:#78350f; margin-bottom:10px; font-size:1rem">🔔 فعّل الإشعارات</div>
          <div style="font-size:.85rem; color:#92400e; margin-bottom:12px; line-height:1.6">
            لتصلك إشعارات الحصص المباشرة والامتحانات فوراً.
          </div>
          <button id="enable-push-btn" style="background:linear-gradient(180deg,#f59e0b,#d97706); padding:12px 24px; border-radius:12px; color:#fff; font-weight:800; border:none; box-shadow:0 4px 0 #92400e; cursor:pointer">
            ✅ تفعيل الآن
          </button>
          <button id="dismiss-push-btn" style="background:transparent; border:none; color:#92400e; margin-top:8px; cursor:pointer; font-size:.85rem">لاحقاً</button>
        `;
        document.body.appendChild(box);

        document.getElementById('enable-push-btn').onclick = async () => {
          const u = JSON.parse(localStorage.getItem('user') || 'null');
          if (!u || !u.id) return;
          const permission = await Notification.requestPermission();
          if (permission !== 'granted') {
            box.innerHTML = '<div style="font-weight:800; color:#991b1b">⚠️ لم يُمنح</div>';
            setTimeout(() => box.remove(), 3000);
            return;
          }
          if (window.PushClient) await PushClient.subscribeToPush(u.id);
          box.innerHTML = '<div style="font-weight:800; color:#065f46">✅ تم!</div>';
          setTimeout(() => box.remove(), 2000);
          updateEnableBtn();
        };
        document.getElementById('dismiss-push-btn').onclick = () => box.remove();
      }
    }, 2500);
  } catch (e) {}
})();
