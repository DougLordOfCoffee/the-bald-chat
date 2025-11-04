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
let toastTimer = null;

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
    console.error("Firebase compat SDK not loaded.");
    return;
  }
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  database = firebase.database();
  auth = firebase.auth();
}

// =====================
// --- DOM REFS ---
// =====================
function getDOMElements() {
  usernameInput = document.getElementById("usernameInput");
  messageInput = document.getElementById("messageInput");
  sendMessageBtn = document.getElementById("sendMessage");
  messagesDiv = document.getElementById("messages");
  themeToggleBtn = document.getElementById("themeToggle");
  googleBtn = document.getElementById("googleBtn");

  const toast = document.getElementById("toast");
  if (toast) toast.setAttribute("aria-hidden", "true");
}

// =====================
// --- APP HEIGHT ---
// =====================
function setAppHeight() {
  const appEl = document.querySelector(".app");
  if (!appEl) return;
  const styles = getComputedStyle(document.body);
  const padTop = parseFloat(styles.paddingTop) || 0;
  const padBottom = parseFloat(styles.paddingBottom) || 0;
  appEl.style.minHeight = `${window.innerHeight - padTop - padBottom}px`;
}
window.addEventListener("resize", setAppHeight);
window.addEventListener("orientationchange", setAppHeight);

// =====================
// --- TOAST ---
// =====================
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

// =====================
// --- USERNAME HANDLING ---
// =====================
function setupUsernameMemory() {
  if (!usernameInput) return;

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
    const user = auth.currentUser;
    const newName = usernameInput.value.trim();
    if (!newName) return;

    try {
      const ownerSnap = await usernamesRef.child(newName.toLowerCase()).once("value");
      if (ownerSnap.exists() && ownerSnap.val() !== (user ? user.uid : null)) {
        showToast("Name already taken.");
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
      showToast("Failed to save username.");
    }
  };

  usernameInput.addEventListener("blur", saveUsername);
  usernameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); saveUsername(); messageInput && messageInput.focus(); } });
  usernameInput.addEventListener("input", () => { localUsername = usernameInput.value.trim() || null; });
}

// =====================
// --- SEND MESSAGE ---
// =====================
function writeNewMessage(username, text) {
  if (!database) return console.error("Database not initialized.");
  if (!currentChannelId) { showToast("No channel selected"); return; }

  const ref = database.ref(`messages/${currentChannelId}`);
  ref.push().set({
    username,
    uid: auth && auth.currentUser ? auth.currentUser.uid : null,
    text,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  }).catch(console.error);
}

function setupSendMessage() {
  if (!sendMessageBtn || !messageInput) return;

  const send = () => {
    const messageText = messageInput.value.trim();
    const usernameText = (usernameInput?.value.trim()) || "Anonymous";
    localUsername = usernameInput?.value.trim() || localUsername;
    if (!messageText) return;
    writeNewMessage(usernameText, messageText);
    messageInput.value = "";
    messageInput.focus();
  };

  sendMessageBtn.addEventListener("click", send);
  messageInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); send(); } });
}

// =====================
// --- DISPLAY MESSAGES ---
// =====================
function clearMessagesView() {
  if (!messagesDiv) return;
  messagesDiv.innerHTML = '<div class="system">No messages yet — say something to start the conversation.</div>';
}

