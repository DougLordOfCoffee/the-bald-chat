// =====================
// --- CONFIG / CONST ---
// =====================
const firebaseConfig = {
  apiKey: "AIzaSyAANuaXF-zSqAs9kzIBnW3ROLDwxGXA1p8",
  authDomain: "the-bald-chat.firebaseapp.com",
  projectId: "the-bald-chat",
  storageBucket: "the-bald-chat.appspot.com",
  messagingSenderId: "831148484483",
  appId: "1:831148484483:web:23747c98adcd6e989db8b6",
  databaseURL: "https://the-bald-chat-default-rtdb.firebaseio.com"
};

const ADMIN_UID = "shELHHG7NJPJqQ0aRb7NR3sPhpJ3";

// =====================
// --- GLOBAL STATE ---
// =====================
let database, auth;
let usernameInput, messageInput, sendMessageBtn, messagesDiv, themeToggleBtn, googleBtn;
let localUsername = null;
let channelsRef = null;
let currentChannelId = null;
let currentChannelMessagesRef = null;

// =====================
// --- HELPERS ---
// =====================
const sanitizeId = (key) => "msg_" + String(key).replace(/[^a-zA-Z0-9\-_:.]/g, "_");
const sanitizeChannelMessageId = (channelId, messageId) => sanitizeId((channelId || "chan") + "_" + (messageId || Date.now()));
const safeText = (t) => String(t == null ? "" : t);
const escapeHtml = (s) => String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// =====================
// --- FIREBASE INIT ---
// =====================
function initFirebase() {
  if (typeof firebase !== "object" || !firebase.initializeApp) {
    console.error("Firebase not loaded");
    return;
  }
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  database = firebase.database();
  auth = firebase.auth();
}

// =====================
// --- DOM ELEMENTS ---
// =====================
function getDOMElements() {
  usernameInput = document.getElementById("usernameInput");
  messageInput = document.getElementById("messageInput");
  sendMessageBtn = document.getElementById("sendMessage");
  messagesDiv = document.getElementById("messages");
  themeToggleBtn = document.getElementById("themeToggle");
  googleBtn = document.getElementById("googleBtn");
}

// =====================
// --- TOAST ---
// =====================
let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
}

// =====================
// --- APP HEIGHT ---
// =====================
function setAppHeight() {
  const appEl = document.querySelector(".app");
  if (!appEl) return;
  appEl.style.minHeight = `${window.innerHeight}px`;
}
window.addEventListener("resize", setAppHeight);
window.addEventListener("orientationchange", setAppHeight);

// =====================
// --- USERNAME ---
// =====================
function setupUsernameMemory() {
  const usersRef = database.ref("users");
  const usernamesRef = database.ref("usernames");

  auth.onAuthStateChanged(async (user) => {
    if (!user) return;
    const snap = await usersRef.child(user.uid).child("username").once("value");
    if (snap.exists()) {
      localUsername = snap.val();
      usernameInput.value = localUsername;
      localStorage.setItem("username", localUsername);
    } else if (localStorage.getItem("username")) {
      localUsername = localStorage.getItem("username");
      usernameInput.value = localUsername;
    }
  });

  const saveUsername = async () => {
    const newName = usernameInput.value.trim();
    if (!newName) return;

    try {
      const user = auth.currentUser;
      const ownerSnap = await usernamesRef.child(newName.toLowerCase()).once("value");
      if (ownerSnap.exists() && ownerSnap.val() !== (user ? user.uid : null)) {
        showToast("Name taken");
        usernameInput.value = localUsername || "";
        return;
      }

      if (localUsername && user) await usernamesRef.child(localUsername.toLowerCase()).remove().catch(() => {});
      if (user) {
        await usernamesRef.child(newName.toLowerCase()).set(user.uid);
        await usersRef.child(user.uid).child("username").set(newName);
      }

      localUsername = newName;
      localStorage.setItem("username", newName);
      showToast("Username updated!");
    } catch (err) {
      console.error(err);
      showToast("Failed to save username");
    }
  };

  usernameInput.addEventListener("blur", saveUsername);
  usernameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); saveUsername(); messageInput && messageInput.focus(); } });
}

