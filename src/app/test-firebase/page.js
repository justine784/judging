'use client';

import { useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';

export default function TestFirebase() {
  const [status, setStatus] = useState('Loading...');
  const [error, setError] = useState(null);

  useEffect(() => {
    const testFirebase = async () => {
      try {
        // Test 1: Check if auth is initialized
        if (!auth) {
          throw new Error('Firebase auth not initialized');
        }
        setStatus('✅ Firebase auth initialized');

        // Test 2: Check auth configuration
        console.log('Auth config:', auth.config);
        console.log('Auth app:', auth.app);
        setStatus('✅ Auth configuration checked');

        // Test 3: Try a simple sign in with test credentials
        try {
          // This will fail but give us specific error info
          await signInWithEmailAndPassword(auth, 'test@example.com', 'test123456');
        } catch (signInError) {
          console.log('Sign-in test error:', signInError.code, signInError.message);
          setError({
            code: signInError.code,
            message: signInError.message,
            fullError: signInError
          });
          setStatus('❌ Sign-in test failed (expected for test credentials)');
        }

      } catch (err) {
        console.error('Firebase test error:', err);
        setError({
          message: err.message,
          stack: err.stack
        });
        setStatus('❌ Firebase test failed');
      }
    };

    testFirebase();
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Firebase Authentication Test</h1>
        
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Test Status</h2>
          <p className="text-lg">{status}</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4 text-red-800">Error Details</h2>
            <div className="space-y-2">
              <p><strong>Code:</strong> {error.code || 'N/A'}</p>
              <p><strong>Message:</strong> {error.message}</p>
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium">Full Error Details</summary>
                <pre className="mt-2 text-xs bg-gray-100 p-4 rounded overflow-auto">
                  {JSON.stringify(error.fullError || error, null, 2)}
                </pre>
              </details>
            </div>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mt-6">
          <h2 className="text-xl font-semibold mb-4 text-blue-800">Firebase Configuration</h2>
          <div className="space-y-2 text-sm">
            <p><strong>Auth Object:</strong> {auth ? '✅ Exists' : '❌ Missing'}</p>
            <p><strong>Auth App:</strong> {auth?.app ? '✅ Available' : '❌ Missing'}</p>
            <p><strong>Current User:</strong> {auth?.currentUser ? auth.currentUser.email : 'None'}</p>
          </div>
        </div>

        <div className="mt-6">
          <a href="/admin/login" className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 inline-block">
            Back to Admin Login
          </a>
        </div>
      </div>
    </div>
  );
}
