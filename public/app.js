// ======================================================
// BALD CHAT 2.0 — Super Duper Awesome Sauce Refactor
// ======================================================

// Config
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

// Shortcuts
const $ = id => document.getElementById(id);
const htmlEscape = s => (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Firebase Boot
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();

// State
let localUsername = localStorage.getItem("username") || "Anonymous";
let currentChannel = null;
let unsubscribeMessages = null;

// ------------------------------------------------------
// UI TOOLS
// ------------------------------------------------------
const toast = (msg, time = 1500) => {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), time);
};

const autoHeight = () => {
  const app = document.querySelector(".app");
  if (app) app.style.minHeight = `${window.innerHeight}px`;
};
window.addEventListener("resize", autoHeight);
window.addEventListener("orientationchange", autoHeight);

// ------------------------------------------------------
// USERNAME HANDLING
// ------------------------------------------------------
async function saveUsername(newName) {
  newName = newName.trim();
  if (!newName) return;

  const user = auth.currentUser;
  const usernamesRef = db.ref("usernames");
  const usersRef = db.ref("users");

  const nameTaken = await usernamesRef.child(newName.toLowerCase()).get();
  if (nameTaken.exists() && nameTaken.val() !== (user?.uid || null)) {
    toast("Username already taken");
    $("usernameInput").value = localUsername;
    return;
  }

  // Remove old reference
  if (localUsername && user) await usernamesRef.child(localUsername.toLowerCase()).remove().catch(()=>{});

  // Save new
  if (user) {
    await usernamesRef.child(newName.toLowerCase()).set(user.uid);
    await usersRef.child(user.uid).child("username").set(newName);
  }

  localUsername = newName;
  localStorage.setItem("username", newName);
  toast("Username updated!");
}

function setupUsername() {
  $("usernameInput").value = localUsername;
  $("usernameInput").addEventListener("blur", () => saveUsername($("usernameInput").value));
  $("usernameInput").addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveUsername($("usernameInput").value);
      $("messageInput").focus();
    }
  });
}

// ------------------------------------------------------
// MESSAGES
// ------------------------------------------------------
function sendMessage() {
  const text = $("messageInput").value.trim();
  if (!text || !currentChannel) return;

  db.ref(`messages/${currentChannel}`).push({
    text,
    username: localUsername,
    uid: auth.currentUser?.uid || null,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  });

  $("messageInput").value = "";
}

function renderMessage({ id, username, text, uid, timestamp }) {
  const wrap = document.createElement("div");
  wrap.className = "message" + (username === localUsername ? " mine" : "");
  wrap.id = `msg_${id}`;

  wrap.innerHTML = `
    <div class="message-left">
      <span class="username">${htmlEscape(username)}${uid === ADMIN_UID ? " ⭐" : ""}</span>
      <div class="message-text">${htmlEscape(text)}</div>
      <span class="meta">${timestamp ? new Date(timestamp).toLocaleString() : ""}</span>
    </div>
    <div class="message-actions"></div>
  `;

  const actions = wrap.querySelector(".message-actions");
  if (auth.currentUser && (uid === auth.currentUser.uid || auth.currentUser.uid === ADMIN_UID)) {
    const del = document.createElement("button");
    del.className = "delete-btn";
    del.innerHTML = "&times;";
    del.onclick = () => confirm("Delete message?") && db.ref(`messages/${currentChannel}/${id}`).remove();
    actions.appendChild(del);
  }

  $("messages").appendChild(wrap);
  $("messages").scrollTop = $("messages").scrollHeight;
}

function loadMessages(channel) {
  if (unsubscribeMessages) unsubscribeMessages.off();

  $("messages").innerHTML = `<div class="system">Loading messages…</div>`;
  currentChannel = channel;

  unsubscribeMessages = db.ref(`messages/${channel}`).orderByChild("timestamp");

  unsubscribeMessages.on("child_added", snap => {
    renderMessage({ id: snap.key, ...snap.val() });
  });

  unsubscribeMessages.on("child_removed", snap => {
    const el = $(`msg_${snap.key}`);
    if (el) el.remove();
  });

  $("messages").innerHTML = "";
}

// ------------------------------------------------------
// CHANNELS
// ------------------------------------------------------
async function loadChannels() {
  const list = $("channelList");
  const channels = await db.ref("channels").get();

  list.innerHTML = "";
  channels.forEach(c => addChannelItem(c.key, c.val()));

  if (!currentChannel)
    selectChannel(Object.keys(channels.val() || {})[0]);
}

function addChannelItem(id, { name }) {
  if ($(`chan_${id}`)) return;

  const el = document.createElement("div");
  el.className = "channel-item";
  el.id = `chan_${id}`;
  el.textContent = `# ${name}`;
  el.onclick = () => selectChannel(id);
  $("channelList").appendChild(el);
}

function selectChannel(id) {
  currentChannel = id;
  document.querySelectorAll(".channel-item").forEach(el =>
    el.classList.toggle("active", el.id === `chan_${id}`)
  );
  loadMessages(id);
}

// ------------------------------------------------------
// LOGIN
// ------------------------------------------------------
function setupGoogleLogin() {
  $("googleBtn").onclick = () => auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
  auth.onAuthStateChanged(async user => {
    if (user) {
      $("googleBtn").textContent = "Signed In ✅";
      const snap = await db.ref(`users/${user.uid}/username`).get();
      if (snap.exists()) {
        localUsername = snap.val();
        $("usernameInput").value = localUsername;
      }
    } else {
      $("googleBtn").textContent = "Sign in with Google";
    }
  });
}

// ------------------------------------------------------
// MAIN
// ------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  autoHeight();
  setupUsername();
  setupGoogleLogin();
  loadChannels();

  $("sendMessage").onclick = sendMessage;
  $("messageInput").addEventListener("keydown", e => e.key === "Enter" && sendMessage());
});
