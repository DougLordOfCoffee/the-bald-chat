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

// Admin UID (replace if you change acounts)
const ADMIN_UID = "shELHHG7NJPJqQ0aRb7NR3sPhpJ3";

// --- Global refs ---
let database;
let auth;
let usernameInput;
let messageInput;
let sendMessageBtn;
let messagesDiv;
let themeToggleBtn;
let googleBtn;
let localUsername = null;
let toastTimer = null;

// --- session id for non-auth users (used for typing + reactions fallback) ---
let sessionClientId = sessionStorage.getItem('sessionClientId');
if (!sessionClientId) {
  sessionClientId = 'anon_' + Math.random().toString(36).slice(2, 10);
  sessionStorage.setItem('sessionClientId', sessionClientId);
}
function currentClientId() {
  return (auth && auth.currentUser && auth.currentUser.uid) || sessionClientId;
}
function currentDisplayName() {
  return (auth && auth.currentUser && auth.currentUser.displayName) || localUsername || 'Anonymous';
}
const REACTION_EMOJIS = ['👍','🔥','❤️','💀','ඞ']; // tweakable, just add stuff.


// --- Helpers ---
function sanitizeId(key) {
  return "msg_" + String(key).replace(/[^a-zA-Z0-9\-_:.]/g, "_");
}

function safeText(t) {
  return String(t == null ? "" : t);
}

function isFirebaseCompatLoaded() {
  return typeof window.firebase === "object" && typeof window.firebase.initializeApp === "function";
}
// Render reactions UI for a message (reactionsObj structure: { emoji: { uid1:true, uid2:true } })
function renderReactions(messageId, reactionsObj = {}) {
  const domId = sanitizeId(messageId);
  const wrap = document.getElementById(domId);
  if (!wrap) return;
  const reactionsDiv = wrap.querySelector('.reactions');
  if (!reactionsDiv) return;

  // clear
  reactionsDiv.innerHTML = '';

  // for each emoji in our set, compute count
  REACTION_EMOJIS.forEach(emoji => {
    const users = reactionsObj && reactionsObj[emoji] ? Object.keys(reactionsObj[emoji]) : [];
    const count = users.length;
    const btn = document.createElement('button');
    btn.className = 'reaction-btn';
    btn.type = 'button';
    btn.innerHTML = `${emoji} <span class="reaction-count">${count||''}</span>`;
    btn.title = emoji;
    // mark active if current user reacted
    const meId = currentClientId();
    if (users.includes(meId)) btn.classList.add('active');

    // toggle handler
    btn.addEventListener('click', () => {
      toggleReaction(messageId, emoji);
    });

    reactionsDiv.appendChild(btn);
  });
}

// Toggle a reaction for the current user
async function toggleReaction(messageId, emoji) {
  if (!database) return;
  const uid = currentClientId();
  const path = `messages/${messageId}/reactions/${encodeURIComponent(emoji)}/${uid}`;
  const ref = database.ref(path);
  const snap = await ref.get();
  if (snap.exists()) {
    // remove reaction (toggle off)
    ref.remove().catch(console.error);
  } else {
    // add reaction
    ref.set(true).catch(console.error);
  }
}


