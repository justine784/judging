import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD9-7W1EtFevUqrBcVruR3oHgXEc4K4KcQ",
  authDomain: "judging-2a4da.firebaseapp.com",
  projectId: "judging-2a4da",
  storageBucket: "judging-2a4da.firebasestorage.app",
  messagingSenderId: "954134091247",
  appId: "1:954134091247:web:df9aea8c36ea8c64d2d21a",
  measurementId: "G-PKDBVPZQQV"
};

// Validate Firebase configuration
const validateFirebaseConfig = () => {
  const requiredFields = ['apiKey', 'authDomain', 'projectId', 'appId'];
  for (const field of requiredFields) {
    if (!firebaseConfig[field]) {
      throw new Error(`Firebase configuration missing required field: ${field}`);
    }
  }
};

// Validate configuration before initialization
validateFirebaseConfig();

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services with specific settings
export const auth = getAuth(app);
auth.settings = {
  persistence: 'session', // Use session persistence
  languageCode: 'en'
};

export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;

console.log('Firebase initialized successfully');