// =====================
// --- SEND MESSAGE ---
// =====================
function writeNewMessage(username, text) {
  if (!database || !currentChannelId) return;
  const ref = database.ref(`messages/${currentChannelId}`);
  ref.push({
    username: username || localUsername || "Anonymous",
    uid: auth?.currentUser?.uid || null,
    text,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  }).catch(console.error);
}

function setupSendMessage() {
  const send = () => {
    const text = messageInput.value.trim();
    if (!text) return;
    writeNewMessage(usernameInput.value.trim() || "Anonymous", text);
    messageInput.value = "";
  };
  sendMessageBtn.addEventListener("click", send);
  messageInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); send(); } });
}

// =====================
// --- DISPLAY MESSAGES ---
// =====================
function clearMessagesView() {
  if (!messagesDiv) return;
  messagesDiv.innerHTML = '<div class="system">No messages yet — say something!</div>';
}

function displayMessageForChannel(msg) {
  if (!messagesDiv) return;
  const domId = sanitizeChannelMessageId(msg._channel || currentChannelId, msg.id);
  let wrap = document.getElementById(domId);

  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = domId;
    wrap.className = "message";
    if (msg.username === localUsername) wrap.classList.add("mine");

    const left = document.createElement("div");
    left.className = "message-left";

    const uname = document.createElement("span");
    uname.className = "username";
    uname.textContent = msg.uid === ADMIN_UID ? `${safeText(msg.username || "Anonymous")} ⭐` : safeText(msg.username || "Anonymous");

    const textEl = document.createElement("div");
    textEl.className = "message-text";
    textEl.textContent = safeText(msg.text);

    const meta = document.createElement("span");
    meta.className = "meta";
    if (msg.timestamp) meta.textContent = new Date(Number(msg.timestamp)).toLocaleString();

    left.append(uname, textEl, meta);
    wrap.appendChild(left);

    const actions = document.createElement("div");
    actions.className = "message-actions";
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.innerHTML = "&times;";
    deleteBtn.addEventListener("click", () => {
      if (confirm("Delete this message?")) database.ref(`messages/${msg._channel}`).child(msg.id).remove().catch(console.error);
    });
    const uid = auth?.currentUser?.uid;
    if (uid && (msg.uid === uid || uid === ADMIN_UID)) actions.appendChild(deleteBtn);

    wrap.appendChild(actions);
    messagesDiv.appendChild(wrap);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  } else {
    wrap.querySelector(".message-text").textContent = safeText(msg.text || "");
    const meta = wrap.querySelector(".meta");
    if (meta && msg.timestamp) meta.textContent = new Date(Number(msg.timestamp)).toLocaleString();
  }
}

// =====================
// --- CHANNELS ---
// =====================
async function initChannels() {
  if (!database) return;
  channelsRef = database.ref("channels");

  const snap = await channelsRef.get();
  let firstChannelId = null;

  if (!snap.exists()) {
    const newRef = await channelsRef.push({ name: 'general', createdBy: auth?.currentUser?.uid || 'system', timestamp: Date.now() });
    firstChannelId = newRef.key;
  } else {
    firstChannelId = Object.keys(snap.val())[0];
  }

  snap.exists() && Object.entries(snap.val()).forEach(([id, ch]) => renderChannelItem({ id, ...ch }));

  // ✅ Set up live listeners
  channelsRef.on("child_added", snap => renderChannelItem({ id: snap.key, ...snap.val() }));
  channelsRef.on("child_changed", snap => updateChannelItem({ id: snap.key, ...snap.val() }));
  channelsRef.on("child_removed", snap => {
    const el = document.querySelector(`[data-channel-id="${snap.key}"]`);
    if (el) el.remove();
    if (currentChannelId === snap.key) clearMessagesView();
  });

  // ✅ Auto-select first channel
  if (firstChannelId) selectChannel(firstChannelId);
}

function renderChannelItem(ch) {
  const list = document.getElementById("channelList");
  if (!list || document.querySelector(`[data-channel-id="${ch.id}"]`)) return;

  const item = document.createElement("div");
  item.className = "channel-item";
  item.setAttribute("data-channel-id", ch.id);
  item.tabIndex = 0;
  item.innerHTML = `<span># ${escapeHtml(ch.name)}</span><span class="meta">${ch.memberCount || ""}</span>`;

  item.addEventListener("click", () => selectChannel(ch.id));
  item.addEventListener("keydown", e => { if (e.key === "Enter") selectChannel(ch.id); });

  list.prepend(item);
}

