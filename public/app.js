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

// --- Global Firebase and DOM References ---
let database;
let usernameInput, messageInput, sendMessageBtn, messagesDiv;
let localUsername = null;

// --- Core Functions ---
function initFirebase() {
  // compat init
  if (!firebase || typeof firebase.initializeApp !== 'function') {
    console.error('Firebase compat not loaded.');
    return;
  }
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  database = firebase.database();
}

function getDOMElements() {
  usernameInput = document.getElementById('usernameInput');
  messageInput = document.getElementById('messageInput');
  sendMessageBtn = document.getElementById('sendMessage');
  messagesDiv = document.getElementById('messages');
}

// Keep app height matching viewport (helps mobile)
function setAppHeight() {
  const appEl = document.querySelector('.app');
  if (appEl) appEl.style.height = `${window.innerHeight}px`;
}
window.addEventListener('resize', setAppHeight);
window.addEventListener('orientationchange', setAppHeight);

// --- Username memory with toast ---
function setupUsernameMemory() {
  if (!usernameInput) return;
  const saved = localStorage.getItem('username');
  if (saved) {
    usernameInput.value = saved;
    localUsername = saved;
  }

  usernameInput.addEventListener('blur', saveUsername);
  usernameInput.addEventListener('keydown', (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveUsername();
      messageInput.focus();
    }
  });

  function saveUsername() {
    const val = usernameInput.value.trim();
    if (val) {
      localStorage.setItem('username', val);
      localUsername = val;
      showToast('Username saved!');
    }
  }
}

// --- Write a new message ---
function writeNewMessage(username, text) {
  if (!database) return console.error('Database not initialized.');
  const newMessageRef = database.ref('messages').push();
  newMessageRef.set({
    username: username,
    text: text,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  }).catch(err => console.error('Write failed', err));
}

// --- safe text helper ---
function safeText(t) {
  // returns a string safe for textContent
  return String(t == null ? '' : t);
}

// --- Display a message (structured and accessible) ---
function displayMessage(message) {
  // remove initial placeholder system note if present
  const systemEl = messagesDiv.querySelector('.system');
  if (systemEl) systemEl.remove();

  const msgWrap = document.createElement('div');
  msgWrap.id = message.id;
  msgWrap.className = (message.username === localUsername) ? 'mine' : '';
  msgWrap.style.display = 'flex';
  msgWrap.style.justifyContent = 'space-between';
  msgWrap.style.alignItems = 'center';
  msgWrap.style.marginBottom = '6px';
  msgWrap.setAttribute('role', 'article');

  const left = document.createElement('div');
  left.style.display = 'flex';
  left.style.flexDirection = 'column';
  left.style.gap = '4px';

  const uname = document.createElement('span');
  uname.className = 'username';
  uname.textContent = safeText(message.username || 'Anonymous');

  const textEl = document.createElement('span');
  textEl.textContent = safeText(message.text || '');

  const meta = document.createElement('span');
  meta.className = 'meta';
  if (message.timestamp) {
    const date = new Date(Number(message.timestamp));
    if (!isNaN(date)) {
      meta.textContent = date.toLocaleString();
      meta.title = date.toISOString();
    } else {
      meta.textContent = '';
    }
  }

  left.appendChild(uname);
  left.appendChild(textEl);
  left.appendChild(meta);

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.alignItems = 'center';

  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = "❌";
  deleteBtn.title = 'Delete message';
  deleteBtn.style.cursor = 'pointer';
  deleteBtn.style.border = 'none';
  deleteBtn.style.background = 'transparent';
  deleteBtn.style.fontSize = '14px';
  deleteBtn.addEventListener('click', () => {
    if (confirm("Delete this message?")) {
      database.ref('messages').child(message.id).remove().catch(err => console.error('Delete failed', err));
    }
  });

  actions.appendChild(deleteBtn);

  msgWrap.appendChild(left);
  msgWrap.appendChild(actions);

  messagesDiv.appendChild(msgWrap);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// --- Event listeners ---
function setupEventListeners() {
  if (sendMessageBtn) {
    sendMessageBtn.addEventListener('click', () => {
      const messageText = messageInput.value.trim();
      const usernameText = (usernameInput.value.trim() || 'Anonymous');
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
        sendMessageBtn.click();
      }
    });
  }

  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      document.body.classList.toggle('light');
    });
  }
}

// --- Listen for messages ---
function listenForMessages() {
  if (!database) return;
  const ref = database.ref('messages').orderByChild('timestamp');
  ref.on('child_added', (snapshot) => {
    const obj = snapshot.val();
    obj.id = snapshot.key;
    displayMessage(obj);
  });

  ref.on('child_removed', (snapshot) => {
    const removedId = snapshot.key;
    const element = document.getElementById(removedId);
    if (element) element.remove();
  });
}

// --- Toast helper ---
let toastTimer = null;
function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 1800);
}

// --- Main entry point ---
function main() {
  initFirebase();
  getDOMElements();
  setAppHeight();
  setupUsernameMemory();
  setupEventListeners();
  listenForMessages();
}

document.addEventListener('DOMContentLoaded', main);