// --- Firebase init ---
function initFirebase() {
  if (!isFirebaseCompatLoaded()) {
    console.error("Firebase compat SDK not loaded.");
    return;
  }
  if (!firebase.apps || !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  if (!firebase.database) {
    console.error("Firebase database not available on compat bundle.");
    return;
  }
  database = firebase.database();
  auth = firebase.auth();
}

// --- DOM refs ---
function getDOMElements() {
  usernameInput = document.getElementById("usernameInput");
  messageInput = document.getElementById("messageInput");
  sendMessageBtn = document.getElementById("sendMessage");
  messagesDiv = document.getElementById("messages");
  themeToggleBtn = document.getElementById("themeToggle");
  googleBtn = document.getElementById("googleBtn");

  // Ensure toast is initially hidden to screen readers
  const toast = document.getElementById("toast");
  if (toast) toast.setAttribute("aria-hidden", "true");
}

// --- App height ---
function setAppHeight() {
  const appEl = document.querySelector(".app");
  const bodyStyles = getComputedStyle(document.body);
  const padTop = parseFloat(bodyStyles.paddingTop) || 0;
  const padBottom = parseFloat(bodyStyles.paddingBottom) || 0;
  if (appEl) appEl.style.minHeight = `${window.innerHeight - padTop - padBottom}px`;
}
window.addEventListener("resize", setAppHeight);
window.addEventListener("orientationchange", setAppHeight);

// --- Username memory + uniqueness enforcement ---
function setupUsernameMemory() {
  if (!usernameInput) return;

  const usersRef = database.ref("users");
  const usernamesRef = database.ref("usernames");

  // Restore username for signed-in users
  auth.onAuthStateChanged(async (user) => {
    if (!user) return;
    const uid = user.uid;
    const snap = await usersRef.child(uid).child("username").get();
    if (snap.exists()) {
      localUsername = snap.val();
      usernameInput.value = localUsername;
      localStorage.setItem("username", localUsername);
    } else if (localStorage.getItem("username")) {
      // If they have a local username and no DB entry, don't overwrite DB automatically
      localUsername = localStorage.getItem("username");
      usernameInput.value = localUsername;
    }
  });

  async function saveUsername() {
    const user = auth.currentUser;
    const newName = usernameInput.value.trim();
    if (!newName) return;

    const key = newName.toLowerCase();
    const ownerSnap = await usernamesRef.child(key).get();

    // Name taken by other UID
    if (ownerSnap.exists() && ownerSnap.val() !== (user ? user.uid : null)) {
      showToast("Name already taken.");
      usernameInput.value = localUsername || "";
      return;
    }

    // Free old name if present and owned by this user
    if (localUsername && user) {
      await usernamesRef.child(localUsername.toLowerCase()).remove().catch(() => {});
    }

    // Update DB only if user is signed in
    if (user) {
      await usernamesRef.child(key).set(user.uid);
      await database.ref("users").child(user.uid).child("username").set(newName);
    }

    localUsername = newName;
    localStorage.setItem("username", newName);
    showToast("Username updated!");
  }

  usernameInput.addEventListener("blur", saveUsername);
  usernameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveUsername();
      messageInput && messageInput.focus();
    }
  });

  usernameInput.addEventListener("input", () => {
    localUsername = usernameInput.value.trim() || null;
  });
}

// --- Write message to DB ---
function writeNewMessage(username, text) {
  if (!database) return console.error("Database not initialized.");
  const newMessageRef = database.ref("messages").push();
  newMessageRef
    .set({
      username: username,
      uid: auth.currentUser ? auth.currentUser.uid : null,
      text: text,
      timestamp: firebase.database.ServerValue.TIMESTAMP,
    })
    .catch((err) => console.error("Write failed", err));
}

