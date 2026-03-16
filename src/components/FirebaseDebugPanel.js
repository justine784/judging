'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/lib/client-auth';

export default function FirebaseDebug() {
  const [debugInfo, setDebugInfo] = useState({
    authState: 'checking...',
    currentUser: null,
    firebaseConfig: null,
    environment: null,
    error: null
  });

  const mockAuth = useAuth();

  // Use stable reference for mockAuth dependency
  const mockAuthRef = useRef(mockAuth);
  useEffect(() => {
    mockAuthRef.current = mockAuth;
  }, [mockAuth]);

  const updateDebugInfo = useCallback(() => {
    try {
      const info = {
        authState: auth.currentUser ? 'authenticated' : 'not authenticated',
        currentUser: auth.currentUser ? {
          uid: auth.currentUser.uid,
          email: auth.currentUser.email,
          emailVerified: auth.currentUser.emailVerified,
          isAnonymous: auth.currentUser.isAnonymous
        } : null,
        firebaseConfig: {
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'judging-2a4da',
          authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
          appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ? '***' + process.env.NEXT_PUBLIC_FIREBASE_APP_ID.slice(-4) : null
        },
        environment: {
          NODE_ENV: process.env.NODE_ENV,
          NEXT_PUBLIC_ENV: process.env.NEXT_PUBLIC_ENV,
          isDevelopment: process.env.NODE_ENV === 'development',
          hasMockAuth: !!mockAuthRef.current?.isDevelopment
        },
        error: null
      };

      setDebugInfo(info);
    } catch (error) {
      setDebugInfo(prev => ({
        ...prev,
        error: error.message
      }));
    }
  }, []); // Empty dependency array since we use ref for mockAuth

  useEffect(() => {
    updateDebugInfo();

    // Listen for auth changes
    const unsubscribe = auth.onAuthStateChanged(updateDebugInfo);
    
    return unsubscribe;
  }, [updateDebugInfo]);

  const testFirestoreConnection = async () => {
    try {
      console.log('🔍 Testing Firestore connection...');
      const { doc, getDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      
      // Try to read a test document
      const testDoc = await getDoc(doc(db, 'events', 'test'));
      console.log('✅ Firestore connection successful');
      alert('✅ Firestore connection successful');
    } catch (error) {
      console.error('❌ Firestore connection failed:', error);
      alert(`❌ Firestore connection failed: ${error.message}`);
    }
  };

  const signInMock = async () => {
    if (mockAuth?.isDevelopment) {
      try {
        const user = await mockAuth.signInMock('admin');
        console.log('✅ Mock sign in successful:', user);
        alert('✅ Mock admin signed in successfully');
      } catch (error) {
        console.error('❌ Mock sign in failed:', error);
        alert(`❌ Mock sign in failed: ${error.message}`);
      }
    } else {
      alert('🔒 Mock auth only available in development mode');
    }
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      background: 'rgba(0, 0, 0, 0.9)',
      color: 'white',
      padding: '15px',
      borderRadius: '8px',
      fontSize: '12px',
      maxWidth: '400px',
      zIndex: 9999,
      fontFamily: 'monospace'
    }}>
      <div style={{ marginBottom: '10px', fontWeight: 'bold' }}>
        🔧 Firebase Debug Panel
      </div>
      
      <div style={{ marginBottom: '10px' }}>
        <strong>Auth State:</strong> {debugInfo.authState}
      </div>
      
      {debugInfo.currentUser && (
        <div style={{ marginBottom: '10px' }}>
          <strong>User:</strong> {debugInfo.currentUser.email} ({debugInfo.currentUser.uid})
        </div>
      )}
      
      <div style={{ marginBottom: '10px' }}>
        <strong>Environment:</strong> {debugInfo.environment?.NODE_ENV}
        {debugInfo.environment?.isDevelopment && ' 🛠️ Development'}
        {debugInfo.environment?.hasMockAuth && ' 🎭 Mock Auth'}
      </div>
      
      <div style={{ marginBottom: '10px' }}>
        <strong>Project:</strong> {debugInfo.firebaseConfig?.projectId}
      </div>
      
      {debugInfo.error && (
        <div style={{ marginBottom: '10px', color: '#ff6b6b' }}>
          <strong>Error:</strong> {debugInfo.error}
        </div>
      )}
      
      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
        <button
          onClick={testFirestoreConnection}
          style={{
            background: '#4CAF50',
            color: 'white',
            border: 'none',
            padding: '5px 10px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '11px'
          }}
        >
          Test Firestore
        </button>
        
        {mockAuth?.isDevelopment && (
          <button
            onClick={signInMock}
            style={{
              background: '#2196F3',
              color: 'white',
              border: 'none',
              padding: '5px 10px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '11px'
            }}
          >
            Mock Sign In
          </button>
        )}
        
        <button
          onClick={() => window.location.reload()}
          style={{
            background: '#FF9800',
            color: 'white',
            border: 'none',
            padding: '5px 10px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '11px'
          }}
        >
          Reload
        </button>
      </div>
    </div>
  );
}
