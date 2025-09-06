// app.js
// --- Firebase Configuration (kept your config) ---
const firebaseConfig = {
  apiKey: "AIzaSyAANuaXF-zSqAs9kzIBnW3ROLDwxGXA1p8",
  authDomain: "the-bald-chat.firebaseapp.com",
  projectId: "the-bald-chat",
  storageBucket: "the-bald-chat.firebasestorage.app",
  messagingSenderId: "831148484483",
  appId: "1:831148484483:web:23747c98adcd6e989db8b6",
  databaseURL: "https://the-bald-chat-default-rtdb.firebaseio.com"
};

// Wrap init in DOMContentLoaded if script somehow runs early
function boot() {
  // --- Globals / DOM refs ---
  let database, currentUid = null;
  const usernameInput = document.getElementById('usernameInput');
  const messageInput  = document.getElementById('messageInput');
  const sendBtn       = document.getElementById('sendMessage');
  const messagesDiv   = document.getElementById('messages');
  const toastEl       = document.getElementById('toast');
  const connDot       = document.getElementById('connDot');
  const statusText    = document.getElementById('statusText');
  const messageCountEl= document.getElementById('messageCount');
  const uidShortEl    = document.getElementById('uidShort');

  // Init Firebase
  firebase.initializeApp(firebaseConfig);
  database = firebase.database();

  // --- Username memory with toast ---
  function loadUsername() {
    const saved = localStorage.getItem('username');
    if (saved) usernameInput.value = saved;
  }
  function saveUsername() {
    const v = usernameInput.value.trim();
    if (!v) {
      showToast('Username cleared');
      localStorage.removeItem('username');
      return;
    }
    localStorage.setItem('username', v);
    showToast('Username saved!');
  }
  usernameInput.addEventListener('blur', saveUsername);
  usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveUsername();
      messageInput.focus();
    }
  });

  // --- Toast helper ---
  let toastTimer = null;
  function showToast(msg, ms=1800) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(()=> toastEl.classList.remove('show'), ms);
  }

  // --- Utility: color avatar from text ---
  function stringToColor(s) {
    let h = 0;
    for (let i=0;i<s.length;i++) h = s.charCodeAt(i) + ((h<<5) - h);
    const hue = Math.abs(h) % 360;
    return `linear-gradient(135deg,hsl(${hue} 70% 45%), hsl(${(hue+40)%360} 70% 35%))`;
  }
  function avatarInitials(name){
    if (!name) return 'AN';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0,2).toUpperCase();
    return (parts[0][0]+parts[1][0]).toUpperCase();
  }

  // --- Send message ---
  async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;
    const username = (usernameInput.value.trim() || 'Anonymous');
    const msgRef = database.ref('messages').push();
    const payload = {
      username,
      text,
      timestamp: firebase.database.ServerValue.TIMESTAMP,
      ownerId: currentUid || null
    };
    try {
      await msgRef.set(payload);
      messageInput.value = '';
      messageInput.focus();
    } catch (err) {
      console.error('write error', err);
      showToast('Failed to send');
    }
  }

  // --- Format time ---
  function formatTimestamp(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' });
  }

  // --- Create DOM message ---
  function createMessageElement(id, data) {
    const container = document.createElement('div');
    container.className = 'msg' + (data.ownerId && data.ownerId === currentUid ? ' me' : '');
    container.id = 'msg-' + id;

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.style.background = stringToColor(data.username || 'Anon');
    avatar.textContent = avatarInitials(data.username || 'Anon');

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    const meta = document.createElement('div');
    meta.className = 'meta';
    const uname = document.createElement('div');
    uname.className = 'username-text';
    uname.textContent = data.username || 'Anonymous';

    const time = document.createElement('div');
    time.style.marginLeft = '8px';
    time.textContent = formatTimestamp(data.timestamp) || '';
    time.title = data.timestamp ? new Date(data.timestamp).toLocaleString() : '';

    meta.appendChild(uname);
    meta.appendChild(time);

    const textEl = document.createElement('div');
    textEl.className = 'text';
    textEl.textContent = data.text || '';

    const actions = document.createElement('div');
    actions.className = 'actions';

    if (data.ownerId && currentUid && data.ownerId === currentUid) {
      const del = document.createElement('button');
      del.className = 'small-btn';
      del.title = 'Delete your message';
      del.textContent = '❌';
      del.addEventListener('click', async () => {
        if (!confirm('Delete this message?')) return;
        try {
          await database.ref('messages').child(id).remove();
          showToast('Message deleted', 1200);
        } catch (err) {
          console.error('delete failed', err);
          showToast('Delete failed');
        }
      });
      actions.appendChild(del);
    }

    bubble.appendChild(meta);
    bubble.appendChild(textEl);

    container.appendChild(avatar);
    container.appendChild(bubble);
    container.appendChild(actions);

    return container;
  }

  // --- Listeners for realtime updates ---
  let messageCount = 0;
  function attachDatabaseListeners() {
    const ref = database.ref('messages');

    ref.off();

    ref.on('child_added', (snap) => {
      const id = snap.key;
      const data = snap.val() || {};
      if (document.getElementById('msg-' + id)) return;
      const el = createMessageElement(id, data);
      messagesDiv.appendChild(el);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
      messageCount++;
      messageCountEl.textContent = messageCount;
    });

    ref.on('child_removed', (snap) => {
      const id = snap.key;
      const dom = document.getElementById('msg-' + id);
      if (dom) dom.remove();
      messageCount = Math.max(0, messageCount - 1);
      messageCountEl.textContent = messageCount;
    });

    ref.on('child_changed', (snap) => {
      const id = snap.key;
      const data = snap.val() || {};
      const dom = document.getElementById('msg-' + id);
      if (dom) {
        const newDom = createMessageElement(id, data);
        dom.replaceWith(newDom);
      }
    });

    ref.once('value').then(snap => {
      messageCount = snap.numChildren() || 0;
      messageCountEl.textContent = messageCount;
    }).catch(()=>{});
  }

  // --- Auth + connection monitoring ---
  function initAuthAndConnections() {
    firebase.auth().onAuthStateChanged((user) => {
      if (user) {
        currentUid = user.uid;
        uidShortEl.textContent = currentUid ? (currentUid.slice(0,6) + '…') : '—';
        connDot.classList.add('connected'); // <-- fixed typo here
        statusText.textContent = 'Connected';
        attachDatabaseListeners();
      } else {
        firebase.auth().signInAnonymously().catch((err) => {
          console.error('auth failed', err);
          showToast('Auth failed');
        });
      }
    });

    const conRef = database.ref('.info/connected');
    conRef.on('value', (snap) => {
      const val = snap.val();
      if (val === true) {
        connDot.classList.add('connected');
        statusText.textContent = 'Connected';
      } else {
        connDot.classList.remove('connected');
        statusText.textContent = 'Disconnected';
      }
    });
  }

  // --- Keybindings & UI wiring ---
  sendBtn.addEventListener('click', sendMessage);

  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== messageInput && document.activeElement !== usernameInput) {
      e.preventDefault();
      messageInput.focus();
    }
  });

  // --- Boot ---
  loadUsername();
  initAuthAndConnections();
  showToast('Welcome to The Bald Chat!', 1800);
  setTimeout(()=> messageInput.focus(), 400);

  // expose for debugging
  window._baldChat = {
    db: database,
    firebase
  };
}

// If script is deferred/dom ready, run immediately; otherwise wait for DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
