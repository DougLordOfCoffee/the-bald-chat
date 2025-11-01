// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyAANuaXF-zSqAs9kzIBnW3ROLDwxGXA1p8",
  authDomain: "the-bald-chat.firebaseapp.com",
  projectId: "the-bald-chat",
  storageBucket: "the-bald-chat.appspot.com",
  messagingSenderId: "831148484483",
  appId: "1:831148484483:web:23747c98adcd6e989db8b6",
  databaseURL: "https://the-bald-chat-default-rtdb.firebaseio.com"
}
const ADMIN_UID = "shELHHG7NJPJqQ0aRb7NR3sPhpJ3"; // MY ID and admin user. so me. HAHA. yeah fuck you cunt.
// --- Global refs ---
let database;
let usernameInput, messageInput, sendMessageBtn, messagesDiv, themeToggleBtn;
let localUsername = null;
let toastTimer = null;


// --- Helpers ---
function sanitizeId(key) {
  // make a safe DOM id, prefix with "msg_" so it never starts with a digit
  return 'msg_' + String(key).replace(/[^a-zA-Z0-9\-_:.]/g, '_');
}

function safeText(t) {
  return String(t == null ? '' : t);
}

function isFirebaseCompatLoaded() {
  return typeof window.firebase === 'object' && typeof window.firebase.initializeApp === 'function';
}

// --- Firebase init ---
function initFirebase() {
  if (!isFirebaseCompatLoaded()) {
    console.error('Firebase compat SDK not loaded (expected firebase global).');
    return;
  }
  if (!firebase.apps || !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  if (!firebase.database) {
    console.error('Firebase database not available on compat bundle.');
    return;
  }
  database = firebase.database();
  const storage = firebase.storage();
}

// --- DOM refs ---
function getDOMElements() {
  usernameInput = document.getElementById('usernameInput');
  messageInput = document.getElementById('messageInput');
  sendMessageBtn = document.getElementById('sendMessage');
  messagesDiv = document.getElementById('messages');
  themeToggleBtn = document.getElementById('themeToggle');

  // Ensure toast is initially hidden to screen readers
  const toast = document.getElementById('toast');
  if (toast) toast.setAttribute('aria-hidden', 'true');
}

// --- App height (simple, accounts for body padding) ---
function setAppHeight() {
  const appEl = document.querySelector('.app');
  const bodyStyles = getComputedStyle(document.body);
  const padTop = parseFloat(bodyStyles.paddingTop) || 0;
  const padBottom = parseFloat(bodyStyles.paddingBottom) || 0;
  if (appEl) {
    appEl.style.minHeight = `${window.innerHeight - padTop - padBottom}px`;
  }
}
window.addEventListener('resize', setAppHeight);
window.addEventListener('orientationchange', setAppHeight);

function setupUsernameMemory() {
  if (!usernameInput) return;

  const auth = firebase.auth();
  const usersRef = database.ref('users');
  const usernamesRef = database.ref('usernames');

  firebase.auth().onAuthStateChanged(async (user) => {
    if (!user) return; // Not signed in -> skip username enforcement

    const uid = user.uid;

    // Load username from DB
    const snap = await usersRef.child(uid).child('username').get();
    if (snap.exists()) {
      localUsername = snap.val();
      usernameInput.value = localUsername;
      localStorage.setItem('username', localUsername);
    }
  });

  // --- Username memory + handlers ---
  async function saveUsername() {
    const user = auth.currentUser;
    const newName = usernameInput.value.trim();

    if (!newName) return;

    // Lowercase to avoid case-duplication issues
    const key = newName.toLowerCase();

    const usernameOwner = await usernamesRef.child(key).get();

    if (usernameOwner.exists() && usernameOwner.val() !== auth.currentUser.uid) {
      showToast('Name already taken.');
      usernameInput.value = localUsername || '';
      return;
    }

    // If user had old username, free it
    if (localUsername) {
      await usernamesRef.child(localUsername.toLowerCase()).remove();
    }

    // Save new username
    await usernamesRef.child(key).set(auth.currentUser.uid);
    await database.ref('users').child(auth.currentUser.uid).child('username').set(newName);

    localUsername = newName;
    localStorage.setItem('username', newName);
    showToast('Username updated!');
  }

  usernameInput.addEventListener('blur', saveUsername);
  usernameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveUsername();
      if (messageInput) messageInput.focus();
    }
  });

  usernameInput.addEventListener('input', () => {
    localUsername = usernameInput.value.trim() || null;
  });
}

