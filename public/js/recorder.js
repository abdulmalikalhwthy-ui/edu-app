/* ============================================================
   recorder.js — نسخة محسّنة مع دعم أذونات أندرويد (WebView)
   ============================================================ */

class MediaRecorderHelper {
  constructor(container, options = {}) {
    this.container = container;
    this.video = options.video || false;
    this.maxSeconds = options.maxSeconds || 180;
    this.onComplete = options.onComplete || (() => {});
    this.build();
  }

  build() {
    const recLabel = this.video ? '🎥 بدء التسجيل المرئي' : '🎙️ بدء التسجيل الصوتي';
    this.container.innerHTML = `
      <div class="recorder-box">
        <div class="recorder-controls">
          <button type="button" class="btn-rec">
            <span class="rec-icon">●</span> ${recLabel}
          </button>
          <button type="button" class="btn-stop" style="display:none">
            <span class="stop-icon">■</span> إيقاف وإرسال
          </button>
          <span class="timer" style="display:none">00:00</span>
        </div>
        <div class="status-line"></div>
        <div class="preview"></div>
      </div>
    `;
    this.btnRec = this.container.querySelector('.btn-rec');
    this.btnStop = this.container.querySelector('.btn-stop');
    this.timerEl = this.container.querySelector('.timer');
    this.statusEl = this.container.querySelector('.status-line');
    this.previewEl = this.container.querySelector('.preview');
    this.btnRec.onclick = () => this.start();
    this.btnStop.onclick = () => this.stop();
  }

  /* طلب إذن من نظام أندرويد عبر جسر WebIntoApp */
  requestNativePermission(permType) {
    return new Promise((resolve) => {
      if (typeof window.Native === 'undefined' || !window.Native.call) {
        resolve(true);
        return;
      }
      try {
        window.Native.call('permissions', {
          action: 'ASK_FOR_PERMISSION',
          payload: { permission: permType }
        }, (response) => {
          try {
            const data = typeof response === 'string' ? JSON.parse(response) : response;
            const status = data?.params?.permissionStatus
              || data?.permissionStatus
              || 'GRANTED';
            resolve(status === 'GRANTED');
          } catch (e) {
            resolve(true);
          }
        });
      } catch (e) {
        resolve(true);
      }
    });
  }

