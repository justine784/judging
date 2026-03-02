import { adminAuth } from './firebase-admin';
import { cookies } from 'next/headers';

/**
 * Server-side authentication helper for API routes
 * Verifies Firebase ID token from cookies and returns user data
 */
export async function getServerSideUser() {
  try {
    // Check if admin services are available
    if (!adminAuth) {
      throw new Error('Admin services not available');
    }

    // Get the session cookie
    const cookieStore = cookies();
    const sessionCookie = cookieStore.get('session')?.value;

    if (!sessionCookie) {
      return null;
    }

    // Verify the session cookie
    const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie, true);

    // Get user data from Firestore (optional, for additional user info)
    // You can add Firestore queries here if needed

    return {
      uid: decodedClaims.uid,
      email: decodedClaims.email,
      role: decodedClaims.role || 'user', // Default role
      ...decodedClaims
    };
  } catch (error) {
    console.error('Error verifying server-side user:', error);
    return null;
  }
}
