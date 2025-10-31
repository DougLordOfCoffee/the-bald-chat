// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyAANuaXF-zSqAs9kzIBnW3ROLDwxGXA1p8",
  authDomain: "the-bald-chat.firebaseapp.com",
  projectId: "the-bald-chat",
  storageBucket: "the-bald-chat.appspot.com",
  messagingSenderId: "831148484483",
  appId: "1:831148484483:web:23747c98adcd6e989db8b6",
  databaseURL: "https://the-bald-chat-default-rtdb.firebaseio.com"
};

// --- Global refs ---
let database;
let usernameInput, messageInput, sendMessageBtn, messagesDiv, themeToggleBtn;
let localUsername = null;
let toastTimer = null;

// --- Helpers ---
function sanitizeId(key) {
  // make a safe DOM id, prefix with "msg_" so it never starts with a digit
  return 'msg_' + String(key).replace(/[^a-zA-Z0-9\-_:.]/g, '_');
}

function safeText(t) {
  return String(t == null ? '' : t);
}

function isFirebaseCompatLoaded() {
  return typeof window.firebase === 'object' && typeof window.firebase.initializeApp === 'function';
}

// --- Firebase init ---
function initFirebase() {
  if (!isFirebaseCompatLoaded()) {
    console.error('Firebase compat SDK not loaded (expected firebase global).');
    return;
  }
  if (!firebase.apps || !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  if (!firebase.database) {
    console.error('Firebase database not available on compat bundle.');
    return;
  }
  database = firebase.database();
}

// --- DOM refs ---
function getDOMElements() {
  usernameInput = document.getElementById('usernameInput');
  messageInput = document.getElementById('messageInput');
  sendMessageBtn = document.getElementById('sendMessage');
  messagesDiv = document.getElementById('messages');
  themeToggleBtn = document.getElementById('themeToggle');

  // Ensure toast is initially hidden to screen readers
  const toast = document.getElementById('toast');
  if (toast) toast.setAttribute('aria-hidden', 'true');
}

// --- App height (simple, accounts for body padding) ---
function setAppHeight() {
  const appEl = document.querySelector('.app');
  const bodyStyles = getComputedStyle(document.body);
  const padTop = parseFloat(bodyStyles.paddingTop) || 0;
  const padBottom = parseFloat(bodyStyles.paddingBottom) || 0;
  if (appEl) {
    appEl.style.minHeight = `${window.innerHeight - padTop - padBottom}px`;
  }
}
window.addEventListener('resize', setAppHeight);
window.addEventListener('orientationchange', setAppHeight);

// --- Username memory + handlers ---
function setupUsernameMemory() {
  if (!usernameInput) return;
  const saved = localStorage.getItem('username');
  if (saved) {
    usernameInput.value = saved;
    localUsername = saved;
  }

  function saveUsername() {
    const val = usernameInput.value.trim();
    if (val) {
      localStorage.setItem('username', val);
      localUsername = val;
      showToast('Username saved!');
    }
  }

  // Save on blur or Enter
  usernameInput.addEventListener('blur', saveUsername);
  usernameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveUsername();
      if (messageInput) messageInput.focus();
    }
  });

  // Keep localUsername current while typing (helps immediate display equality)
  usernameInput.addEventListener('input', () => {
    localUsername = usernameInput.value.trim() || null;
  });
}

// --- Write message to DB ---
function writeNewMessage(username, text) {
  if (!database) return console.error('Database not initialized.');
  const newMessageRef = database.ref('messages').push();
  newMessageRef.set({
    username: username,
    text: text,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  }).catch(err => console.error('Write failed', err));
}

