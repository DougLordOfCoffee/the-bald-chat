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

// --- Main entrypoint ---
function main() {
  initFirebase();
  getDOMElements();    // must run before auth UI updates
  setAppHeight();
  setupEventListeners();
  setupUsernameMemory();
  setupGoogleLogin();
  listenForMessages();
}

document.addEventListener("DOMContentLoaded", main);