'use client';

import { auth } from '@/lib/firebase';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';

// Development mode detection
const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_ENV === 'development';

// Mock user data for development
const mockUsers = {
  admin: {
    uid: 'admin-uid',
    email: 'admin@example.com',
    role: 'admin',
    displayName: 'Admin User',
    emailVerified: true
  },
  judge: {
    uid: 'judge-demo-uid',
    email: 'judge@example.com',
    role: 'judge',
    displayName: 'Demo Judge',
    emailVerified: true
  },
  managescore: {
    uid: 'managescore-uid',
    email: 'managescore@example.com',
    role: 'managescore',
    displayName: 'Score Manager',
    emailVerified: true
  }
};

// Development authentication functions
export function useMockAuth() {
  if (!isDevelopment) {
    return null; // Only available in development
  }

  const signInMock = async (userType = 'admin') => {
    console.log(`🔧 Development: Signing in as mock ${userType}`);
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(mockUsers[userType]);
      }, 100); // Simulate network delay
    });
  };

  const signOutMock = async () => {
    console.log('🔧 Development: Signing out mock user');
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(null);
      }, 50);
    });
  };

  return {
    signInMock,
    signOutMock,
    mockUsers,
    isDevelopment
  };
}

// Production authentication functions
export function useRealAuth() {
  const signIn = async (email, password) => {
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      return result.user;
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  };

  const signOutUser = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  };

  return {
    signIn,
    signOut: signOutUser
  };
}

// Unified authentication hook that works in both development and production
export function useAuth() {
  const mockAuth = useMockAuth();
  const realAuth = useRealAuth();

  if (isDevelopment && mockAuth) {
    return {
      ...mockAuth,
      isDevelopment: true
    };
  }

  return {
    ...realAuth,
    isDevelopment: false
  };
}

// Helper function to check if user is authenticated
export function isAuthenticated(user) {
  return user && user.uid;
}

// Helper function to check user role
export function getUserRole(user) {
  if (!user) return null;
  
  if (isDevelopment) {
    // In development, check mock user role
    return user.role || 'judge';
  }
  
  // In production, check Firebase custom claims or email
  if (user.email === 'admin@gmail.com') return 'admin';
  if (user.email === 'managescore@gmail.com') return 'managescore';
  return 'judge';
}
