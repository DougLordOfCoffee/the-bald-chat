// app.js (refactor fixed)

(() => {
  "use strict";

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
  const DEFAULT_CHANNEL_NAME = "general";
  const MAX_MESSAGES = 500;

  let database = null;
  let auth = null;

  let usernameInput, messageInput, sendMessageBtn, messagesDiv, themeToggleBtn, googleBtn, toastEl;
  let channelsRef = null;
  let currentChannelId = localStorage.getItem("currentChannelId") || null;
  let currentChannelMessagesRef = null;
  let localUsername = localStorage.getItem("username") || null;
  let toastTimer = null;
  let signInInProgress = false;


  const safeText = (t) => String(t == null ? "" : t);
  const escapeHtml = (s) => String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sanitizeId = (key) => "msg_" + String(key).replace(/[^a-zA-Z0-9\-_]/g, "_");
  const sanitizeChannelMessageId = (channelId, messageId) => sanitizeId((channelId || "chan") + "_" + (messageId || Date.now()));

  function initFirebase() {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    database = firebase.database();
    auth = firebase.auth();
  }

  function getDOMElements() {
    usernameInput = document.getElementById("usernameInput");
    messageInput = document.getElementById("messageInput");
    sendMessageBtn = document.getElementById("sendMessage");
    messagesDiv = document.getElementById("messages");
    themeToggleBtn = document.getElementById("themeToggle");
    googleBtn = document.getElementById("googleBtn");
    toastEl = document.getElementById("toast");
    if (usernameInput && localUsername) usernameInput.value = localUsername;
  }

  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1800);
  }

  function handleAuthState(user) {
    document.querySelectorAll(".message").forEach(m => {
      const btn = m.querySelector(".delete-btn");
      const owner = m.dataset.uid;
      if (!btn) return;
      if (user && (owner === user.uid || user.uid === ADMIN_UID)) btn.style.display = "";
      else btn.style.display = "none";
    });
  }

  function setupUsernameMemory() {
    if (!usernameInput || !database || !auth) return;
    const usernamesRef = database.ref("usernames");
    const usersRef = database.ref("users");

    const save = async () => {
      const newName = usernameInput.value.trim();
      if (!newName) return;
      const user = auth.currentUser;
      const snap = await usernamesRef.child(newName.toLowerCase()).once("value");
      const takenBy = snap.exists() ? snap.val() : null;

      if (takenBy && takenBy !== (user?.uid || null)) {
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
      showToast("Username updated.");
    };

    usernameInput.addEventListener("blur", save);
    usernameInput.addEventListener("keydown", e => { if (e.key === "Enter") save(); });
  }

  function writeNewMessage(username, text) {
    if (!currentChannelId) return;
    database.ref(`messages/${currentChannelId}`).push({
      username,
      uid: auth?.currentUser?.uid || null,
      text,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });
  }

  function setupSendMessage() {
    const send = () => {
      const text = messageInput.value.trim();
      const user = (usernameInput.value.trim()) || localUsername || "Anonymous";
      if (!text) return;
      writeNewMessage(user, text);
      messageInput.value = "";
    };
    sendMessageBtn.addEventListener("click", send);
    messageInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); send(); }});
  }

  function clearMessagesView() {
    messagesDiv.innerHTML = '<div class="system">No messages yet...</div>';
  }

  function displayMessageForChannel(msg) {
    const id = sanitizeChannelMessageId(msg._channel, msg.id);
    let wrap = document.getElementById(id);
    const mine = auth?.currentUser?.uid === msg.uid;

    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = id;
      wrap.className = "message" + (mine ? " mine" : "");
      wrap.dataset.uid = msg.uid || "";

      wrap.innerHTML = `
        <div class="username">${escapeHtml(msg.username || "Anonymous")}</div>
        <div class="message-text">${escapeHtml(msg.text || "")}</div>
      `;
      messagesDiv.appendChild(wrap);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
  }

  function selectChannel(channelId) {
    currentChannelId = channelId;
    localStorage.setItem("currentChannelId", channelId);
    if (currentChannelMessagesRef) currentChannelMessagesRef.off();
    clearMessagesView();
    currentChannelMessagesRef = database.ref(`messages/${channelId}`).orderByChild('timestamp').limitToLast(MAX_MESSAGES);
    currentChannelMessagesRef.on("child_added", snap => displayMessageForChannel({ ...snap.val(), id: snap.key, _channel: channelId }));
  }

  async function initChannels() {
    channelsRef = database.ref("channels");
    let defaultSnap = await channelsRef.orderByChild("name").equalTo(DEFAULT_CHANNEL_NAME).once("value");
    if (!defaultSnap.exists()) {
      const newRef = channelsRef.push();
      await newRef.set({ name: DEFAULT_CHANNEL_NAME, timestamp: Date.now() });
      currentChannelId = newRef.key;
      localStorage.setItem("currentChannelId", currentChannelId);
    }
    selectChannel(currentChannelId);
  }

  function setupGoogleLogin() {
  googleBtn.addEventListener("click", async () => {
    if (signInInProgress) return;
    signInInProgress = true;
  
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
      await auth.signInWithPopup(provider);
    } catch (err) {
      if (err.code !== "auth/popup-closed-by-user") showToast("Sign-in failed");
    } finally {
      signInInProgress = false;
    }
  });


  function setupThemeToggle() {
    themeToggleBtn.addEventListener("click", () => {
      document.body.classList.toggle("light");
      localStorage.setItem("theme", document.body.classList.contains("light") ? "light" : "dark");
    });
  }

  function setupChannelCreation() {
    const createBtn = document.getElementById("createChannelBtn");
    const input = document.getElementById("newChannelName");
    if (!createBtn || !input) return;
    createBtn.addEventListener("click", async () => {
      const name = input.value.trim();
      if (!name) return;
      const newRef = channelsRef.push();
      await newRef.set({ name, timestamp: Date.now() });
      input.value = "";
    });
  }

  function setupSidebarToggle() {
    const btn = document.getElementById("toggleSidebar");
    const side = document.querySelector(".side");
    if (!btn || !side) return;
    btn.addEventListener("click", () => side.classList.toggle("collapsed"));
  }

  function main() {
    initFirebase();
    getDOMElements();
    setupThemeToggle();
    setupSidebarToggle();
    auth.onAuthStateChanged(handleAuthState);
    setupUsernameMemory();
    setupSendMessage();
    setupGoogleLogin();
    initChannels();
    setupChannelCreation();
  }

  main();
})();
// app.js (refactor fixed)

