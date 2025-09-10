// --- Firebase Configuration ---
// Note: This is now a standard practice to keep the config object separate.
const firebaseConfig = {
  apiKey: "AIzaSyAANuaXF-zSqAs9kzIBnW3ROLDwxGXA1p8",
  authDomain: "the-bald-chat.firebaseapp.com",
  projectId: "the-bald-chat",
  storageBucket: "the-bald-chat.firebasestorage.app",
  messagingSenderId: "831148484483",
  appId: "1:831148484483:web:23747c98adcd6e989db8b6",
  databaseURL: "https://the-bald-chat-default-rtdb.firebaseio.com"
};

// --- Import the necessary functions from the modular SDKs ---
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js';
import { getDatabase, ref, push, onChildAdded, onChildRemoved, serverTimestamp, remove } from 'https://www.gstatic.com/firebasejs/10.10.0/firebase-database.js';

// --- Global Firebase and DOM References ---
let database;
let usernameInput, messageInput, sendMessageBtn, messagesDiv;
let auth; // If you plan to add authentication later, you'll need this.

// --- Core Functions ---
function initFirebase() {
  // Initialize the app and get service instances
  const app = initializeApp(firebaseConfig);
  database = getDatabase(app);
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
  // Use `ref` and `push` functions from the modular SDK
  const messagesRef = ref(database, 'messages');
  push(messagesRef, {
    username: username,
    text: text,
    timestamp: serverTimestamp() // Use modular serverTimestamp
  });
}

// --- Display a message ---
function displayMessage(message) {
  const messageElement = document.createElement('div');
  messageElement.id = message.id; // Correctly set the ID
  messageElement.classList.add(message.isMine ? 'mine' : 'other'); // Add a class for styling
  
  // Create a proper message structure from your HTML
  const usernameSpan = document.createElement('span');
  usernameSpan.className = 'username';
  usernameSpan.textContent = message.username;

  const textSpan = document.createElement('span');
  textSpan.textContent = message.text;

  const metaSpan = document.createElement('span');
  metaSpan.className = 'meta';
  
  // Check if the timestamp is a number before creating a Date object
  if (typeof message.timestamp === 'number') {
    const date = new Date(message.timestamp);
    metaSpan.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else {
    // If timestamp is not available, just use a default
    metaSpan.textContent = '';
  }

  // Combine elements
  messageElement.appendChild(usernameSpan);
  messageElement.appendChild(textSpan);
  messageElement.appendChild(metaSpan);

  // Your original code had a delete button, but it was being applied to every message,
  // making the design complex. Let's keep the design cleaner as per your HTML.
  
  // To handle the `mine` class, we need to know the current user.
  // We'll set the class for messages that match the saved username.
  if (message.username === usernameInput.value) {
    messageElement.classList.add('mine');
  }

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
  const messagesRef = ref(database, 'messages');

  // Listen for new messages added
  onChildAdded(messagesRef, (snapshot) => {
    const message = snapshot.val();
    message.id = snapshot.key;
    displayMessage(message);
  });

  // Listen for messages removed
  onChildRemoved(messagesRef, (snapshot) => {
    const removedId = snapshot.key;
    const element = document.getElementById(removedId);
    if (element) element.remove();
  });
}

// --- Toast helper ---
function showToast(message) {
  const toast = document.getElementById('toast');
  if (toast) { // Added a check to ensure toast exists
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2000);
  }
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
