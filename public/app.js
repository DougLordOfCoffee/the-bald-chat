// app.js — clean, single-copy
const firebaseConfig = {
  apiKey: "AIzaSyAANuaXF-zSqAs9kzIBnW3ROLDwxGXA1p8",
  authDomain: "the-bald-chat.firebaseapp.com",
  projectId: "the-bald-chat",
  storageBucket: "the-bald-chat.firebasestorage.app",
  messagingSenderId: "831148484483",
  appId: "1:831148484483:web:23747c98adcd6e989db8b6",
  databaseURL: "https://the-bald-chat-default-rtdb.firebaseio.com"
};

let database = null;

(function initFirebase(){
  try{
    if(!firebase.apps || !firebase.apps.length){
      firebase.initializeApp(firebaseConfig);
    }
    database = firebase.database();
    console.log('Firebase initialized');
  }catch(e){
    console.error('Firebase init error', e);
  }
})();

function getSavedUsername(){
  return localStorage.getItem('baldchat_username') || localStorage.getItem('username') || null;
}

/** Send message */
window.sendMessageToFirebase = async function({ username, text, ts } = {}){
  if(!database) throw new Error('Firebase not initialized');
  const u = (username || getSavedUsername() || 'Anonymous').trim();
  const t = (text || '').trim();
  if(!t) throw new Error('Message text required');

  const ref = database.ref('messages').push();
  const msg = { id: ref.key, username: u, text: t, timestamp: firebase.database.ServerValue.TIMESTAMP };
  await ref.set(msg);
  return { id: ref.key, username: u, text: t, ts: ts || Date.now() };
};

/** Listen for new/changed/removed and forward to UI callback */
window.initFirebaseListeners = function(onMessage){
  if(!database){ console.warn('firebase not ready'); return; }
  if(typeof onMessage !== 'function'){ console.warn('initFirebaseListeners needs a callback'); return; }

  const ref = database.ref('messages').limitToLast(500);
  ref.off();

  const seen = new Set();
  ref.on('child_added', (snap)=>{
    const v = snap.val(); if(!v) return;
    const id = snap.key;
    if(seen.has(id)) return;
    seen.add(id);
    onMessage({ id, username: v.username || 'Anonymous', text: v.text || '', timestamp: v.timestamp || Date.now() });
  });

  ref.on('child_removed', (snap)=>{
    const id = snap.key;
    if(window.removeMessageFromRemote) window.removeMessageFromRemote(id);
    else {
      const el = document.querySelector(`[data-id="${id}"], #${CSS.escape(id)}`);
      if(el) el.remove();
    }
  });

  ref.on('child_changed', (snap)=>{
    const v = snap.val(), id = snap.key;
    if(window.updateMessageFromRemote) window.updateMessageFromRemote({ id, username: v.username, text: v.text, timestamp: v.timestamp });
  });

  console.log('Firebase listeners attached');
};
