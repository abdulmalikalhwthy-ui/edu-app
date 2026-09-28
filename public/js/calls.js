/* ============================================================
   calls.js — نظام المكالمات الصوتية والمرئية
   ============================================================ */

(function() {
  const currentUser = JSON.parse(localStorage.getItem('user') || 'null');
  if (!currentUser) return;

  let activeCall = null;
  let pendingCallCheck = null;
  let callRingtone = null;
  let incomingCallModal = null;

  /* ============================================================
     تشغيل رنين المكالمة
     ============================================================ */
  function startCallRingtone() {
    try {
      if (!callRingtone) {
        callRingtone = new Audio('/ring.mp3');
        callRingtone.loop = true;
        callRingtone.volume = 1.0;
      }
      callRingtone.currentTime = 0;
      const p = callRingtone.play();
      if (p) p.catch(() => {
        const unlock = () => {
          callRingtone.play().catch(() => {});
          document.removeEventListener('click', unlock);
          document.removeEventListener('touchstart', unlock);
        };
        document.addEventListener('click', unlock);
        document.addEventListener('touchstart', unlock);
      });
      if (navigator.vibrate) navigator.vibrate([600, 200, 600, 200, 600]);
    } catch (e) {}
  }

  function stopCallRingtone() {
    if (callRingtone) {
      try {
        callRingtone.pause();
        callRingtone.currentTime = 0;
      } catch (e) {}
    }
    if (navigator.vibrate) navigator.vibrate(0);
  }

  /* ============================================================
     نافذة المكالمة الواردة
     ============================================================ */
  function showIncomingCallModal(call) {
    if (incomingCallModal) return;

    incomingCallModal = document.createElement('div');
    incomingCallModal.className = 'modal-backdrop';
    incomingCallModal.style.zIndex = '99998';
    incomingCallModal.innerHTML = `
      <div class="modal" style="max-width:400px;text-align:center;padding:30px">
        <div style="font-size:4rem;animation:callPulse 1s infinite">📞</div>
        <h2 style="color:var(--primary-dark);border:none;padding:0;margin-bottom:8px">مكالمة واردة</h2>
        <div style="font-size:1.2rem;font-weight:900;color:var(--text);margin-bottom:6px">${call.from_user_name}</div>
        <div style="font-size:.85rem;color:var(--text-light);margin-bottom:20px">
          ${call.call_type === 'audio' ? '🎙️ مكالمة صوتية' : '🎥 مكالمة مرئية'}
        </div>

        <div style="display:flex;gap:12px;justify-content:center;margin-top:20px">
          <button id="call-accept" class="btn-submit" style="flex:1;background:linear-gradient(180deg,#34d399,#10b981);padding:16px">
            ✅ قبول
          </button>
          <button id="call-reject" class="btn-danger" style="flex:1;padding:16px">
            ❌ رفض
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(incomingCallModal);

    startCallRingtone();

    incomingCallModal.querySelector('#call-accept').onclick = () => {
      stopCallRingtone();
      incomingCallModal.remove();
      incomingCallModal = null;
      acceptCall(call);
    };

    incomingCallModal.querySelector('#call-reject').onclick = async () => {
      stopCallRingtone();
      incomingCallModal.remove();
      incomingCallModal = null;
      await fetch(`/api/calls/${call.id}/reject`, { method: 'POST' });
    };
  }

  /* إضافة CSS */
  if (!document.getElementById('call-styles')) {
    const style = document.createElement('style');
    style.id = 'call-styles';
    style.textContent = `
      @keyframes callPulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.2); opacity: 0.7; }
      }
      .contact-row {
        display:flex;align-items:center;gap:12px;padding:14px 16px;
        background:#fff;border:2px solid var(--border);border-radius:14px;
        margin-bottom:10px;transition:all .2s;
      }
      .contact-row:hover { border-color: var(--primary); transform: translateY(-2px); box-shadow: 0 6px 16px rgba(37,99,235,.12); }
      .contact-avatar {
        width:48px;height:48px;border-radius:50%;
        background:linear-gradient(135deg,#2563eb,#7c3aed);
        display:flex;align-items:center;justify-content:center;
        color:#fff;font-weight:900;font-size:1.3rem;
      }
      .contact-info { flex:1; }
      .contact-name { font-weight:900;color:var(--text);font-size:1rem;margin-bottom:2px; }
      .contact-role { font-size:.78rem;color:var(--text-light); }
      .call-buttons { display:flex;gap:6px; }
      .call-btn {
        width:44px;height:44px;border-radius:50%;border:none;cursor:pointer;
        display:flex;align-items:center;justify-content:center;
        font-size:1.2rem;color:#fff;transition:transform .15s;
        box-shadow:0 3px 0 rgba(0,0,0,0.2);
      }
      .call-btn:active { transform: translateY(3px); box-shadow: none; }
      .call-btn.video { background: linear-gradient(180deg,#34d399,#059669); }
      .call-btn.audio { background: linear-gradient(180deg,#60a5fa,#2563eb); }
    `;
    document.head.appendChild(style);
  }

  /* ============================================================
     قبول المكالمة
     ============================================================ */
  async function acceptCall(call) {
    try {
      await fetch(`/api/calls/${call.id}/answer`, { method: 'POST' });
      openCallRoom(call);
    } catch (e) {
      console.error('Accept error:', e);
    }
  }

  function openCallRoom(call) {
    const url = call.room_link;
    if (!url) return;
    const w = window.open(url, '_blank');
    if (!w) {
      window.location.href = url;
    }
  }

  /* ============================================================
     بدء مكالمة
     ============================================================ */
  async function startCall(contactId, contactName, callType) {
    try {
      const callingModal = document.createElement('div');
      callingModal.className = 'modal-backdrop';
      callingModal.style.zIndex = '99997';
      callingModal.innerHTML = `
        <div class="modal" style="max-width:400px;text-align:center;padding:30px">
          <div style="font-size:4rem;animation:callPulse 1.5s infinite">📞</div>
          <h2 style="border:none;padding:0;margin-bottom:8px">جاري الاتصال...</h2>
          <div style="font-size:1.2rem;font-weight:900;margin-bottom:20px">${contactName}</div>
          <button id="cancel-call" class="btn-danger" style="width:100%;padding:16px">
            ⏹️ إلغاء
          </button>
        </div>
      `;
      document.body.appendChild(callingModal);

      const r = await fetch('/api/calls/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_user_id: currentUser.id,
          to_user_id: contactId,
          call_type: callType
        })
      });
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || 'فشل');

      activeCall = data;

      callingModal.querySelector('#cancel-call').onclick = async () => {
        await fetch(`/api/calls/${data.id}/end`, { method: 'POST' });
        callingModal.remove();
        activeCall = null;
      };

      setTimeout(() => {
        callingModal.remove();
        if (activeCall) {
          openCallRoom({ room_link: data.room_link });
        }
      }, 1500);

    } catch (e) {
      console.error('Start call error:', e);
      alert('❌ فشل بدء المكالمة: ' + e.message);
    }
  }

  /* ============================================================
     تحميل جهات الاتصال
     ============================================================ */
  async function loadContacts(container) {
    if (!container) return;
    try {
      const r = await fetch(`/api/contacts?user_id=${currentUser.id}&role=${currentUser.role}`);
      const contacts = await r.json();

      if (!contacts.length) {
        container.innerHTML = `
          <div style="text-align:center;color:var(--text-light);padding:40px">
            <div style="font-size:3rem;margin-bottom:14px">👥</div>
            <div>لا يوجد مستخدمون آخرون بعد</div>
          </div>`;
        return;
      }

      container.innerHTML = '';
      contacts.forEach(c => {
        const initial = (c.name || '؟').charAt(0);
        const roleLabel = c.role === 'teacher' ? '👨‍🏫 أستاذ' : '👨‍🎓 طالب';

        const row = document.createElement('div');
        row.className = 'contact-row';
        row.innerHTML = `
          <div class="contact-avatar">${initial}</div>
          <div class="contact-info">
            <div class="contact-name">${c.name}</div>
            <div class="contact-role">${roleLabel}${c.email ? ' • ' + c.email : ''}</div>
          </div>
          <div class="call-buttons">
            <button class="call-btn video" title="مكالمة مرئية" data-id="${c.id}" data-name="${c.name}" data-type="video">🎥</button>
            <button class="call-btn audio" title="مكالمة صوتية" data-id="${c.id}" data-name="${c.name}" data-type="audio">📞</button>
          </div>
        `;

        row.querySelectorAll('.call-btn').forEach(btn => {
          btn.onclick = () => {
            startCall(parseInt(btn.dataset.id), btn.dataset.name, btn.dataset.type);
          };
        });

        container.appendChild(row);
      });
    } catch (e) {
      console.error('Load contacts error:', e);
      container.innerHTML = '<div style="text-align:center;color:var(--danger)">فشل تحميل جهات الاتصال</div>';
    }
  }

  /* ============================================================
     فحص المكالمات الواردة
     ============================================================ */
  async function checkPendingCalls() {
    if (incomingCallModal) return;
    if (activeCall) return;

    try {
      const r = await fetch(`/api/calls/pending?user_id=${currentUser.id}`);
      const calls = await r.json();
      if (calls.length > 0 && calls[0].status === 'ringing') {
        showIncomingCallModal(calls[0]);
      }
    } catch (e) {}
  }

  pendingCallCheck = setInterval(checkPendingCalls, 8000);
  setTimeout(checkPendingCalls, 2000);

  window.CallsApp = {
    loadContacts,
    startCall,
    acceptCall,
    stopCallRingtone
  };
})();