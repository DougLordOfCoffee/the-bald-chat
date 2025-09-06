// app.js — improved / integrated version
// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyAANuaXF-zSqAs9kzIBnW3ROLDwxGXA1p8",
  authDomain: "the-bald-chat.firebaseapp.com",
  projectId: "the-bald-chat",
  storageBucket: "the-bald-chat.firebasestorage.app",
  messagingSenderId: "831148484483",
  appId: "1:831148484483:web:23747c98adcd6e989db8b6",
  databaseURL: "https://the-bald-chat-default-rtdb.firebaseio.com"
};

/* ========= Initialization ========= */
let database = null;

function initFirebase() {
  try {
    if (!firebase.apps || !firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    database = firebase.database();
    console.log('Firebase initialized');
  } catch (err) {
    console.error('Firebase init error', err);
  }
}
// initialize immediately
initFirebase();

/* ========= Utilities ========= */
function getSavedUsername() {
  // New UI uses 'baldchat_username', older code used 'username'
  return localStorage.getItem('baldchat_username') || localStorage.getItem('username') || null;
}

function showToast(msg, ms = 2000) {
  const t = document.getElementById('toast');
  if (!t) {
    console.log('Toast:', msg);
    return;
  }
  t.textContent = msg;
  t.style.opacity = 1;
  t.style.transform = 'translateY(0)';
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    t.style.opacity = 0;
    t.style.transform = 'translateY(8px)';
  }, ms);
}

/* ========= Public API for UI ========= */

/**
 * Send a message to Firebase realtime DB.
 * payload: { username, text, ts? }
 * Returns a Promise that resolves to the saved message object { id, username, text, ts }
 */
window.sendMessageToFirebase = async function(payload = {}) {
  if (!database) {
    throw new Error('Firebase not initialized');
  }
  const username = (payload.username || getSavedUsername() || 'Anonymous').trim();
  const text = (payload.text || '').trim();
  if (!text) {
    throw new Error('Message text required');
  }

  const ref = database.ref('messages').push();
  const msg = {
    id: ref.key,
    username,
    text,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  };

  await ref.set(msg);
  return { id: ref.key, username, text, ts: Date.now() };
};

/**
 * Initialize listeners and forward incoming messages to the provided callback.
 * onMessage(msg) will be called for each child_added. msg will have { id, username, text, timestamp }.
 */
window.initFirebaseListeners = function(onMessage) {
  if (!database) {
    console.warn('initFirebaseListeners: firebase not initialized yet, attempting init');
    initFirebase();
  }
  if (!onMessage || typeof onMessage !== 'function') {
    console.warn('initFirebaseListeners expects a callback function.');
    return;
  }

  const ref = database.ref('messages').limitToLast(500);

  // Avoid attaching multiple identical listeners
  ref.off();

  // track seen keys in this session to avoid double-calls
  const seen = new Set();

  ref.on('child_added', (snap) => {
    const val = snap.val();
    if (!val) return;
    const id = snap.key;

    if (seen.has(id)) return;
    seen.add(id);

    // normalize shape for UI
    const msg = {
      id,
      username: val.username || 'Anonymous',
      text: val.text || '',
      timestamp: val.timestamp || Date.now()
    };

    try { onMessage(msg); } catch (err) { console.error('onMessage callback error', err); }
  });

  // child_removed: notify UI to remove element with that id (UI should handle removing)
  ref.on('child_removed', (snap) => {
    const id = snap.key;
    // expose a simple hook: if the UI defines window.removeMessageFromRemote, call it
    if (window.removeMessageFromRemote && typeof window.removeMessageFromRemote === 'function') {
      window.removeMessageFromRemote(id);
    } else {
      // fallback: remove element by id if it exists
      const el = document.querySelector(`[data-id="${id}"], #${CSS.escape(id)}`);
      if (el) el.remove();
    }
  });

  // child_changed: forward edits
  ref.on('child_changed', (snap) => {
    const val = snap.val();
    const id = snap.key;
    if (window.updateMessageFromRemote && typeof window.updateMessageFromRemote === 'function') {
      const msg = { id, username: val.username, text: val.text, timestamp: val.timestamp };
      window.updateMessageFromRemote(msg);
    }
  });

  console.log('Firebase listeners attached');
};

/**
 * Delete a message by id.
 * This will attempt to remove /messages/<id>. Firebase rules must allow it.
 * Deletion is *re
