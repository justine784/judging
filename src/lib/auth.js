import { auth } from '@/lib/firebase';
import { cookies } from 'next/headers';

// Development mode detection
const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_ENV === 'development';

export async function getServerSideUser() {
  try {
    // For development, return a mock admin user to bypass Firebase Auth
    if (isDevelopment) {
      console.log('🔧 Development mode detected, using mock admin user');
      return {
        uid: 'admin-uid',
        email: 'admin@example.com',
        role: 'admin',
        isDevelopment: true
      };
    }

    // Production: Check for real auth token
    const cookieStore = cookies();
    const token = cookieStore.get('auth-token')?.value;
    
    if (!token) {
      console.log('No auth token found in production');
      return null;
    }

    // Verify the real Firebase Auth token
    try {
      const decodedToken = await auth.verifyIdToken(token);
      return {
        ...decodedToken,
        isDevelopment: false
      };
    } catch (tokenError) {
      console.error('Token verification failed in production:', tokenError);
      return null;
    }
  } catch (error) {
    console.error('Error in getServerSideUser:', error);
    return null;
  }
}

// Helper function to create mock users for development
export function createMockUser(email, role = 'judge') {
  return {
    uid: email === 'admin@gmail.com' ? 'admin-uid' : `judge-${email.replace(/[^a-zA-Z0-9]/g, '')}`,
    email: email,
    role: role,
    isDevelopment: true,
    emailVerified: true
  };
}

// Helper function to check if current user is admin
export function isAdmin(user) {
  if (!user) return false;
  return user.email === 'admin@gmail.com' || user.email === 'admin@example.com';
}

// Helper function to check if current user is judge
export function isJudge(user) {
  if (!user) return false;
  return user.role === 'judge' || (user.email && user.email !== 'admin@gmail.com' && user.email !== 'admin@example.com');
}
