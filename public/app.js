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

// --- Global Firebase and DOM References ---
let database;
let usernameInput, messageInput, sendMessageBtn, messagesDiv;

// --- Core Functions ---
function initFirebase() {
  firebase.initializeApp(firebaseConfig);
  database = firebase.database();
}

function getDOMElements() {
  usernameInput = document.getElementById('usernameInput');
  messageInput = document.getElementById('messageInput');
  sendMessageBtn = document.getElementById('sendMessage');
  messagesDiv = document.getElementById('messages');
}

// --- Username memory with toast ---
function setupUsernameMemory() {
  const savedUsername = localStorage.getItem('username');
  if (savedUsername) usernameInput.value = savedUsername;

  // Save on blur OR Enter key
  usernameInput.addEventListener('blur', saveUsername);
  usernameInput.addEventListener('keypress', (e) => {
    if (e.key === "Enter") saveUsername();
  });

  function saveUsername() {
    const val = usernameInput.value.trim();
    if (val) {
      localStorage.setItem('username', val);
      showToast("Username saved!");
    }
  }
}


// --- Write a new message ---
function writeNewMessage(username, text) {
  const newMessageRef = database.ref('messages').push();
  newMessageRef.set({
    username: username,
    text: text,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  });
}

// --- Display a message ---
function displayMessage(message) {
  const messageElement = document.createElement('div');
  messageElement.id = message.id;
  messageElement.style.display = "flex";
  messageElement.style.justifyContent = "space-between";
  messageElement.style.alignItems = "center";
  messageElement.style.marginBottom = "5px";

  const textElement = document.createElement('span');
  if (message.timestamp) {
    const date = new Date(message.timestamp);
    const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    textElement.textContent = `[${timeString}] (${message.username}): ${message.text}`;
    textElement.title = date.toLocaleString();
  } else {
    textElement.textContent = `(${message.username}): ${message.text}`;
  }

  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = "❌";
  deleteBtn.style.marginLeft = "10px";
  deleteBtn.style.cursor = "pointer";
  deleteBtn.style.border = "none";
  deleteBtn.style.background = "transparent";
  deleteBtn.style.fontSize = "14px";

  deleteBtn.addEventListener('click', () => {
    if (confirm("Delete this message?")) {
      database.ref('messages').child(message.id).remove();
    }
  });

  messageElement.appendChild(textElement);
  messageElement.appendChild(deleteBtn);
  messagesDiv.appendChild(messageElement);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// --- Event listeners ---
function setupEventListeners() {
  sendMessageBtn.addEventListener('click', () => {
    const messageText = messageInput.value.trim();
    const usernameText = usernameInput.value.trim() || 'Anonymous';
    if (messageText) {
      writeNewMessage(usernameText, messageText);
      messageInput.value = '';
    }
  });

  messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessageBtn.click();
  });
}

// --- Listen for messages ---
function listenForMessages() {
  database.ref('messages').on('child_added', (snapshot) => {
    const message = snapshot.val();
    message.id = snapshot.key;
    displayMessage(message);
  });

  database.ref('messages').on('child_removed', (snapshot) => {
    const removedId = snapshot.key;
    const element = document.getElementById(removedId);
    if (element) element.remove();
  });
}

// --- Toast helper ---
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.opacity = 1;
  setTimeout(() => {
    toast.style.opacity = 0;
  }, 2000);
}

// --- Main entry point ---
function main() {
  initFirebase();
  getDOMElements();
  setupUsernameMemory();
  setupEventListeners();
  listenForMessages();
}

document.addEventListener('DOMContentLoaded', main);
