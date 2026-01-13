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
let localAvatar = localStorage.getItem("avatar") || "";
let currentChannel = null;
let unsubscribeMessages = null;
let notificationPermission = false;
let userStatuses = {}; // Cache for user statuses

// Load custom colors
const customPrimary = localStorage.getItem("customPrimary") || "#9b5cf6";
const customSecondary = localStorage.getItem("customSecondary") || "#00e0ff";
document.documentElement.style.setProperty('--accent', customPrimary);
document.documentElement.style.setProperty('--accent2', customSecondary);
$("primaryColor").value = customPrimary;
$("secondaryColor").value = customSecondary;

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

async function loadUserStatuses() {
  const statusesSnap = await db.ref("statuses").get();
  userStatuses = statusesSnap.val() || {};
}

const getUserStatus = (uid) => userStatuses[uid] || null;

function applyCustomColors() {
  const primary = $("primaryColor").value;
  const secondary = $("secondaryColor").value;
  document.documentElement.style.setProperty('--accent', primary);
  document.documentElement.style.setProperty('--accent2', secondary);
  localStorage.setItem("customPrimary", primary);
  localStorage.setItem("customSecondary", secondary);
  toast("Colors applied!");
}

const autoHeight = () => {
  const app = document.querySelector(".app");
  if (app) app.style.minHeight = `${window.innerHeight}px`;
};
window.addEventListener("resize", autoHeight);
window.addEventListener("orientationchange", autoHeight);

// ------------------------------------------------------
// NOTIFICATIONS
// ------------------------------------------------------
async function requestNotificationPermission() {
  if ('Notification' in window) {
    const permission = await Notification.requestPermission();
    notificationPermission = permission === 'granted';
    return notificationPermission;
  }
  return false;
}

function showNotification(title, body) {
  if (notificationPermission && document.hidden) {
    new Notification(title, {
      body: body,
      icon: 'Favicon.png'
    });
  }
}
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

async function saveAvatar(newAvatar) {
  newAvatar = newAvatar.trim();

  const user = auth.currentUser;
  const usersRef = db.ref("users");

  if (user) {
    await usersRef.child(user.uid).child("avatar").set(newAvatar);
  }

  localAvatar = newAvatar;
  localStorage.setItem("avatar", newAvatar);
  toast("Avatar updated!");
}

function setupUsername() {
  $("usernameInput").value = localUsername;
  $("avatarInput").value = localAvatar;
  $("usernameInput").addEventListener("blur", () => saveUsername($("usernameInput").value));
  $("avatarInput").addEventListener("blur", () => saveAvatar($("avatarInput").value));
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
    avatar: localAvatar,
    uid: auth.currentUser?.uid || null,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  });

  $("messageInput").value = "";
}

function renderMessage(data) {
  if (!data || !data.id) return; // <--- prevents "id undefined" crash
  
  const { id, username, text, avatar, uid, timestamp } = data;

  // Remove duplicate if already exists
  const existing = document.getElementById(`msg_${id}`);
  if (existing) return;

  // Remove loading message if present
  const loading = $("messages").querySelector(".system");
  if (loading) loading.remove();

  const wrap = document.createElement("div");
  wrap.className = "message" + (username === localUsername ? " mine" : "");
  wrap.id = `msg_${id}`;

  const status = getUserStatus(uid);
  const statusColor = status === 'dev' ? '#ffd700' : status === 'mod' ? '#ff4444' : status === 'vip' ? '#00ff88' : customSecondary;

  wrap.innerHTML = `
    <div class="message-left">
      ${avatarHtml}
      <div class="message-content">
        <span class="username" style="color: ${statusColor};">${htmlEscape(username || "Anonymous")}${uid === ADMIN_UID ? " ⭐" : ""}</span>
        <div class="message-text">${htmlEscape(text || "")}</div>
        <span class="meta">${timestamp ? new Date(timestamp).toLocaleString() : ""}</span>
      </div>
    </div>
    <div class="message-actions"></div>
  `;

  const actions = wrap.querySelector(".message-actions");
  const user = auth.currentUser;

  if (user && (uid === user.uid || user.uid === ADMIN_UID)) {
    const del = document.createElement("button");
    del.className = "delete-btn";
    del.innerHTML = "&times;";
    del.onclick = () => confirm("Delete message?") && db.ref(`messages/${currentChannel}/${id}`).remove();
    actions.appendChild(del);
  }

  $("messages").appendChild(wrap);
  $("messages").scrollTop = $("messages").scrollHeight;

  // Show notification for new messages from others
  if (username !== localUsername) {
    showNotification(`${username} in #${currentChannel}`, text);
  }
}


