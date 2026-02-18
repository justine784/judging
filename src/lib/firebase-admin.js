import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// Check if required environment variables are available
const hasRequiredEnvVars = process.env.FIREBASE_PRIVATE_KEY && 
                          process.env.FIREBASE_CLIENT_EMAIL && 
                          process.env.FIREBASE_CLIENT_ID;

let adminApp = null;
let adminAuth = null;
let adminDb = null;

// Only initialize if environment variables are available (not during build)
if (hasRequiredEnvVars) {
  try {
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
    adminApp = initializeApp({
      credential: cert(serviceAccount)
    });

    // Export admin services
    adminAuth = getAuth(adminApp);
    adminDb = getFirestore(adminApp);
  } catch (error) {
    console.error('Failed to initialize Firebase Admin SDK:', error);
  }
}

// Export admin services (will be null if not initialized)
export { adminAuth, adminDb };
export default adminApp;
