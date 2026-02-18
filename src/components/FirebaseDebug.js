'use client';

import { useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';

export default function FirebaseDebug() {
  const [debugInfo, setDebugInfo] = useState({});

  useEffect(() => {
    const checkFirebase = () => {
      const info = {
        authInitialized: !!auth,
        authConfig: auth.config || 'N/A',
        currentUser: auth.currentUser ? {
          email: auth.currentUser.email,
          uid: auth.currentUser.uid,
          isAnonymous: auth.currentUser.isAnonymous
        } : null,
        authState: 'checking...'
      };

      const unsubscribe = auth.onAuthStateChanged((user) => {
        info.authState = user ? 'authenticated' : 'not authenticated';
        info.currentUser = user ? {
          email: user.email,
          uid: user.uid,
          isAnonymous: user.isAnonymous
        } : null;
        setDebugInfo(info);
      });

      setDebugInfo(info);
      return unsubscribe;
    };

    const unsubscribe = checkFirebase();
    return unsubscribe;
  }, []);

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
