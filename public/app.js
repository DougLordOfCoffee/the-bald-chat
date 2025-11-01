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

// Admin UID (replace with your real UID if you rotate accounts)
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

// Channels
let channelsRef = null;
let currentChannelId = null;
let currentChannelMessagesRef = null;

// --- Helpers ---
function sanitizeId(key) {
  return "msg_" + String(key).replace(/[^a-zA-Z0-9\-_:.]/g, "_");
}
function sanitizeChannelMessageId(channelId, messageId) {
  return sanitizeId((channelId || "chan") + "_" + (messageId || Date.now()));
}
function safeText(t) {
  return String(t == null ? "" : t);
}
function isFirebaseCompatLoaded() {
  return typeof window.firebase === "object" && typeof window.firebase.initializeApp === "function";
}
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
    try {
      const snap = await usersRef.child(uid).child("username").once("value");
      if (snap.exists()) {
        localUsername = snap.val();
        usernameInput.value = localUsername;
        localStorage.setItem("username", localUsername);
      } else if (localStorage.getItem("username")) {
        localUsername = localStorage.getItem("username");
        usernameInput.value = localUsername;
      }
    } catch (e) {
      console.warn("Failed to load username:", e);
    }
  });

  async function saveUsername() {
    const user = auth.currentUser;
    const newName = usernameInput.value.trim();
    if (!newName) return;

    const key = newName.toLowerCase();
    try {
      const ownerSnap = await usernamesRef.child(key).once("value");
      if (ownerSnap.exists() && ownerSnap.val() !== (user ? user.uid : null)) {
        showToast("Name already taken.");
        usernameInput.value = localUsername || "";
        return;
      }

      if (localUsername && user) {
        await usernamesRef.child(localUsername.toLowerCase()).remove().catch(()=>{});
      }

      if (user) {
        await usernamesRef.child(key).set(user.uid);
        await database.ref("users").child(user.uid).child("username").set(newName);
      }

      localUsername = newName;
      localStorage.setItem("username", newName);
      showToast("Username updated!");
    } catch (err) {
      console.error("saveUsername failed", err);
      showToast("Failed to save username.");
    }
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

// --- Write message (channel-aware) ---
function writeNewMessage(username, text) {
  if (!database) return console.error("Database not initialized.");
  if (!currentChannelId) {
    showToast("No channel selected");
    return;
  }
  const ref = database.ref(`messages/${currentChannelId}`);
  const pushed = ref.push();
  pushed.set({
    username: username,
    uid: auth && auth.currentUser ? auth.currentUser.uid : null,
    text: text,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  }).catch((err) => console.error("Write failed", err));
}

// --- Display message for channel (DOM id includes channel) ---
function displayMessageForChannel(message) {
  if (!message._channel) message._channel = currentChannelId;
  if (!messagesDiv) return;

  const systemEl = messagesDiv.querySelector(".system");
  if (systemEl) systemEl.remove();

  const domId = sanitizeChannelMessageId(message._channel, message.id);
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
  uname.textContent = message.uid === ADMIN_UID ? (safeText(message.username || "Anonymous") + " ⭐") : safeText(message.username || "Anonymous");

  const textEl = document.createElement("div");
  textEl.className = "message-text";
  textEl.textContent = safeText(message.text || "");

  const meta = document.createElement("span");
  meta.className = "meta";
  if (message.timestamp) {
    const date = new Date(Number(message.timestamp));
    if (!isNaN(date)) { meta.textContent = date.toLocaleString(); meta.title = date.toISOString(); }
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
  deleteBtn.innerHTML = "&times;";
  deleteBtn.addEventListener("click", () => {
    if (!database) return;
    if (!confirm("Delete this message?")) return;
    database.ref(`messages/${message._channel}`).child(message.id).remove().catch(console.error);
  });

  const currentUserId = auth && auth.currentUser ? auth.currentUser.uid : null;
  if (currentUserId && (message.uid === currentUserId || currentUserId === ADMIN_UID)) {
    actions.appendChild(deleteBtn);
  }

  wrap.appendChild(actions);
  messagesDiv.appendChild(wrap);

  const wasNearBottom = messagesDiv.scrollHeight - messagesDiv.scrollTop - messagesDiv.clientHeight < 80;
  if (wasNearBottom) messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// --- Event listeners (send / enter / theme) ---
function setupEventListeners() {
  sendMessageBtn = document.getElementById("sendMessage"); // re-get (safe)
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
        // silent
      } else {
        console.error("Google Sign-in failed:", err);
        showToast("Sign-in canceled.");
      }
    }
  });

  auth.onAuthStateChanged((user) => {
    if (!googleBtn) return;
    if (user) {
      googleBtn.classList.add("signed-in");
      googleBtn.textContent = "Signed in";
      database.ref(`users/${user.uid}/username`).once("value").then(snap => {
        if (snap.exists()) {
          localUsername = snap.val();
          usernameInput && (usernameInput.value = localUsername);
          localStorage.setItem("username", localUsername);
        }
      }).catch(()=>{});
    } else {
      googleBtn.classList.remove("signed-in");
      googleBtn.textContent = "Sign in with Google";
    }
  });
}