// --- Write message to DB ---
function writeNewMessage(username, text) {
  if (!database) return console.error('Database not initialized.');
  const newMessageRef = database.ref('messages').push();
  newMessageRef.set({
    username: username,
    uid: firebase.auth().currentUser?.uid || null,
    text: text,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  }).catch(err => console.error('Write failed', err));
}

// --- Write New Image to DB ---
function writeNewMessageImage(username, imageURL) {
  const newMessageRef = database.ref('messages').push();
  newMessageRef.set({
    username: username,
    imageURL: imageURL,
    timestamp: firebase.database.ServerValue.TIMESTAMP,
    uid: firebase.auth().currentUser?.uid || null
  });
}


// --- Display one message (uses classes; minimal inline styles) ---
function displayMessage(message) {
  if (!messagesDiv) return;

  // remove the "system" placeholder if present
  const systemEl = messagesDiv.querySelector('.system');
  if (systemEl) systemEl.remove();

  // sanitize and compute element id
  const domId = sanitizeId(message.id || (Date.now().toString()));
  // if element already exists (re-emit), skip
  if (document.getElementById(domId)) return;

  const wrap = document.createElement('div');
  wrap.id = domId;
  wrap.classList.add('message');
  if ((message.username || '') === (localUsername || '')) wrap.classList.add('mine');
  wrap.setAttribute('role', 'article');

  // left column (username + text + meta)
  const left = document.createElement('div');
  left.className = 'message-left';

  const uname = document.createElement('span');
  uname.className = 'username';
  if (message.uid === ADMIN_UID) {
   u name.textContent = safeText(message.username) + " ⭐";
  } else {
   uname.textContent = safeText(message.username || 'Anonymous');
  }


  const textEl = document.createElement('div');
  textEl.className = 'message-text';
  if (message.imageURL) {
  const img = document.createElement('img');
  img.src = message.imageURL;
  img.alt = "Image";
  img.style.maxWidth = "280px";
  img.style.borderRadius = "10px";
  img.style.cursor = "pointer";
  img.onclick = () => window.open(message.imageURL, "_blank");
  left.appendChild(img);
} else {
  textEl.textContent = safeText(message.text || '');
  left.appendChild(textEl);
}


  const meta = document.createElement('span');
  meta.className = 'meta';
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

  // actions (delete etc)
  const actions = document.createElement('div');
  actions.className = 'message-actions';

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-message-btn';
  deleteBtn.type = 'button';
  deleteBtn.title = 'Delete message';
  deleteBtn.setAttribute('aria-label', 'Delete message');
  deleteBtn.innerHTML = "&times;";
  deleteBtn.style.color = "var(--muted)";
  deleteBtn.style.fontSize = "18px";
  deleteBtn.style.padding = "0 6px";
  deleteBtn.style.transition = "color 0.2s";
  deleteBtn.onmouseenter = () => deleteBtn.style.color = "var(--accent2)";
  deleteBtn.onmouseleave = () => deleteBtn.style.color = "var(--muted)";

  deleteBtn.className = "delete-btn";
  deleteBtn.addEventListener('click', () => {
    if (!database) return;
    if (confirm('Delete this message?')) {
      database.ref('messages').child(message.id).remove().catch(err => console.error('Delete failed', err));
    }
  });

if (message.uid === firebase.auth().currentUser.uid || firebase.auth().currentUser.uid === ADMIN_UID) {
  actions.appendChild(deleteBtn);
}


  wrap.appendChild(left);
  wrap.appendChild(actions);

  // Auto-scroll behavior: only scroll if user is near bottom
  const wasNearBottom = (messagesDiv.scrollHeight - messagesDiv.scrollTop - messagesDiv.clientHeight) < 80;
  messagesDiv.appendChild(wrap);
  if (wasNearBottom) {
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }
}

