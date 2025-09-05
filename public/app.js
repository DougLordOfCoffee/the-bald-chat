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

/**
 * Initializes Firebase and gets a reference to the database service.
 */
function initFirebase() {
  firebase.initializeApp(firebaseConfig);
  database = firebase.database();
}

/**
 * Gets references to all the necessary HTML elements.
 */
function getDOMElements() {
  usernameInput = document.getElementById('usernameInput');
  messageInput = document.getElementById('messageInput');
  sendMessageBtn = document.getElementById('sendMessage');
  messagesDiv = document.getElementById('messages');
}


// --- Auto-save username with localStorage ---
function setupUsernameMemory() {
  // Load saved username if it exists
  const savedUsername = localStorage.getItem('username');
  if (savedUsername) {
    usernameInput.value = savedUsername;
  }

  // Save username whenever it changes
  usernameInput.addEventListener('input', () => {
    localStorage.setItem('username', usernameInput.value);
  });
}


/**
 * Writes a new message to the Firebase Realtime Database.
 * @param {string} username The user's name.
 * @param {string} text The message content.
 */
function writeNewMessage(username, text) {
  const newMessageRef = database.ref('messages').push();
  newMessageRef.set({
    username: username,
    text: text,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  });
}

/**
 * Creates and displays a message element in the chat window.
 * @param {object} message The message object from Firebase.
 */
function displayMessage(message) {
  const messageElement = document.createElement('div');
  messageElement.id = message.id;
  messageElement.style.display = "flex";
  messageElement.style.justifyContent = "space-between";
  messageElement.style.alignItems = "center";
  messageElement.style.marginBottom = "5px";

  // Main text
  const textElement = document.createElement('span');

  if (message.timestamp) {
    const date = new Date(message.timestamp);
    const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    textElement.textContent = `[${timeString}] (${message.username}): ${message.text}`;
    textElement.title = date.toLocaleString();
  } else {
    textElement.textContent = `(${message.username}): ${message.text}`;
  }

  // Delete button
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

  // Put text + delete button together
  messageElement.appendChild(textElement);
  messageElement.appendChild(deleteBtn);

  messagesDiv.appendChild(messageElement);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}


/**
 * Sets up the event listeners for user interactions.
 */
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
    if (e.key === 'Enter') {
      sendMessageBtn.click();
    }
  });
}

/**
 * Listens for new messages in the Firebase database and displays them.
 */
function listenForMessages() {
  database.ref('messages').on('child_added', (snapshot) => {
    const message = snapshot.val();
    message.id = snapshot.key;  // attach the Firebase key
    displayMessage(message);
  });
}



// --- Main Application Entry Point ---
/**
 * The main function to initialize and run the chat application.
 */
function main() {
  initFirebase();
  getDOMElements();
  setupUsernameMemory(); // <-- add this line
  setupEventListeners();
  listenForMessages();
}

database.ref('messages').on('child_removed', (snapshot) => {
  const removedId = snapshot.key;
  const element = document.getElementById(removedId);
  if (element) element.remove();
});

// Run the main function when the page loads
document.addEventListener('DOMContentLoaded', main);