function displayMessageForChannel(message) {
  if (!messagesDiv) return;
  const domId = sanitizeChannelMessageId(message._channel || currentChannelId, message.id);
  let wrap = document.getElementById(domId);

  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = domId;
    wrap.className = "message";
    if (message.username === localUsername) wrap.classList.add("mine");

    const left = document.createElement("div");
    left.className = "message-left";

    const uname = document.createElement("span");
    uname.className = "username";
    uname.textContent = message.uid === ADMIN_UID ? `${safeText(message.username || "Anonymous")} ⭐` : safeText(message.username || "Anonymous");

    const textEl = document.createElement("div");
    textEl.className = "message-text";
    textEl.textContent = safeText(message.text);

    const meta = document.createElement("span");
    meta.className = "meta";
    if (message.timestamp) meta.textContent = new Date(Number(message.timestamp)).toLocaleString();

    left.append(uname, textEl, meta);
    wrap.appendChild(left);

    const actions = document.createElement("div");
    actions.className = "message-actions";
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.innerHTML = "&times;";
    deleteBtn.addEventListener("click", () => {
      if (confirm("Delete this message?")) database.ref(`messages/${message._channel}`).child(message.id).remove().catch(console.error);
    });

    const currentUserId = auth?.currentUser?.uid;
    if (currentUserId && (message.uid === currentUserId || currentUserId === ADMIN_UID)) actions.appendChild(deleteBtn);

    wrap.appendChild(actions);
    messagesDiv.appendChild(wrap);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  } else {
    wrap.querySelector(".message-text").textContent = safeText(message.text || "");
    const meta = wrap.querySelector(".meta");
    if (meta && message.timestamp) meta.textContent = new Date(Number(message.timestamp)).toLocaleString();
  }
}