(() => {
  "use strict";

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
  const DEFAULT_CHANNEL_NAME = "general";
  const MAX_MESSAGES = 500;

  let database = null;
  let auth = null;

  let usernameInput, messageInput, sendMessageBtn, messagesDiv, themeToggleBtn, googleBtn, toastEl;
  let channelsRef = null;
  let currentChannelId = localStorage.getItem("currentChannelId") || null;
  let currentChannelMessagesRef = null;
  let localUsername = localStorage.getItem("username") || null;
  let toastTimer = null;

  const safeText = (t) => String(t == null ? "" : t);
  const escapeHtml = (s) => String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sanitizeId = (key) => "msg_" + String(key).replace(/[^a-zA-Z0-9\-_]/g, "_");
  const sanitizeChannelMessageId = (channelId, messageId) => sanitizeId((channelId || "chan") + "_" + (messageId || Date.now()));

  function initFirebase() {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    database = firebase.database();
    auth = firebase.auth();
  }

  function getDOMElements() {
    usernameInput = document.getElementById("usernameInput");
    messageInput = document.getElementById("messageInput");
    sendMessageBtn = document.getElementById("sendMessage");
    messagesDiv = document.getElementById("messages");
    themeToggleBtn = document.getElementById("themeToggle");
    googleBtn = document.getElementById("googleBtn");
    toastEl = document.getElementById("toast");
    if (usernameInput && localUsername) usernameInput.value = localUsername;
  }

  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1800);
  }

  function handleAuthState(user) {
    document.querySelectorAll(".message").forEach(m => {
      const btn = m.querySelector(".delete-btn");
      const owner = m.dataset.uid;
      if (!btn) return;
      if (user && (owner === user.uid || user.uid === ADMIN_UID)) btn.style.display = "";
      else btn.style.display = "none";
    });
  }

  function setupUsernameMemory() {
    if (!usernameInput || !database || !auth) return;
    const usernamesRef = database.ref("usernames");
    const usersRef = database.ref("users");

    const save = async () => {
      const newName = usernameInput.value.trim();
      if (!newName) return;
      const user = auth.currentUser;
      const snap = await usernamesRef.child(newName.toLowerCase()).once("value");
      const takenBy = snap.exists() ? snap.val() : null;

      if (takenBy && takenBy !== (user?.uid || null)) {
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
      showToast("Username updated.");
    };

    usernameInput.addEventListener("blur", save);
    usernameInput.addEventListener("keydown", e => { if (e.key === "Enter") save(); });
  }

  function writeNewMessage(username, text) {
    if (!currentChannelId) return;
    database.ref(`messages/${currentChannelId}`).push({
      username,
      uid: auth?.currentUser?.uid || null,
      text,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });
  }

  function setupSendMessage() {
    const send = () => {
      const text = messageInput.value.trim();
      const user = (usernameInput.value.trim()) || localUsername || "Anonymous";
      if (!text) return;
      writeNewMessage(user, text);
      messageInput.value = "";
    };
    sendMessageBtn.addEventListener("click", send);
    messageInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); send(); }});
  }

  function clearMessagesView() {
    messagesDiv.innerHTML = '<div class="system">No messages yet...</div>';
  }

  function displayMessageForChannel(msg) {
    const id = sanitizeChannelMessageId(msg._channel, msg.id);
    let wrap = document.getElementById(id);
    const mine = auth?.currentUser?.uid === msg.uid;

    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = id;
      wrap.className = "message" + (mine ? " mine" : "");
      wrap.dataset.uid = msg.uid || "";

      wrap.innerHTML = `
        <div class="username">${escapeHtml(msg.username || "Anonymous")}</div>
        <div class="message-text">${escapeHtml(msg.text || "")}</div>
      `;
      messagesDiv.appendChild(wrap);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
  }

  function selectChannel(channelId) {
    currentChannelId = channelId;
    localStorage.setItem("currentChannelId", channelId);
    if (currentChannelMessagesRef) currentChannelMessagesRef.off();
    clearMessagesView();
    currentChannelMessagesRef = database.ref(`messages/${channelId}`).orderByChild('timestamp').limitToLast(MAX_MESSAGES);
    currentChannelMessagesRef.on("child_added", snap => displayMessageForChannel({ ...snap.val(), id: snap.key, _channel: channelId }));
  }

  async function initChannels() {
    channelsRef = database.ref("channels");
    let defaultSnap = await channelsRef.orderByChild("name").equalTo(DEFAULT_CHANNEL_NAME).once("value");
    if (!defaultSnap.exists()) {
      const newRef = channelsRef.push();
      await newRef.set({ name: DEFAULT_CHANNEL_NAME, timestamp: Date.now() });
      currentChannelId = newRef.key;
      localStorage.setItem("currentChannelId", currentChannelId);
    }
    selectChannel(currentChannelId);
  }

  function setupGoogleLogin() {
    googleBtn.addEventListener("click", async () => {
      const provider = new firebase.auth.GoogleAuthProvider();
      try { await auth.signInWithPopup(provider); } catch (_) {}
    });
  }

  function setupThemeToggle() {
    themeToggleBtn.addEventListener("click", () => {
      document.body.classList.toggle("light");
      localStorage.setItem("theme", document.body.classList.contains("light") ? "light" : "dark");
    });
  }

  function setupChannelCreation() {
    const createBtn = document.getElementById("createChannelBtn");
    const input = document.getElementById("newChannelName");
    if (!createBtn || !input) return;
    createBtn.addEventListener("click", async () => {
      const name = input.value.trim();
      if (!name) return;
      const newRef = channelsRef.push();
      await newRef.set({ name, timestamp: Date.now() });
      input.value = "";
    });
  }

  function setupSidebarToggle() {
    const btn = document.getElementById("toggleSidebar");
    const side = document.querySelector(".side");
    if (!btn || !side) return;
    btn.addEventListener("click", () => side.classList.toggle("collapsed"));
  }

  function main() {
    initFirebase();
    getDOMElements();
    setupThemeToggle();
    setupSidebarToggle();
    auth.onAuthStateChanged(handleAuthState);
    setupUsernameMemory();
    setupSendMessage();
    setupGoogleLogin();
    initChannels();
    setupChannelCreation();
  }

  main();
})();
