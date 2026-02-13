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

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