// --- Channels: init / render / select / listen ---
function initChannels() {
  if (!database) return;
  channelsRef = database.ref("channels");

  // child added
  channelsRef.orderByChild("timestamp").on("child_added", (snap) => {
    const ch = snap.val(); ch.id = snap.key;
    renderChannelItem(ch);

    if (!currentChannelId) {
      // try persisted value
      const saved = localStorage.getItem("currentChannelId");
      if (saved && document.querySelector(`[data-channel-id="${saved}"]`)) {
        selectChannel(saved);
      } else {
        selectChannel(ch.id);
      }
    }
  });

  // child changed
  channelsRef.on("child_changed", (snap) => {
    const ch = snap.val(); ch.id = snap.key;
    updateChannelItem(ch);
  });

  // child removed
  channelsRef.on("child_removed", (snap) => {
    const id = snap.key;
    const el = document.querySelector(`[data-channel-id="${id}"]`);
    if (el) el.remove();
    if (currentChannelId === id) {
      localStorage.removeItem("currentChannelId");
      const first = document.querySelector(".channel-item");
      if (first) selectChannel(first.getAttribute("data-channel-id"));
      else {
        currentChannelId = null;
        clearMessagesView();
      }
    }
  });

  // Ensure a default channel exists
  channelsRef.once("value").then(snap => {
    if (!snap.exists()) {
      const newRef = channelsRef.push();
      newRef.set({
        name: "general",
        createdBy: auth && auth.currentUser ? auth.currentUser.uid : "system",
        timestamp: Date.now()
      }).catch(()=>{});
    }
  }).catch(()=>{});
}

function renderChannelItem(ch) {
  const list = document.getElementById("channelList");
  if (!list) return;
  if (document.querySelector(`[data-channel-id="${ch.id}"]`)) return;

  const item = document.createElement("div");
  item.className = "channel-item";
  item.setAttribute("data-channel-id", ch.id);
  item.tabIndex = 0;
  item.innerHTML = `<span># ${escapeHtml(ch.name)}</span><span class="meta">${ch.memberCount ? ch.memberCount : ""}</span>`;

  item.addEventListener("click", () => selectChannel(ch.id));
  item.addEventListener("keydown", (e) => { if (e.key === "Enter") selectChannel(ch.id); });

  list.prepend(item);
}

function updateChannelItem(ch) {
  const el = document.querySelector(`[data-channel-id="${ch.id}"]`);
  if (!el) return;
  const meta = el.querySelector(".meta");
  if (meta) meta.textContent = ch.memberCount || "";
}

function selectChannel(channelId) {
  if (!channelId) return;
  if (currentChannelId === channelId) return;

  document.querySelectorAll(".channel-item").forEach(i => i.classList.toggle("active", i.getAttribute("data-channel-id") === channelId));

  currentChannelId = channelId;
  localStorage.setItem("currentChannelId", channelId);
  clearMessagesView();

  if (currentChannelMessagesRef) {
    try { currentChannelMessagesRef.off(); } catch (e) {}
    currentChannelMessagesRef = null;
  }

  listenForChannelMessages(channelId);
}

function clearMessagesView() {
  if (!messagesDiv) return;
  messagesDiv.innerHTML = '<div class="system">No messages yet — say something to start the conversation.</div>';
}

function listenForChannelMessages(channelId) {
  if (!database || !channelId) return;
  currentChannelMessagesRef = database.ref(`messages/${channelId}`).orderByChild("timestamp").limitToLast(500);

  currentChannelMessagesRef.on("child_added", (snapshot) => {
    const obj = snapshot.val() || {};
    obj.id = snapshot.key;
    obj._channel = channelId;
    displayMessageForChannel(obj);
  });

  currentChannelMessagesRef.on("child_changed", (snapshot) => {
    const obj = snapshot.val() || {};
    obj.id = snapshot.key;
    obj._channel = channelId;
    const domId = sanitizeChannelMessageId(channelId, obj.id);
    const el = document.getElementById(domId);
    if (el) {
      const txt = el.querySelector(".message-text");
      if (txt) txt.textContent = safeText(obj.text || "");
      const meta = el.querySelector(".meta");
      if (meta && obj.timestamp) meta.textContent = new Date(Number(obj.timestamp)).toLocaleString();
    } else {
      displayMessageForChannel(obj);
    }
  });

  currentChannelMessagesRef.on("child_removed", (snapshot) => {
    const domId = sanitizeChannelMessageId(channelId, snapshot.key);
    const el = document.getElementById(domId);
    if (el) el.remove();
  });
}

// --- Channel creation UI ---
function setupChannelCreation() {
  const createBtn = document.getElementById("createChannelBtn");
  const input = document.getElementById("newChannelName");
  if (!createBtn || !input || !channelsRef) return;

  createBtn.addEventListener("click", async () => {
    const name = (input.value || "").trim();
    if (!name) return showToast("Enter a channel name");
    // uniqueness: check existing channels by name
    try {
      const snap = await channelsRef.orderByChild("name").equalTo(name).once("value");
      if (snap.exists()) {
        showToast("Channel name already exists");
        return;
      }
      const newRef = channelsRef.push();
      await newRef.set({
        name: name,
        createdBy: auth && auth.currentUser ? auth.currentUser.uid : "anon",
        timestamp: Date.now()
      });
      input.value = "";
      selectChannel(newRef.key);
    } catch (err) {
      console.error("create channel failed", err);
      showToast("Failed to create channel");
    }
  });

  input.addEventListener("keydown", (e) => { if (e.key === "Enter") createBtn.click(); });
}

// --- Main entrypoint ---
function main() {
  initFirebase();
  getDOMElements();
  setAppHeight();
  setupEventListeners();
  setupUsernameMemory();
  setupGoogleLogin();
  initChannels();
  setupChannelCreation();
}

document.addEventListener("DOMContentLoaded", main);