function updateChannelItem(ch) {
  const el = document.querySelector(`[data-channel-id="${ch.id}"]`);
  if (!el) return;
  const meta = el.querySelector(".meta");
  if (meta) meta.textContent = ch.memberCount || "";
}

function selectChannel(channelId) {
  if (!channelId || currentChannelId === channelId) return;

  currentChannelId = channelId;
  localStorage.setItem("currentChannelId", channelId);

  document.querySelectorAll(".channel-item").forEach(i => i.classList.toggle("active", i.getAttribute("data-channel-id") === channelId));

  if (currentChannelMessagesRef) currentChannelMessagesRef.off();
  clearMessagesView();
  listenForChannelMessages(channelId);
}

function listenForChannelMessages(channelId) {
  if (!database || !channelId) return;

  currentChannelMessagesRef = database.ref(`messages/${channelId}`).orderByChild('timestamp').limitToLast(500);

  currentChannelMessagesRef.on("child_added", snap => {
    const msg = snap.val(); msg.id = snap.key; msg._channel = channelId;
    displayMessageForChannel(msg);
  });
  currentChannelMessagesRef.on("child_changed", snap => {
    const msg = snap.val(); msg.id = snap.key; msg._channel = channelId;
    displayMessageForChannel(msg);
  });
  currentChannelMessagesRef.on("child_removed", snap => {
    const el = document.getElementById(sanitizeChannelMessageId(channelId, snap.key));
    if (el) el.remove();
  });
}

// =====================
// --- GOOGLE LOGIN ---
// =====================
function setupGoogleLogin() {
  googleBtn.addEventListener("click", async () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    try { await auth.signInWithPopup(provider); } catch (err) { if (err.code !== "auth/popup-closed-by-user") showToast("Sign-in failed"); }
  });

  auth.onAuthStateChanged(user => {
    if (!googleBtn) return;
    if (user) {
      googleBtn.classList.add("signed-in"); googleBtn.textContent = "Signed in";
      database.ref(`users/${user.uid}/username`).once("value").then(snap => {
        if (snap.exists()) { localUsername = snap.val(); usernameInput.value = localUsername; localStorage.setItem("username", localUsername); }
      }).catch(()=>{});
    } else {
      googleBtn.classList.remove("signed-in"); googleBtn.textContent = "Sign in with Google";
    }
  });
}

// =====================
// --- THEME TOGGLE ---
// =====================
function setupThemeToggle() {
  const saved = localStorage.getItem("theme");
  if (saved === "light") document.body.classList.add("light");

  themeToggleBtn.addEventListener("click", () => {
    document.body.classList.toggle("light");
    localStorage.setItem("theme", document.body.classList.contains("light") ? "light" : "dark");
    showToast(document.body.classList.contains("light") ? "Light theme" : "Dark theme");
  });
}

// =====================
// --- CHANNEL CREATION ---
// =====================
function setupChannelCreation() {
  const createBtn = document.getElementById("createChannelBtn");
  const input = document.getElementById("newChannelName");
  if (!createBtn || !input || !channelsRef) return;

  const create = async () => {
    const name = (input.value || "").trim();
    if (!name) return showToast("Enter a channel name");

    const snap = await channelsRef.orderByChild("name").equalTo(name).once("value");
    if (snap.exists()) return showToast("Channel name exists");

    const newRef = channelsRef.push();
    await newRef.set({ name, createdBy: auth?.currentUser?.uid || "anon", timestamp: Date.now() });
    input.value = "";
    selectChannel(newRef.key);
  };

  createBtn.addEventListener("click", create);
  input.addEventListener("keydown", e => { if (e.key === "Enter") create(); });
}

// =====================
// --- ENTRY POINT ---
// =====================
function main() {
  initFirebase();
  getDOMElements();
  setAppHeight();
  localUsername = localStorage.getItem("username") || "Anonymous";
  if (usernameInput) usernameInput.value = localUsername;

  setupUsernameMemory();
  setupSendMessage();
  setupGoogleLogin();
  setupThemeToggle();
  initChannels();
  setupChannelCreation();
}

document.addEventListener("DOMContentLoaded", main);
