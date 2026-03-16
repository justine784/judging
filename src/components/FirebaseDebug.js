'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { auth } from '@/lib/firebase';

export default function FirebaseDebug() {
  const [debugInfo, setDebugInfo] = useState({});
  const isInitialized = useRef(false);

  const updateDebugInfo = useCallback((user = null) => {
    const currentUser = user || auth.currentUser;
    const info = {
      authInitialized: !!auth,
      authConfig: auth.config || 'N/A',
      currentUser: currentUser ? {
        email: currentUser.email,
        uid: currentUser.uid,
        isAnonymous: currentUser.isAnonymous
      } : null,
      authState: currentUser ? 'authenticated' : 'not authenticated'
    };

    // Only update if info has actually changed
    setDebugInfo(prev => {
      const hasChanged = JSON.stringify(prev) !== JSON.stringify(info);
      return hasChanged ? info : prev;
    });
  }, []);

  useEffect(() => {
    // Prevent multiple initializations
    if (isInitialized.current) return;
    isInitialized.current = true;

    // Initial update
    updateDebugInfo();

    // Listen for auth changes
    const unsubscribe = auth.onAuthStateChanged(updateDebugInfo);

    return unsubscribe;
  }, [updateDebugInfo]);

  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 bg-black text-white p-4 rounded-lg text-xs max-w-sm z-50">
      <h3 className="font-bold mb-2">Firebase Debug</h3>
      <pre className="whitespace-pre-wrap">
        {JSON.stringify(debugInfo, null, 2)}
      </pre>
    </div>
  );
}