// =====================
// --- CHANNELS ---
// =====================
async function initChannels() {
  if (!database) return;
  channelsRef = database.ref("channels");

  // Ensure at least one channel exists
  const snap = await channelsRef.get();
  if (!snap.exists()) {
    const chRef = await channelsRef.push({ name: 'general', createdBy: auth?.currentUser?.uid || 'system', timestamp: Date.now() });
    currentChannelId = chRef.key;
  }

  channelsRef.orderByChild('timestamp').on("child_added", (snap) => {
    const ch = snap.val(); ch.id = snap.key; renderChannelItem(ch);
    if (!currentChannelId) selectChannel(ch.id);
  });
  channelsRef.on("child_changed", (snap) => updateChannelItem({ ...snap.val(), id: snap.key }));
  channelsRef.on("child_removed", (snap) => {
    const el = document.querySelector(`[data-channel-id="${snap.key}"]`);
    if (el) el.remove();
    if (currentChannelId === snap.key) clearMessagesView();
  });
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
  if (!channelId || currentChannelId === channelId) return;
  currentChannelId = channelId;
  localStorage.setItem("currentChannelId", channelId);

  document.querySelectorAll(".channel-item").forEach(i => i.classList.toggle("active", i.getAttribute("data-channel-id") === channelId));

  if (currentChannelMessagesRef) currentChannelMessagesRef.off();
  listenForChannelMessages(channelId);
  clearMessagesView();
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
  if (!googleBtn) return;
  googleBtn.addEventListener("click", async () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    try { await auth.signInWithPopup(provider); } catch (err) { if (err.code !== "auth/popup-closed-by-user") showToast("Sign-in canceled."); }
  });

  auth.onAuthStateChanged((user) => {
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
  if (!themeToggleBtn) return;
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "light") document.body.classList.add("light");

  const updateButton = () => themeToggleBtn.setAttribute("aria-pressed", String(document.body.classList.contains("light")));
  updateButton();

  themeToggleBtn.addEventListener("click", () => {
    document.body.classList.toggle("light");
    localStorage.setItem("theme", document.body.classList.contains("light") ? "light" : "dark");
    updateButton();
    showToast(document.body.classList.contains("light") ? "Light theme enabled" : "Dark theme enabled");
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

    try {
      const snap = await channelsRef.orderByChild("name").equalTo(name).once("value");
      if (snap.exists()) return showToast("Channel name already exists");

      const newRef = channelsRef.push();
      await newRef.set({ name, createdBy: auth?.currentUser?.uid || "anon", timestamp: Date.now() });
      input.value = "";
      selectChannel(newRef.key);
    } catch (err) { console.error(err); showToast("Failed to create channel"); }
  };

  createBtn.addEventListener("click", create);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") create(); });
}

// ---------- DEBUGGED writeNewMessage ----------
function writeNewMessage(username, text) {
  if (!database) { console.error("DB not initialized in writeNewMessage"); return; }

  // Defensive checks
  if (!currentChannelId || currentChannelId === "null" || currentChannelId === "undefined") {
    console.error("writeNewMessage: invalid currentChannelId:", currentChannelId);
    // fallback
    const saved = localStorage.getItem("currentChannelId");
    console.warn("Falling back to saved channelId:", saved);
    currentChannelId = saved || "general";
    console.warn("Using channel:", currentChannelId);
  }

  const path = `messages/${currentChannelId}`;
  const payload = {
    username: username || localUsername || "Anonymous",
    uid: auth && auth.currentUser ? auth.currentUser.uid : null,
    text,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  };

  console.log("writeNewMessage -> writing to", path, payload);
  const ref = database.ref(path);
  ref.push(payload)
    .then(() => console.log("writeNewMessage -> write SUCCESS"))
    .catch(err => console.error("writeNewMessage -> write ERROR:", err));
}

// ---------- DEBUGGED selectChannel ----------
function selectChannel(channelId) {
  console.log("selectChannel called with:", channelId, "currentChannelId before:", currentChannelId);
  if (!channelId) { console.error("selectChannel aborted: falsy channelId"); return; }
  if (currentChannelId === channelId) { console.log("selectChannel: already selected"); return; }

  currentChannelId = channelId;
  localStorage.setItem("currentChannelId", channelId);

  document.querySelectorAll(".channel-item").forEach(i => i.classList.toggle("active", i.getAttribute("data-channel-id") === channelId));

  if (currentChannelMessagesRef) {
    try { currentChannelMessagesRef.off(); } catch (e) { console.warn("Error turning off previous ref", e); }
  }
  clearMessagesView();
  listenForChannelMessages(channelId);
  console.log("selectChannel -> now listening for channel:", channelId);
}

// ---------- DEBUGGED listenForChannelMessages ----------
function listenForChannelMessages(channelId) {
  console.log("listenForChannelMessages called for:", channelId);
  if (!database || !channelId) { console.error("listenForChannelMessages aborted; missing database or channelId:", database, channelId); return; }

  if (currentChannelMessagesRef) {
    try { currentChannelMessagesRef.off(); } catch (e) { console.warn("Error off() prev ref:", e); }
  }

  currentChannelMessagesRef = database.ref(`messages/${channelId}`).orderByChild('timestamp').limitToLast(500);

  currentChannelMessagesRef.on("child_added", snap => {
    console.log("child_added -> channel:", channelId, "key:", snap.key, "val:", snap.val());
    const msg = snap.val(); msg.id = snap.key; msg._channel = channelId;
    displayMessageForChannel(msg);
  });
  currentChannelMessagesRef.on("child_changed", snap => {
    console.log("child_changed -> channel:", channelId, "key:", snap.key, "val:", snap.val());
    const msg = snap.val(); msg.id = snap.key; msg._channel = channelId;
    displayMessageForChannel(msg);
  });
  currentChannelMessagesRef.on("child_removed", snap => {
    console.log("child_removed -> channel:", channelId, "key:", snap.key);
    const el = document.getElementById(sanitizeChannelMessageId(channelId, snap.key));
    if (el) el.remove();
  });

  console.log("listenForChannelMessages -> set up listeners for", channelId);
}


// =====================
// --- ENTRY POINT ---
// =====================
function main() {
  initFirebase();
  getDOMElements();
  
  // ✅ Add this:
  localUsername = localStorage.getItem("username") || "Anonymous";
  if (usernameInput) usernameInput.value = localUsername;

  setAppHeight();
  setupUsernameMemory();
  setupSendMessage();
  setupGoogleLogin();
  setupThemeToggle();
  initChannels();
  setupChannelCreation();
}


document.addEventListener("DOMContentLoaded", main);
