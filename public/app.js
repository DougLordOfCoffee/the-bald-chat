// Your web app's Firebase configuration
// This is how your app knows which Firebase project to talk to!
const firebaseConfig = {
  apiKey: "AIzaSyAANuaXF-zSqAs9kzIBnW3ROLDwxGXA1p8", // Replace with your actual API Key
  authDomain: "the-bald-chat.firebaseapp.com",
  projectId: "the-bald-chat",
  storageBucket: "the-bald-chat.firebasestorage.app",
  messagingSenderId: "831148484483", // Your Project Number
  appId: "1:831148484483:web:23747c98adcd6e989db8b6", // Replace with your actual Web App ID
  databaseURL: "https://the-bald-chat-default-rtdb.firebaseio.com" // Your Realtime Database URL
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Get a reference to the Realtime Database service
const database = firebase.database();

// Get references to HTML elements
const messageInput = document.getElementById('messageInput');
const sendMessageBtn = document.getElementById('sendMessage');
const messagesDiv = document.getElementById('messages');

// --- Basic Realtime Database Example ---

// Function to write a new message to the database
function writeNewMessage(text) {
  // Create a new unique key for the message
  const newMessageRef = database.ref('messages').push();
  newMessageRef.set({
    text: text,
    timestamp: firebase.database.ServerValue.TIMESTAMP // Firebase's server timestamp
  });
  console.log("Message sent to Firebase:", text);
}

// Function to read messages from the database in real-time
database.ref('messages').on('child_added', (snapshot) => {
  const message = snapshot.val();
  const messageElement = document.createElement('p');
  messageElement.textContent = message.text; // For now, just show text
  messagesDiv.appendChild(messageElement);
  // Scroll to the bottom to see new messages
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

// Event listener for the send button
sendMessageBtn.addEventListener('click', () => {
  const messageText = messageInput.value.trim();
  if (messageText) {
    writeNewMessage(messageText);
    messageInput.value = ''; // Clear input after sending
  }
});

// Allow sending message by pressing Enter key
messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendMessageBtn.click();
  }
});

// --- End Basic Realtime Database Example ---
