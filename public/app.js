// ======================================================
// BALD CHAT 2.0 — NOW FORMATTED & FUNCTIONING
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

// Your admin UID (from Firebase Auth)
const ADMIN_UID = "shELHHG7NJPJqQ0aRb7NR3sPhpJ3";

// Shortcuts
const $ = id => document.getElementById(id);
const htmlEscape = s =>
  (s || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));

// Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();

// State
let localUsername = localStorage.getItem("username") || "Anonymous";
let currentChannel = null;
let isAdmin = false;
let unsubscribeMessages = null;


// ------------------------------------------------------
// UI
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
// ADMIN MODE
// ------------------------------------------------------
function enableAdminMode() {
  isAdmin = true;
  document.body.classList.add("admin");
  console.log("%cADMIN MODE ENABLED", "color:#00ff9d; font-weight:bold;");
}


// ------------------------------------------------------
// USERNAME MANAGEMENT
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

  if (localUsername && user)
    await usernamesRef.child(localUsername.toLowerCase()).remove().catch(() => {});

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

  db.ref(`channels/${currentChannel}/messages`).push({
    text,
    username: localUsername,
    uid: auth.currentUser?.uid || null,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  });

  $("messageInput").value = "";
}

function renderMessage({ id, text, username, uid, timestamp }) {
  if (!id) return;

  if (document.getElementById(`msg_${id}`)) return;

  const wrap = document.createElement("div");
  wrap.className = "message" + (username === localUsername ? " mine" : "");
  wrap.id = `msg_${id}`;

  wrap.innerHTML = `
    <span class="username">${htmlEscape(username || "Anonymous")}${uid === ADMIN_UID ? " ⭐" : ""}</span>
    <div class="message-text">${htmlEscape(text || "")}</div>
    <span class="meta">${timestamp ? new Date(timestamp).toLocaleString() : ""}</span>
  `;

  // ADMIN BUTTONS
  if (isAdmin) {
    const actions = document.createElement("div");
    actions.className = "message-actions";

    const del = document.createElement("button");
    del.className = "delete-btn";
    del.textContent = "✖";
    del.onclick = () => deleteMessage(currentChannel, id);
    actions.appendChild(del);

    const edit = document.createElement("button");
    edit.className = "delete-btn";
    edit.textContent = "✎";
    edit.onclick = () => editMessage(currentChannel, id, text);
    actions.appendChild(edit);

    wrap.appendChild(actions);
  }

  $("messages").appendChild(wrap);
  $("messages").scrollTop = $("messages").scrollHeight;
}

function loadMessages(channel) {
  if (unsubscribeMessages) unsubscribeMessages.off();
  $("messages").innerHTML = "";

  currentChannel = channel;

  unsubscribeMessages = db.ref(`channels/${channel}/messages`).orderByChild("timestamp");

  unsubscribeMessages.on("child_added", snap =>
    renderMessage({ id: snap.key, ...snap.val() })
  );

  unsubscribeMessages.on("child_removed", snap => {
    const el = $(`msg_${snap.key}`);
    if (el) el.remove();
  });
}


// ------------------------------------------------------
// ADMIN MESSAGE FUNCS
// ------------------------------------------------------
function deleteMessage(channelId, messageId) {
  db.ref(`channels/${channelId}/messages/${messageId}`).remove();
}

function editMessage(channelId, messageId, oldText) {
  const newText = prompt("Edit message:", oldText);
  if (!newText) return;
  db.ref(`channels/${channelId}/messages/${messageId}/text`).set(newText);
}


// ------------------------------------------------------
// CHANNELS
// ------------------------------------------------------
async function loadChannels() {
  const list = $("channelList");
  const channels = await db.ref("channels").get();

  list.innerHTML = "";
  channels.forEach(c => addChannelItem(c.key, c.val()));

  if (!currentChannel && channels.exists())
    selectChannel(Object.keys(channels.val())[0]);
}

function addChannelItem(id, { name }) {
  const el = document.createElement("div");
  el.className = "channel-item";
  el.id = `chan_${id}`;
  el.textContent = `# ${name}`;
  el.onclick = () => selectChannel(id);

  if (isAdmin) {
    const del = document.createElement("button");
    del.className = "delete-btn";
    del.textContent = "🗑";
    del.onclick = e => {
      e.stopPropagation();
      if (confirm(`Delete channel: ${name}?`)) {
        db.ref(`channels/${id}`).remove();
      }
    };
    el.appendChild(del);
  }

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
  $("googleBtn").onclick = () =>
    auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());

  auth.onAuthStateChanged(async user => {
    $("googleBtn").textContent = user ? "Signed In ✅" : "Sign in with Google";

    if (user && user.uid === ADMIN_UID) enableAdminMode();

    if (user) {
      const snap = await db.ref(`users/${user.uid}/username`).get();
      if (snap.exists()) {
        localUsername = snap.val();
        $("usernameInput").value = localUsername;
      }
    }
  });
}


// ------------------------------------------------------
// MAIN
// ------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  autoHeight();
  setupUsername();
  setupGoogleLogin();
  loadChannels();

  $("sendMessage").onclick = sendMessage;
  $("messageInput").addEventListener("keydown", e => e.key === "Enter" && sendMessage());
});
