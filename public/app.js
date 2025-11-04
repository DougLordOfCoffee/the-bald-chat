// app.js (refactor)
// =====================
// Minimal external deps: firebase compat SDKs (same as yours).
// =====================

(() => {
  "use strict";

  // --- CONFIG ---
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

  // --- STATE ---
  let database = null;
  let auth = null;

  // DOM refs
  let usernameInput, messageInput, sendMessageBtn, messagesDiv, themeToggleBtn, googleBtn, toastEl;
  let channelsRef = null;
  let currentChannelId = localStorage.getItem("currentChannelId") || null;
  let currentChannelMessagesRef = null;

  let localUsername = localStorage.getItem("username") || null;
  let toastTimer = null;

  // --- UTIL ---
  const safeText = (t) => String(t == null ? "" : t);
  const escapeHtml = (s) => String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sanitizeId = (key) => "msg_" + String(key).replace(/[^a-zA-Z0-9\-_]/g, "_");
  const sanitizeChannelMessageId = (channelId, messageId) => sanitizeId((channelId || "chan") + "_" + (messageId || Date.now()));

  // --- FIREBASE INIT ---
  function initFirebase() {
    if (typeof firebase !== "object" || !firebase.initializeApp) {
      console.error("Firebase compat SDK not loaded.");
      return;
    }
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
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
    toastEl = document.getElementById("toast");

    if (toastEl) toastEl.setAttribute("aria-hidden", "true");
    if (usernameInput && localUsername) usernameInput.value = localUsername;
  }

  // --- APP HEIGHT (debounced) ---
  let resizeTimer = null;
  function setAppHeight() {
    const appEl = document.querySelector(".app");
    if (!appEl) return;
    const padTop = parseFloat(getComputedStyle(document.body).paddingTop) || 0;
    const padBottom = parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
    appEl.style.minHeight = `${window.innerHeight - padTop - padBottom}px`;
  }
  function scheduleSetAppHeight() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(setAppHeight, 60);
  }
  window.addEventListener("resize", scheduleSetAppHeight, { passive: true });
  window.addEventListener("orientationchange", scheduleSetAppHeight, { passive: true });

  // --- TOAST ---
  function showToast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add("show");
    toastEl.setAttribute("aria-hidden", "false");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove("show");
      toastEl.setAttribute("aria-hidden", "true");
    }, 1800);
  }

  // --- AUTH state & syncing UI ---
  // Consolidated auth handler to update UI and message actions
  function handleAuthState(user) {
    // Update google button label
    if (googleBtn) {
      if (user) {
        googleBtn.classList.add("signed-in");
        googleBtn.textContent = "Signed in";
      } else {
        googleBtn.classList.remove("signed-in");
        googleBtn.textContent = "Sign in with Google";
      }
    }

    // if signed in, prefer server username into local storage and input
    if (user && database) {
      database.ref(`users/${user.uid}/username`).once("value")
        .then(snap => {
          if (snap.exists()) {
            localUsername = snap.val();
            if (usernameInput) usernameInput.value = localUsername;
            localStorage.setItem("username", localUsername);
          } else if (localStorage.getItem("username")) {
            // keep whatever local name exists
            localUsername = localStorage.getItem("username");
            if (usernameInput) usernameInput.value = localUsername;
          }
        })
        .catch(()=>{});
    } else {
      // logged out: keep local name from localStorage. show it in input if available.
      localUsername = localStorage.getItem("username") || null;
      if (usernameInput) usernameInput.value = localUsername || "";
    }

    // update message action buttons (delete) visible state for already-rendered messages
    document.querySelectorAll(".message").forEach(m => {
      const btn = m.querySelector(".delete-btn");
      // If there is no delete button DOM, but we have owner, we might need to add it.
      const messageUid = m.dataset && m.dataset.uid ? m.dataset.uid : null;
      const currentUserId = user ? user.uid : null;
      if (btn) {
        // show/hide depending on ownership/admin
        if (currentUserId && (messageUid === currentUserId || currentUserId === ADMIN_UID)) {
          btn.style.display = "";
        } else {
          btn.style.display = "none";
        }
      }
    });
  }

  // --- USERNAME memory & saving (debounced save on blur/enter) ---
  function setupUsernameMemory() {
    if (!usernameInput || !database || !auth) return;
    const usersRef = database.ref("users");
    const usernamesRef = database.ref("usernames");

    const saveUsername = async () => {
      const user = auth.currentUser;
      const newName = usernameInput.value.trim();
      if (!newName) {
        showToast("Enter a name");
        return;
      }
      try {
        const ownerSnap = await usernamesRef.child(newName.toLowerCase()).once("value");
        const owner = ownerSnap.exists() ? ownerSnap.val() : null;
        if (owner && owner !== (user ? user.uid : null)) {
          showToast("Name already taken.");
          usernameInput.value = localUsername || "";
          return;
        }

        // remove previous mapping if we own it
        if (localUsername && user) {
          await usernamesRef.child(localUsername.toLowerCase()).remove().catch(()=>{});
        }

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

    // events
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

  // --- SENDING MESSAGES ---
  function writeNewMessage(username, text) {
    if (!database) return console.error("DB not initialized.");
    if (!currentChannelId) { showToast("No channel selected"); return; }
    const ref = database.ref(`messages/${currentChannelId}`);
    // use push() with value set
    ref.push({
      username,
      uid: auth && auth.currentUser ? auth.currentUser.uid : null,
      text,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    }).catch(err => console.error("Failed to write message", err));
  }

  function setupSendMessage() {
    if (!sendMessageBtn || !messageInput) return;

    const send = () => {
      const messageText = messageInput.value.trim();
      const usernameText = (usernameInput && usernameInput.value.trim()) || localUsername || "Anonymous";
      if (!messageText) return;
      writeNewMessage(usernameText, messageText);
      messageInput.value = "";
      messageInput.focus();
    };

    sendMessageBtn.addEventListener("click", send);
    messageInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); send(); } });
  }

  // --- MESSAGE RENDERING ---
  function clearMessagesView() {
    if (!messagesDiv) return;
    messagesDiv.innerHTML = '<div class="system">No messages yet — say something to start the conversation.</div>';
  }

  function _addOrUpdateMessageElement(message) {
    if (!messagesDiv) return;
    const domId = sanitizeChannelMessageId(message._channel || currentChannelId, message.id);
    let wrap = document.getElementById(domId);

    const currentUserId = auth && auth.currentUser ? auth.currentUser.uid : null;
    const isOwner = message.uid && currentUserId && message.uid === currentUserId;
    const isAdmin = message.uid && message.uid === ADMIN_UID;

    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = domId;
      wrap.className = "message";
      wrap.dataset.uid = message.uid || "";

      // mark mine by uid first; fallback to username comparison to avoid visual mismatch
      if (message.uid && currentUserId && message.uid === currentUserId) wrap.classList.add("mine");
      else if (localUsername && message.username === localUsername) wrap.classList.add("mine");

      // left content
      const left = document.createElement("div");
      left.className = "message-left";

      const uname = document.createElement("span");
      uname.className = "username";
      uname.textContent = (isAdmin ? `${safeText(message.username || "Anonymous")} ⭐` : safeText(message.username || "Anonymous"));

      const textEl = document.createElement("div");
      textEl.className = "message-text";
      textEl.textContent = safeText(message.text || "");

      const meta = document.createElement("span");
      meta.className = "meta";
      if (message.timestamp) meta.textContent = new Date(Number(message.timestamp)).toLocaleString();

      left.append(uname, textEl, meta);
      wrap.appendChild(left);

      // actions
      const actions = document.createElement("div");
      actions.className = "message-actions";

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "delete-btn";
      deleteBtn.innerHTML = "&times;";
      deleteBtn.title = "Delete message";
      // click handler: double-check ownership on server
      deleteBtn.addEventListener("click", async () => {
        if (!confirm("Delete this message?")) return;
        try {
          await database.ref(`messages/${message._channel}`).child(message.id).remove();
        } catch (err) {
          console.error("Delete failed", err);
          showToast("Failed to delete message");
        }
      });

      // Decide whether to show delete button now
      if (currentUserId && (message.uid === currentUserId || currentUserId === ADMIN_UID)) {
        actions.appendChild(deleteBtn);
      } else {
        // keep it but hidden so we can reveal later if the user logs in (avoid re-render of whole feed)
        deleteBtn.style.display = "none";
        actions.appendChild(deleteBtn);
      }

      wrap.appendChild(actions);
      messagesDiv.appendChild(wrap);
      // scroll to bottom for new messages
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    } else {
      // update existing
      const textEl = wrap.querySelector(".message-text");
      if (textEl) textEl.textContent = safeText(message.text || "");
      const meta = wrap.querySelector(".meta");
      if (meta && message.timestamp) meta.textContent = new Date(Number(message.timestamp)).toLocaleString();
    }
  }

  function displayMessageForChannel(message) {
    // small safety: ensure message has id
    if (!message || !message.id) return;
    _addOrUpdateMessageElement(message);
  }

  // --- CHANNELS ---
  async function initChannels() {
    if (!database) return;
    channelsRef = database.ref("channels");

    // Ensure default channel exists and get its key
    try {
      const snap = await channelsRef.orderByChild("name").equalTo(DEFAULT_CHANNEL_NAME).once("value");
      if (!snap.exists()) {
        // create default channel
        const chRef = channelsRef.push();
        await chRef.set({
          name: DEFAULT_CHANNEL_NAME,
          createdBy: auth && auth.currentUser ? auth.currentUser.uid : "system",
          timestamp: Date.now()
        });
        currentChannelId = chRef.key;
        localStorage.setItem("currentChannelId", currentChannelId);
      }
    } catch (err) {
      console.warn("Default channel check failed:", err);
    }

    // Attach listeners
    channelsRef.orderByChild("timestamp").on("child_added", (snap) => {
      const ch = snap.val();
      ch.id = snap.key;
      renderChannelItem(ch);
      // If no channel selected yet, try to pick either saved or the first one
      if (!currentChannelId) {
        const saved = localStorage.getItem("currentChannelId");
        selectChannel(saved || ch.id);
      }
    });

    channelsRef.on("child_changed", (snap) => updateChannelItem({ ...snap.val(), id: snap.key }));
    channelsRef.on("child_removed", (snap) => {
      const el = document.querySelector(`[data-channel-id="${snap.key}"]`);
      if (el) el.remove();
      if (currentChannelId === snap.key) {
        currentChannelId = null;
        localStorage.removeItem("currentChannelId");
        clearMessagesView();
      }
    });

    // after listeners attached -> if we have a saved channel, select it (defensive)
    const tryChannel = localStorage.getItem("currentChannelId") || currentChannelId;
    if (tryChannel) {
      // slight delay to let child_added items render
      setTimeout(() => selectChannel(tryChannel), 80);
    }
  }

  function renderChannelItem(ch) {
    const list = document.getElementById("channelList");
    if (!list || document.querySelector(`[data-channel-id="${ch.id}"]`)) return;

    const item = document.createElement("div");
    item.className = "channel-item";
    item.setAttribute("data-channel-id", ch.id);
    item.tabIndex = 0;

    const nameSpan = document.createElement("span");
    nameSpan.innerHTML = `# ${escapeHtml(ch.name)}`;
    const metaSpan = document.createElement("span");
    metaSpan.className = "meta";
    metaSpan.textContent = ch.memberCount || "";

    item.appendChild(nameSpan);
    item.appendChild(metaSpan);

    item.addEventListener("click", () => selectChannel(ch.id));
    item.addEventListener("keydown", (e) => { if (e.key === "Enter") selectChannel(ch.id); });

    // prepend so newest is at top (matches original intent)
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
    currentChannelId = channelId;
    localStorage.setItem("currentChannelId", channelId);
    document.querySelectorAll(".channel-item").forEach(i => i.classList.toggle("active", i.getAttribute("data-channel-id") === channelId));
    if (currentChannelMessagesRef) currentChannelMessagesRef.off();
    listenForChannelMessages(channelId);
    clearMessagesView();
  }

  function listenForChannelMessages(channelId) {
    if (!database || !channelId) return;
    currentChannelMessagesRef = database.ref(`messages/${channelId}`).orderByChild('timestamp').limitToLast(MAX_MESSAGES);

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

  // --- GOOGLE LOGIN ---
  function setupGoogleLogin() {
    if (!googleBtn || !auth) return;
    googleBtn.addEventListener("click", async () => {
      const provider = new firebase.auth.GoogleAuthProvider();
      try {
        await auth.signInWithPopup(provider);
      } catch (err) {
        if (err.code !== "auth/popup-closed-by-user") showToast("Sign-in canceled.");
      }
    });
  }

  // --- THEME TOGGLE ---
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

  // --- CHANNEL CREATION ---
  function setupChannelCreation() {
    const createBtn = document.getElementById("createChannelBtn");
    const input = document.getElementById("newChannelName");
    if (!createBtn || !input || !channelsRef) return;

    const create = async () => {
      const name = (input.value || "").trim();
      if (!name) return showToast("Enter a channel name");

      try {
        // store name case-sensitively but check lower-case uniqueness
        const existing = await channelsRef.orderByChild("name").equalTo(name).once("value");
        if (existing.exists()) return showToast("Channel name already exists");

        const newRef = channelsRef.push();
        await newRef.set({ name, createdBy: auth?.currentUser?.uid || "anon", timestamp: Date.now() });
        input.value = "";
        selectChannel(newRef.key);
      } catch (err) {
        console.error(err);
        showToast("Failed to create channel");
      }
    };

document.getElementById("toggleSidebar").addEventListener("click", () => {
  document.querySelector(".side").classList.toggle("collapsed");
});

  // --- STARTUP ---
  function main() {
    initFirebase();
    getDOMElements();
    scheduleSetAppHeight();
    setupThemeToggle();

    // require firebase before continuing
    if (!database || !auth) {
      console.error("Firebase not available - aborting further init.");
      return;
    }

    // auth listener (single consolidated)
    auth.onAuthStateChanged(user => {
      handleAuthState(user);
    });

    setupUsernameMemory();
    setupSendMessage();
    setupGoogleLogin();
    initChannels();
    setupChannelCreation();
  }

  document.getElementById("toggleSidebar").addEventListener("click", () => {
  document.querySelector(".side").classList.toggle("collapsed");
});


  document.addEventListener("DOMContentLoaded", main);
})();
