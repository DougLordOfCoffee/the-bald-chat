// Your web app's Firebase configuration
// This is how your app knows which Firebase project to talk to!
const firebaseConfig = {
  apiKey: "AIzaSyAANuaXF-zSqAs9kzIBnW3ROLDwxGXA1p8",
  authDomain: "the-bald-chat.firebaseapp.com",
  projectId: "the-bald-chat",
  storageBucket: "the-bald-chat.firebasestorage.app",
  messagingSenderId: "831148484483",
  appId: "1:831148484483:web:23747c98adcd6e989db8b6",
  databaseURL: "https://the-bald-chat-default-rtdb.firebaseio.com"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Get a reference to the Realtime Database service
const database = firebase.database();
// Get a reference to the Firebase Authentication service
const auth = firebase.auth();

// Get references to HTML elements (existing and new ones)
const messageInput = document.getElementById('messageInput');
const sendMessageBtn = document.getElementById('sendMessage');
const messagesDiv = document.getElementById('messages');

const welcomeMessageEl = document.getElementById('welcomeMessage');
const signInButton = document.getElementById('signInButton');
const signOutButton = document.getElementById('signOutButton');
const chatContainer = document.getElementById('chatContainer'); // The new container for chat elements

// --- Authentication Logic ---

// Listen for authentication state changes
auth.onAuthStateChanged(async (user) => {
  if (user) {
    // User is signed in.
    welcomeMessageEl.textContent = `Welcome, ${user.displayName || user.email}! Start chatting!`;
    welcomeMessageEl.style.display = 'block';
    signInButton.style.display = 'none'; // Hide sign-in button
    signOutButton.style.display = 'block'; // Show sign-out button
    chatContainer.style.display = 'block'; // Show the chat interface

    // Make sure input and button are enabled
    messageInput.disabled = false;
    sendMessageBtn.disabled = false;

    console.log("User signed in:", user.displayName || user.email);

  } else {
    // No user is signed in.
    welcomeMessageEl.textContent = 'Please sign in to join the chat.';
    welcomeMessageEl.style.display = 'block';
    signInButton.style.display = 'block'; // Show sign-in button
    signOutButton.style.display = 'none'; // Hide sign-out button
    chatContainer.style.display = 'none'; // Hide the chat interface

    // Disable input and button
    messageInput.disabled = true;
    sendMessageBtn.disabled = true;

    console.log("No user signed in.");
  }
});

// Event listener for Google Sign-In button
signInButton.addEventListener('click', async () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await auth.signInWithPopup(provider);
    console.log("Signed in successfully with Google!");
  } catch (error) {
    console.error("Error signing in with Google:", error.message);
    alert(`Error signing in: ${error.message}`); // Provide user feedback
  }
});

// Event listener for Sign Out button
signOutButton.addEventListener('click', async () => {
  try {
    await auth.signOut();
    console.log("Signed out successfully!");
  } catch (error) {
    console.error("Error signing out:", error.message);
    alert(`Error signing out: ${error.message}`);
  }
});

// --- Basic Realtime Database Example (Modified to include user info) ---

// Function to write a new message to the database
function writeNewMessage(text) {
  const user = auth.currentUser; // Get the currently signed-in user
  if (user) { // Only allow sending if a user is signed in
    const newMessageRef = database.ref('messages').push();
    newMessageRef.set({
      text: text,
      timestamp: firebase.database.ServerValue.TIMESTAMP, // Firebase's server timestamp
      userId: user.uid, // Store the user's unique ID
      userName: user.displayName || user.email // Store the user's display name or email
    });
    console.log("Message sent to Firebase:", text);
  } else {
    console.warn("Message not sent: User not authenticated.");
    alert("Please sign in to send messages.");
  }
}

// Function to read messages from the database in real-time
database.ref('messages').on('child_added', (snapshot) => {
  const message = snapshot.val();
  const messageElement = document.createElement('p');
  // Display the sender's name along with the message
  messageElement.textContent = `${message.userName}: ${message.text}`;
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
