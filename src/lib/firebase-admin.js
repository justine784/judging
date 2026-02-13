import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin SDK
const serviceAccount = {
  "type": "service_account",
  "project_id": "judging-2a4da",
  "private_key_id": process.env.FIREBASE_PRIVATE_KEY_ID,
  "private_key": process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  "client_email": process.env.FIREBASE_CLIENT_EMAIL,
  "client_id": process.env.FIREBASE_CLIENT_ID,
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token"
};

// Initialize the admin app
const adminApp = initializeApp({
  credential: cert(serviceAccount)
});

// Export admin services
export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);

export default adminApp;
