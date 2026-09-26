/* أداة تسجيل الصوت/الفيديو وإرفاقه تلقائياً */
class MediaRecorderHelper {
  constructor(container, options = {}) {
    this.container = container;
    this.video = options.video || false;
    this.maxSeconds = options.maxSeconds || 180;
    this.onComplete = options.onComplete || (() => {});
    this.build();
  }

  build() {
    this.container.innerHTML = `
      <div class="recorder">
        <button type="button" class="btn-rec">${this.video ? '🎥 بدء التسجيل المرئي' : '🎙️ بدء التسجيل الصوتي'}</button>
        <button type="button" class="btn-stop" style="display:none">⏹️ إيقاف وإرسال</button>
        <span class="timer" style="display:none">00:00</span>
        <span class="status"></span>
        <div class="preview"></div>
      </div>
    `;
    this.btnRec = this.container.querySelector('.btn-rec');
    this.btnStop = this.container.querySelector('.btn-stop');
    this.timerEl = this.container.querySelector('.timer');
    this.statusEl = this.container.querySelector('.status');
    this.previewEl = this.container.querySelector('.preview');
    this.btnRec.onclick = () => this.start();
    this.btnStop.onclick = () => this.stop();
  }

  async start() {
    try {
      const constraints = this.video
        ? { audio: true, video: { facingMode: 'user' } }
        : { audio: true };
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.chunks = [];
      this.rec = new MediaRecorder(this.stream);
      this.rec.ondataavailable = e => e.data.size && this.chunks.push(e.data);
      this.rec.onstop = () => this.finish();
      this.rec.start();

      this.btnRec.style.display = 'none';
      this.btnStop.style.display = 'inline-block';
      this.timerEl.style.display = 'inline-block';
      this.statusEl.textContent = '⏺️ جاري التسجيل...';

      this.startTime = Date.now();
      this.timer = setInterval(() => {
        const s = Math.floor((Date.now() - this.startTime) / 1000);
        this.timerEl.textContent =
          String(Math.floor(s / 60)).padStart(2, '0') + ':' +
          String(s % 60).padStart(2, '0');
        if (s >= this.maxSeconds) this.stop();
      }, 1000);
    } catch (e) {
      this.statusEl.textContent = '❌ لا يمكن الوصول للميكروفون/الكاميرا';
      console.error(e);
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
      v.src = url; v.controls = true; v.style.maxWidth = '100%';
      this.previewEl.appendChild(v);
    } else {
      const a = document.createElement('audio');
      a.src = url; a.controls = true;
      this.previewEl.appendChild(a);
    }

    this.btnRec.style.display = 'inline-block';
    this.btnRec.textContent = '🔄 إعادة التسجيل';
    this.btnStop.style.display = 'none';
    this.statusEl.textContent = '⬆️ جاري الرفع...';

    try {
      const fd = new FormData();
      fd.append('file', blob, 'rec-' + Date.now() + '.webm');
      const r = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await r.json();
      if (data.url) {
        this.statusEl.textContent = '✅ تم الرفع';
        this.onComplete(data.url);
      } else {
        throw new Error('no url');
      }
    } catch (e) {
      this.statusEl.textContent = '❌ فشل الرفع';
      console.error(e);
    }
  }
}

/* Toast بسيط */
function showToast(msg, ms = 2500) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

/* محرك البحث (قرآن + روايات) - مشترك */
function renderSearchResults(containerEl, key) {
  containerEl.innerHTML = `
    <div style="display:flex; gap:6px; margin-top:6px">
      <input type="text" class="search-q" placeholder="اكتب كلمة للبحث..." style="flex:1">
      <button type="button" class="btn-do-search">🔍</button>
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
    results.innerHTML = '<div class="item">جاري البحث...</div>';
    try {
      const [qur, had] = await Promise.all([
        fetch('/api/search/quran?q=' + encodeURIComponent(q)).then(r => r.json()),
        fetch('/api/search/hadith?q=' + encodeURIComponent(q)).then(r => r.json())
      ]);
      let html = '';
      (qur.matches || []).forEach(m => {
        html += `<div class="item" data-text="${escapeAttr(m.text)}">
          <span class="ref">📖 ${m.reference}</span>
          ${m.text}
        </div>`;
      });
      if (had.html) {
        html += `<div style="font-size:.85rem; font-weight:bold; margin:8px 0">📚 الروايات:</div>`;
        html += `<div class="item">${had.html}</div>`;
      }
      if (!html) html = '<div class="item">لا نتائج</div>';
      results.innerHTML = html;
      // عند النقر على نتيجة، تُنسخ إلى textarea
      results.querySelectorAll('.item[data-text]').forEach(el => {
        el.onclick = () => {
          const ta = document.querySelector(`textarea[name="${key}_text"]`);
          if (ta) {
            ta.value = el.dataset.text;
            showToast('✅ تم إدراج النص');
          }
          const snippetTa = document.querySelector('textarea[name="evidence_snippet_text"]');
          if (snippetTa && key === 'evidence') {
            snippetTa.value = el.dataset.text.slice(0, 100);
          }
        };
      });
    } catch (e) {
      results.innerHTML = '<div class="item">فشل البحث</div>';
    }
  };

  btn.onclick = doSearch;
  input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } };
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