// --- Display message ---
function displayMessage(message) {
  if (!messagesDiv) return;

  // remove system placeholder if present
  const systemEl = messagesDiv.querySelector(".system");
  if (systemEl) systemEl.remove();

  const domId = sanitizeId(message.id || Date.now());
  if (document.getElementById(domId)) return;

  const wrap = document.createElement("div");
  wrap.id = domId;
  wrap.classList.add("message");
  if ((message.username || "") === (localUsername || "")) wrap.classList.add("mine");
  wrap.setAttribute("role", "article");

  const left = document.createElement("div");
  left.className = "message-left";

  const uname = document.createElement("span");
  uname.className = "username";
  if (message.uid === ADMIN_UID) {
    uname.textContent = safeText(message.username) + " ⭐";
  } else {
    uname.textContent = safeText(message.username || "Anonymous");
  }

  const textEl = document.createElement("div");
  textEl.className = "message-text";
  textEl.textContent = safeText(message.text || "");

  const meta = document.createElement("span");
  meta.className = "meta";
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

  wrap.appendChild(left);

  // actions (delete)
  const actions = document.createElement("div");
  actions.className = "message-actions";

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "delete-btn";
  deleteBtn.type = "button";
  deleteBtn.title = "Delete message";
  deleteBtn.setAttribute("aria-label", "Delete message");
  deleteBtn.innerHTML = "&times;";
  deleteBtn.addEventListener("click", () => {
    if (!database) return;
    if (confirm("Delete this message?")) {
      database.ref("messages").child(message.id).remove().catch(console.error);
    }
  });

  const currentUser = auth.currentUser;
  if (currentUser && (message.uid === currentUser.uid || currentUser.uid === ADMIN_UID)) {
    actions.appendChild(deleteBtn);
  }

  wrap.appendChild(actions);

  // reactions container
  const reactionsDiv = document.createElement('div');
  reactionsDiv.className = 'reactions';
  reactionsDiv.setAttribute('data-msgid', message.id || '');

  // render placeholder (actual render will run below)
  actions.appendChild(reactionsDiv);

  // Render reactions initially (if any)
  renderReactions(message.id, message.reactions || {});

  const wasNearBottom =
    messagesDiv.scrollHeight - messagesDiv.scrollTop - messagesDiv.clientHeight < 80;
  messagesDiv.appendChild(wrap);
  if (wasNearBottom) messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// --- Event listeners ---
function setupEventListeners() {
  if (sendMessageBtn && messageInput) {
    sendMessageBtn.addEventListener("click", () => {
      const messageText = messageInput.value.trim();
      const usernameText = (usernameInput && usernameInput.value.trim()) || "Anonymous";
      localUsername = (usernameInput && usernameInput.value.trim()) || localUsername;
      if (messageText) {
        writeNewMessage(usernameText, messageText);
        messageInput.value = "";
        messageInput.focus();
      }
    });
  }

  if (messageInput) {
    messageInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        sendMessageBtn && sendMessageBtn.click();
      }
    });
  }

  if (themeToggleBtn) {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light") document.body.classList.add("light");

    const updateThemeButton = () => {
      const isLight = document.body.classList.contains("light");
      themeToggleBtn.setAttribute("aria-pressed", String(isLight));
    };
    updateThemeButton();

    themeToggleBtn.addEventListener("click", () => {
      document.body.classList.toggle("light");
      const isNowLight = document.body.classList.contains("light");
      localStorage.setItem("theme", isNowLight ? "light" : "dark");
      updateThemeButton();
      showToast(isNowLight ? "Light theme enabled" : "Dark theme enabled");
    });
  }
}

// --- Listen for messages ---
function listenForMessages() {
  if (!database) return console.warn("No database to listen to yet.");
  const ref = database.ref("messages").orderByChild("timestamp").limitToLast(500);
  ref.on("child_added", (snapshot) => {
    const obj = snapshot.val() || {};
    obj.id = snapshot.key;
    displayMessage(obj);
  });

  ref.on("child_removed", (snapshot) => {
    const removedId = sanitizeId(snapshot.key);
    const element = document.getElementById(removedId);
    if (element) element.remove();
  });
  ref.on('child_changed', (snapshot) => {
   const obj = snapshot.val() || {};
    obj.id = snapshot.key;
    // update DOM text/meta if needed
    const domId = sanitizeId(obj.id);
    const el = document.getElementById(domId);
    if (el) {
     // update text
     const textEl = el.querySelector('.message-text');
     if (textEl) textEl.textContent = safeText(obj.text || '');
     // update meta
      const metaEl = el.querySelector('.meta');
     if (metaEl && obj.timestamp) {
        const d = new Date(Number(obj.timestamp));
       if (!isNaN(d)) metaEl.textContent = d.toLocaleString();
      }
      // update reactions
      renderReactions(obj.id, obj.reactions || {});
    } else {
      // if DOM missing, display fresh
     displayMessage(obj);
    }
});

}

// --- Toast helper ---
function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  toast.setAttribute("aria-hidden", "false");

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
    toast.setAttribute("aria-hidden", "true");
  }, 1800);
}