// --- Event listeners (send / enter / theme) ---
function setupEventListeners() {
  if (sendMessageBtn && messageInput) {
    sendMessageBtn.addEventListener('click', () => {
      const messageText = messageInput.value.trim();
      const usernameText = (usernameInput && usernameInput.value.trim()) || 'Anonymous';
      // ensure localUsername reflects current input (helps mine highlighting)
      localUsername = (usernameInput && usernameInput.value.trim()) || localUsername;
      if (messageText) {
        writeNewMessage(usernameText, messageText);
        messageInput.value = '';
        messageInput.focus();
      }
    });
  const googleBtn = document.getElementById('googleBtn');
if (googleBtn) {
  googleBtn.addEventListener('click', async () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
      await firebase.auth().signInWithPopup(provider);
    } catch (err) {
      console.error("Google Sign-in failed:", err);
    }
  });
}

  }

  if (messageInput) {
    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendMessageBtn && sendMessageBtn.click();
      }
    });
  }

  if (themeToggleBtn) {
    // restore theme
    const savedTheme = localStorage.getItem('theme'); // 'light' or 'dark'
    if (savedTheme === 'light') document.body.classList.add('light');

    const updateThemeButton = () => {
      const isLight = document.body.classList.contains('light');
      themeToggleBtn.setAttribute('aria-pressed', String(isLight));
    };
    updateThemeButton();

    themeToggleBtn.addEventListener('click', () => {
      const willBeLight = !document.body.classList.toggle('light');
      // toggle returns false when class removed; we want to store actual state:
      const isNowLight = document.body.classList.contains('light');
      localStorage.setItem('theme', isNowLight ? 'light' : 'dark');
      updateThemeButton();
      showToast(isNowLight ? 'Light theme enabled' : 'Dark theme enabled');
    });
  }

    const uploadBtn = document.getElementById('uploadImageBtn');
    const fileInput = document.getElementById('imageUpload');

  uploadBtn.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;

    const user = firebase.auth().currentUser;
    const usernameText = (localUsername || 'Anonymous');
    const timestamp = Date.now();

    // Where to store image:
    const storageRef = storage.ref(`images/${user ? user.uid : 'anon'}/${timestamp}_${file.name}`);

    try {
      await storageRef.put(file);
     const url = await storageRef.getDownloadURL();

      writeNewMessageImage(usernameText, url);
      showToast("Image Sent");

    } catch (err) {
     console.error("Image upload failed:", err);
     showToast("Upload failed");
    }

    fileInput.value = "";
  });

}

// --- Listen for messages (Firebase Realtime DB) ---
function listenForMessages() {
  if (!database) return console.warn('No database to listen to yet.');
  const ref = database.ref('messages').orderByChild('timestamp').limitToLast(500);
  ref.on('child_added', (snapshot) => {
    const obj = snapshot.val() || {};
    obj.id = snapshot.key;
    displayMessage(obj);
  });

  ref.on('child_removed', (snapshot) => {
    const removedId = sanitizeId(snapshot.key);
    const element = document.getElementById(removedId);
    if (element) element.remove();
  });
}

// --- Toast helper (manages aria-hidden) ---
function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  toast.setAttribute('aria-hidden', 'false');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    toast.setAttribute('aria-hidden', 'true');
  }, 1800);
}

function setupGoogleLogin() {
  const googleBtn = document.getElementById('googleBtn');
  if (!googleBtn) return;

  googleBtn.addEventListener('click', async () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
      const result = await firebase.auth().signInWithPopup(provider);
      const user = result.user;

      if (user) {
        // If user has logged in before, restore their saved username
        const userRef = firebase.database().ref(`users/${user.uid}/username`);
        userRef.once("value", snap => {
          if (snap.exists()) {
            // Load their stored username
            localUsername = snap.val();
            localStorage.setItem('username', localUsername);
            usernameInput.value = localUsername;
            showToast(`Welcome back ${localUsername}`);
          } else {
            // If first time, use whatever username is currently typed
            localUsername = usernameInput.value || "Anonymous";
            localStorage.setItem('username', localUsername);
            userRef.set(localUsername);
            showToast(`Signed in as ${localUsername}`);
          }
        });
      }
    } catch (err) {
      console.error("Google Sign-in failed:", err);
      showToast("Sign-in canceled.");
    }
  });
}



// --- Main entrypoint ---
function main() {
  initFirebase();

  let auth; // global

function initAuth() {
  auth = firebase.auth();
  firebase.auth().onAuthStateChanged(user => {
    const googleBtn = document.getElementById('googleBtn');

    if (user) {
      // Logged in
      googleBtn.classList.add('signed-in');
      googleBtn.textContent = `Signed in as ${user.displayName}`;
      localStorage.setItem('username', user.displayName); // match username to Google name
      usernameInput.value = user.displayName;
      localUsername = user.displayName;
    } else {
      // Logged out
      googleBtn.classList.remove('signed-in');
      googleBtn.textContent = `Sign in with Google`;
    }
  });
}
  initAuth();
  getDOMElements();
  setAppHeight();
  setupUsernameMemory();
  setupGoogleLogin();
  setupEventListeners();
  listenForMessages();
}

document.addEventListener('DOMContentLoaded', main);