  async start() {
    this.setStatus('⏳ جاري التحقق من الأذونات...');

    const hasAudio = await this.requestNativePermission('AUDIO');
    if (!hasAudio) {
      this.setStatus('❌ لم يُمنح إذن الميكروفون. افتح الإعدادات واسمح بالوصول.', 'error');
      this.showSettingsHint();
      return;
    }

    if (this.video) {
      const hasCam = await this.requestNativePermission('CAMERA');
      if (!hasCam) {
        this.setStatus('❌ لم يُمنح إذن الكاميرا.', 'error');
        return;
      }
    }

    this.setStatus('⏺️ جاري التشغيل...');

    try {
      const constraints = this.video
        ? { audio: true, video: { facingMode: 'user', width: { ideal: 640 } } }
        : { audio: { echoCancellation: true, noiseSuppression: true } };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);

      const mimeType = this.video ? 'video/webm' : 'audio/webm';
      const options = MediaRecorder.isTypeSupported(mimeType) ? { mimeType } : {};

      this.chunks = [];
      this.rec = new MediaRecorder(this.stream, options);
      this.rec.ondataavailable = e => e.data.size && this.chunks.push(e.data);
      this.rec.onstop = () => this.finish();
      this.rec.start();

      this.btnRec.style.display = 'none';
      this.btnStop.style.display = 'inline-flex';
      this.timerEl.style.display = 'inline-block';
      this.setStatus('🔴 جاري التسجيل...', 'recording');

      this.startTime = Date.now();
      this.timer = setInterval(() => {
        const s = Math.floor((Date.now() - this.startTime) / 1000);
        this.timerEl.textContent =
          String(Math.floor(s / 60)).padStart(2, '0') + ':' +
          String(s % 60).padStart(2, '0');
        if (s >= this.maxSeconds) this.stop();
      }, 1000);
    } catch (err) {
      console.error('Recorder error:', err);
      let msg = '❌ تعذّر الوصول للميكروفون';
      if (err.name === 'NotAllowedError') msg = '❌ الإذن مرفوض';
      else if (err.name === 'NotFoundError') msg = '❌ لا يوجد ميكروفون';
      this.setStatus(msg, 'error');
    }
  }

  stop() {
    if (this.rec && this.rec.state !== 'inactive') this.rec.stop();
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    clearInterval(this.timer);
  }

  async finish() {
    const blob = new Blob(this.chunks, {
      type: this.video ? 'video/webm' : 'audio/webm'
    });
    const url = URL.createObjectURL(blob);

    this.previewEl.innerHTML = '';
    if (this.video) {
      const v = document.createElement('video');
      v.src = url; v.controls = true; v.className = 'preview-media';
      this.previewEl.appendChild(v);
    } else {
      const a = document.createElement('audio');
      a.src = url; a.controls = true; a.className = 'preview-media';
      this.previewEl.appendChild(a);
    }

    this.btnRec.style.display = 'inline-flex';
    this.btnRec.innerHTML = '<span class="rec-icon">↻</span> إعادة التسجيل';
    this.btnStop.style.display = 'none';
    this.setStatus('⬆️ جاري الرفع...');

    try {
      const fd = new FormData();
      fd.append('file', blob, 'rec-' + Date.now() + '.webm');
      const r = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      if (data.url) {
        this.setStatus('✅ تم الرفع بنجاح', 'success');
        this.onComplete(data.url);
      } else {
        throw new Error('no url');
      }
    } catch (err) {
      console.error('Upload failed:', err);
      this.setStatus('❌ فشل الرفع، أعد المحاولة', 'error');
    }
  }

  setStatus(msg, type = '') {
    this.statusEl.textContent = msg;
    this.statusEl.className = 'status-line ' + type;
  }

  showSettingsHint() {
    const hint = document.createElement('div');
    hint.className = 'perm-hint';
    hint.innerHTML = '⚙️ اذهب لإعدادات الهاتف → التطبيقات → <b>alsoaalmaarfi</b> → الأذونات → فعّل الميكروفون';
    this.container.appendChild(hint);
  }
}

/* ========== إشعار Toast ========== */
function showToast(msg, ms = 2500) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

/* ========== محرك البحث ========== */
function renderSearchResults(containerEl, key) {
  containerEl.innerHTML = `
    <div class="search-bar">
      <input type="text" class="search-q" placeholder="اكتب كلمة للبحث في القرآن والروايات...">
      <button type="button" class="btn-do-search">🔍 بحث</button>
    </div>
    <div class="search-results" style="display:none"></div>
  `;
  const input = containerEl.querySelector('.search-q');
  const btn = containerEl.querySelector('.btn-do-search');
  const results = containerEl.querySelector('.search-results');

  const doSearch = async () => {
    const q = input.value.trim();
    if (!q) return;
    results.style.display = 'block';
    results.innerHTML = '<div class="item loading">⏳ جاري البحث...</div>';
    try {
      const [qur, had] = await Promise.all([
        fetch('/api/search/quran?q=' + encodeURIComponent(q)).then(r => r.json()),
        fetch('/api/search/hadith?q=' + encodeURIComponent(q)).then(r => r.json())
      ]);
      let html = '';
      if ((qur.matches || []).length) {
        html += `<div class="results-header">📖 نتائج القرآن</div>`;
        (qur.matches || []).forEach(m => {
          html += `<div class="item" data-text="${escapeAttr(m.text)}">
            <span class="ref">${m.reference}</span>
            ${m.text}
          </div>`;
        });
      }
      if (had.html) {
        html += `<div class="results-header">📚 نتائج الروايات</div>`;
        html += `<div class="item">${had.html}</div>`;
      }
      if (!html) html = '<div class="item">لا توجد نتائج</div>';
      results.innerHTML = html;
      results.querySelectorAll('.item[data-text]').forEach(el => {
        el.onclick = () => {
          const ta = document.querySelector(`textarea[name="${key}_text"]`);
          if (ta) { ta.value = el.dataset.text; showToast('✅ تم إدراج النص'); }
        };
      });
    } catch (e) {
      results.innerHTML = '<div class="item">❌ فشل البحث</div>';
    }
  };

  btn.onclick = doSearch;
  input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } };
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