// --- Display one message (uses classes; minimal inline styles) ---
function displayMessage(message) {
  if (!messagesDiv) return;

  // remove the "system" placeholder if present
  const systemEl = messagesDiv.querySelector('.system');
  if (systemEl) systemEl.remove();

  // sanitize and compute element id
  const domId = sanitizeId(message.id || (Date.now().toString()));
  // if element already exists (re-emit), skip
  if (document.getElementById(domId)) return;

  const wrap = document.createElement('div');
  wrap.id = domId;
  wrap.classList.add('message');
  if ((message.username || '') === (localUsername || '')) wrap.classList.add('mine');
  wrap.setAttribute('role', 'article');

  // left column (username + text + meta)
  const left = document.createElement('div');
  left.className = 'message-left';

  const uname = document.createElement('span');
  uname.className = 'username';
  uname.textContent = safeText(message.username || 'Anonymous');

  const textEl = document.createElement('div');
  textEl.className = 'message-text';
  textEl.textContent = safeText(message.text || '');

  const meta = document.createElement('span');
  meta.className = 'meta';
  if (message.timestamp) {
    const date = new Date(Number(message.timestamp));
    if (!isNaN(date)) {
      meta.textContent = date.toLocaleString();
      meta.title = date.toISOString();
    }
  }

  left.appendChild(uname);
  left.appendChild(textEl);
  left.appendChild(meta);

  // actions (delete etc)
  const actions = document.createElement('div');
  actions.className = 'message-actions';

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-message-btn';
  deleteBtn.type = 'button';
  deleteBtn.title = 'Delete message';
  deleteBtn.setAttribute('aria-label', 'Delete message');
  deleteBtn.textContent = '❌';
  deleteBtn.addEventListener('click', () => {
    if (!database) return;
    if (confirm('Delete this message?')) {
      database.ref('messages').child(message.id).remove().catch(err => console.error('Delete failed', err));
    }
  });

  actions.appendChild(deleteBtn);

  wrap.appendChild(left);
  wrap.appendChild(actions);

  // Auto-scroll behavior: only scroll if user is near bottom
  const wasNearBottom = (messagesDiv.scrollHeight - messagesDiv.scrollTop - messagesDiv.clientHeight) < 80;
  messagesDiv.appendChild(wrap);
  if (wasNearBottom) {
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }
}

// --- Event listeners (send / enter / theme) ---
function setupEventListeners() {
  if (sendMessageBtn && messageInput) {
    sendMessageBtn.addEventListener('click', () => {
      const messageText = messageInput.value.trim();
      const usernameText = (usernameInput && usernameInput.value.trim()) || 'Anonymous';
      // ensure localUsername reflects current input (helps mine highlighting)
      localUsername = (usernameInput && usernameInput.value.trim()) || localUsername;
      if (messageText) {
        writeNewMessage(usernameText, messageText);
        messageInput.value = '';
        messageInput.focus();
      }
    });
  }

  if (messageInput) {
    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendMessageBtn && sendMessageBtn.click();
      }
    });
  }

  if (themeToggleBtn) {
    // restore theme
    const savedTheme = localStorage.getItem('theme'); // 'light' or 'dark'
    if (savedTheme === 'light') document.body.classList.add('light');

    const updateThemeButton = () => {
      const isLight = document.body.classList.contains('light');
      themeToggleBtn.setAttribute('aria-pressed', String(isLight));
    };
    updateThemeButton();

    themeToggleBtn.addEventListener('click', () => {
      const willBeLight = !document.body.classList.toggle('light');
      // toggle returns false when class removed; we want to store actual state:
      const isNowLight = document.body.classList.contains('light');
      localStorage.setItem('theme', isNowLight ? 'light' : 'dark');
      updateThemeButton();
      showToast(isNowLight ? 'Light theme enabled' : 'Dark theme enabled');
    });
  }
}

// --- Listen for messages (Firebase Realtime DB) ---
function listenForMessages() {
  if (!database) return console.warn('No database to listen to yet.');
  const ref = database.ref('messages').orderByChild('timestamp').limitToLast(500);
  ref.on('child_added', (snapshot) => {
    const obj = snapshot.val() || {};
    obj.id = snapshot.key;
    displayMessage(obj);
  });

  ref.on('child_removed', (snapshot) => {
    const removedId = sanitizeId(snapshot.key);
    const element = document.getElementById(removedId);
    if (element) element.remove();
  });
}

// --- Toast helper (manages aria-hidden) ---
function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  toast.setAttribute('aria-hidden', 'false');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    toast.setAttribute('aria-hidden', 'true');
  }, 1800);
}

// --- Main entrypoint ---
function main() {
  initFirebase();
  getDOMElements();
  setAppHeight();
  setupUsernameMemory();
  setupEventListeners();
  listenForMessages();
}

document.addEventListener('DOMContentLoaded', main);
