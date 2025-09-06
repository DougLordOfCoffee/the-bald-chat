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
    if (parts.length === 1) return parts[0].slice(0,2).toUp