// --- Google Sign-in UI + logic ---
function setupGoogleLogin() {
  if (!googleBtn) return;

  googleBtn.addEventListener("click", async () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
      await auth.signInWithPopup(provider);
    } catch (err) {
      if (err.code === "auth/popup-closed-by-user") {
        // user canceled popup — ignore silently
      } else {
        console.error("Google Sign-in failed:", err);
        showToast("Sign-in canceled.");
      }
    }
  });

  // reflect auth state in button text/glow
  auth.onAuthStateChanged((user) => {
    if (!googleBtn) return;
    if (user) {
      googleBtn.classList.add("signed-in");
      googleBtn.textContent = `Signed in`;
      // Try to load username if available
      database
        .ref(`users/${user.uid}/username`)
        .get()
        .then((snap) => {
          if (snap.exists()) {
            localUsername = snap.val();
            usernameInput && (usernameInput.value = localUsername);
            localStorage.setItem("username", localUsername);
          }
        })
        .catch(() => {});
    } else {
      googleBtn.classList.remove("signed-in");
      googleBtn.textContent = `Sign in with Google`;
    }
  });
}

// Typing presence (writes to /typing/{clientId} = {name, ts})
let typingTimer = null;
const TYPING_TTL = 1800; // ms to clear after last keystroke
function setupTypingIndicator() {
  const typingRef = database.ref('typing');
  // when someone changes typing map, update UI
  typingRef.on('value', snap => {
    const val = snap.val() || {};
    const names = Object.values(val).map(o => o.name).filter(Boolean);
    renderTyping(names);
  });

  // on disconnect cleanup for auth users
  if (auth && auth.currentUser) {
    const myRef = typingRef.child(currentClientId());
    myRef.onDisconnect().remove();
  }

  // send typing events from input
  if (!messageInput) return;
  messageInput.addEventListener('input', () => {
    sendTypingPresence();
  });
}

function sendTypingPresence() {
  if (!database) return;
  const id = currentClientId();
  const ref = database.ref('typing').child(id);
  const payload = { name: currentDisplayName(), ts: Date.now() };
  ref.set(payload).catch(() => {});
  // clear after TTL
  if (typingTimer) clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    ref.remove().catch(() => {});
  }, TYPING_TTL);
}

function renderTyping(names) {
  const el = document.getElementById('typingIndicator');
  if (!el) return;
  // exclude self
  const me = currentDisplayName();
  const others = names.filter(n => n && n !== me);
  if (others.length === 0) {
    el.textContent = '';
    return;
  }
  const text = others.length === 1 ? `${others[0]} is typing...` : `${others.join(', ')} are typing...`;
  el.textContent = text;
}

function listenForAnnouncements() {
  const annRef = database.ref('announcements').orderByChild('timestamp').limitToLast(10);
  annRef.on('value', snap => {
    const container = document.getElementById('devAnnouncements');
    const text = document.getElementById('devAnnouncementText');
    if (!container || !text) return;
    const val = snap.val();
    if (!val) {
      container.classList.remove('show');
      return;
    }
    // pick most recent by timestamp
    const arr = Object.values(val);
    arr.sort((a,b)=> (b.timestamp||0)-(a.timestamp||0));
    const latest = arr[0];
    text.textContent = latest && latest.text ? latest.text : '(no announcements)';
    container.classList.add('show');
    // optional: auto-hide after X ms if latest.expiresAt set
    if (latest && latest.expiresAt) {
      const until = latest.expiresAt - Date.now();
      if (until > 0) setTimeout(()=>container.classList.remove('show'), until);
    }
  });
}


// --- Main entrypoint ---
function main() {
  initFirebase();
  getDOMElements();    // must run before auth UI updates
  setAppHeight();
  setupEventListeners();
  setupUsernameMemory();
  setupGoogleLogin();
  listenForMessages();
  listenForAnnouncements();
  setupTypingIndicator();
}

document.addEventListener("DOMContentLoaded", main);
