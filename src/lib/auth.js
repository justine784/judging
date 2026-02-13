import { auth } from '@/lib/firebase';
import { cookies } from 'next/headers';

export async function getServerSideUser() {
  try {
    // For development, return a mock admin user
    // In production, this should verify the JWT token from cookies
    const cookieStore = cookies();
    const token = cookieStore.get('auth-token')?.value;
    
    // If no token, return mock admin for development
    if (!token) {
      console.log('No auth token found, using mock admin user for development');
      return {
        uid: 'admin-uid',
        email: 'admin@example.com',
        role: 'admin'
      };
    }

    // Try to verify the token (this will fail until proper auth is set up)
    try {
      const decodedToken = await auth.verifyIdToken(token);
      return decodedToken;
    } catch (tokenError) {
      console.log('Token verification failed, using mock admin user for development');
      return {
        uid: 'admin-uid',
        email: 'admin@example.com',
        role: 'admin'
      };
    }
  } catch (error) {
    console.error('Error in getServerSideUser:', error);
    // Return mock admin as fallback
    return {
      uid: 'admin-uid',
      email: 'admin@example.com',
      role: 'admin'
    };
  }
}