function loadMessages(channel) {
  console.log('Loading messages for channel:', channel);
  if (unsubscribeMessages) unsubscribeMessages.off();

  $("messages").innerHTML = `<div class="system">Loading messages…</div>`;
  currentChannel = channel;

  unsubscribeMessages = db.ref(`messages/${channel}`).orderByChild("timestamp");

  unsubscribeMessages.on("child_added", snap => {
    console.log('Message added:', snap.key, snap.val());
    renderMessage({ id: snap.key, ...snap.val() });
  });

  unsubscribeMessages.on("child_removed", snap => {
    const el = $(`msg_${snap.key}`);
    if (el) el.remove();
  });

  // If no messages after 2 seconds, show no messages
  setTimeout(() => {
    if (!$("messages").querySelector(".message")) {
      console.log('No messages found, showing no messages');
      $("messages").innerHTML = `<div class="system">No messages yet — say something to start the conversation.</div>`;
    }
  }, 2000);
}

// ------------------------------------------------------
// CHANNELS
// ------------------------------------------------------
async function loadChannels() {
  console.log('Loading channels');
  const list = $("channelList");
  const channels = await db.ref("channels").get();
  console.log('Channels:', channels.val());

  list.innerHTML = "";
  channels.forEach(c => addChannelItem(c.key, c.val()));

  const channelKeys = Object.keys(channels.val() || {});
  console.log('Channel keys:', channelKeys);
  if (channelKeys.length === 0) {
    // Create default channel if none exist
    console.log('Creating default main channel');
    await db.ref("channels/main").set({ name: "main" });
    addChannelItem("main", { name: "main" });
    selectChannel("main");
  } else if (!currentChannel) {
    selectChannel(channelKeys[0]);
  }
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

async function createChannel() {
  const name = $("newChannelName").value.trim().replace(/\s+/g, '');
  if (!name) return toast("Enter a channel name");

  const channelsRef = db.ref("channels");
  const existing = await channelsRef.child(name).get();
  if (existing.exists()) return toast("Channel already exists");

  await channelsRef.child(name).set({ name });
  $("newChannelName").value = "";
  loadChannels();
}

// ------------------------------------------------------
// LOGIN
// ------------------------------------------------------
function setupGoogleLogin() {
  $("googleBtn").onclick = () => auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
  auth.onAuthStateChanged(async user => {
    if (user) {
      $("googleBtn").textContent = "Signed In ✅";
      const userSnap = await db.ref(`users/${user.uid}`).get();
      if (userSnap.exists()) {
        const data = userSnap.val();
        if (data.username) {
          localUsername = data.username;
          $("usernameInput").value = localUsername;
        }
        if (data.avatar) {
          localAvatar = data.avatar;
          $("avatarInput").value = localAvatar;
        }
      }
    } else {
      $("googleBtn").textContent = "Sign in with Google";
    }
  });
}

async function signInWithEmail() {
  const email = $("emailInput").value.trim();
  const password = $("passwordInput").value.trim();
  if (!email || !password) return toast("Enter email and password");

  try {
    await auth.signInWithEmailAndPassword(email, password);
    toast("Signed in!");
  } catch (error) {
    toast("Sign in failed: " + error.message);
  }
}

async function signUpWithEmail() {
  const email = $("emailInput").value.trim();
  const password = $("passwordInput").value.trim();
  if (!email || !password) return toast("Enter email and password");

  try {
    await auth.createUserWithEmailAndPassword(email, password);
    toast("Account created!");
  } catch (error) {
    toast("Sign up failed: " + error.message);
  }
}

// ------------------------------------------------------
// MAIN
// ------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  autoHeight();
  setupUsername();
  setupGoogleLogin();
  await requestNotificationPermission();
  await loadUserStatuses();
  loadChannels();

  $("sendMessage").onclick = sendMessage;
  $("messageInput").addEventListener("keydown", e => e.key === "Enter" && sendMessage());
  $("emailSignInBtn").onclick = signInWithEmail;
  $("emailSignUpBtn").onclick = signUpWithEmail;
  $("createChannelBtn").onclick = createChannel;
  $("applyColors").onclick = applyCustomColors;
});
