'use client';

import { useState, useEffect } from 'react';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { signOut, onAuthStateChanged } from 'firebase/auth';

export default function SetupJudge() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const setupJudgeDocument = async () => {
    if (!user) {
      setError('No user is logged in');
      return;
    }

    if (user.email !== 'managescore@gmail.com') {
      setError('This setup page is only for managescore@gmail.com');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      // Check if judge document already exists
      const judgeDoc = await getDoc(doc(db, 'judges', user.uid));
      
      if (judgeDoc.exists()) {
        setMessage('Judge document already exists!');
        return;
      }

      // Create judge document
      const judgeData = {
        uid: user.uid,
        email: user.email,
        displayName: 'Manage Score Judge',
        role: 'judge',
        status: 'active',
        createdAt: new Date(),
        lastLogin: null,
        assignedEvents: [],
        permissions: [
          'view_events',
          'score_contestants',
          'view_scoreboard',
          'edit_own_scores'
        ],
        specialization: 'general',
        experience: 'senior'
      };

      await setDoc(doc(db, 'judges', user.uid), judgeData);
      
      setMessage('✅ Judge document created successfully! You can now login as a judge.');
      
      // Sign out after setup
      setTimeout(async () => {
        await signOut(auth);
        window.location.href = '/judge/login';
      }, 3000);
      
    } catch (err) {
      console.error('Error setting up judge:', err);
      setError('Failed to create judge document: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-6">
            <div className="h-16 w-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-white text-2xl">👨‍⚖️</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Judge Setup</h1>
            <p className="text-gray-600">Setup judge account for managescore@gmail.com</p>
          </div>

          {!user ? (
            <div className="text-center">
              <p className="text-gray-600 mb-4">Please login first to setup your judge account</p>
              <button
                onClick={() => window.location.href = '/judge/login'}
                className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Go to Login
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">Logged in as:</p>
                <p className="font-medium text-gray-900">{user.email}</p>
                <p className="text-sm text-gray-500">UID: {user.uid}</p>
              </div>

              {user.email === 'managescore@gmail.com' ? (
                <div>
                  <button
                    onClick={setupJudgeDocument}
                    disabled={loading}
                    className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50"
                  >
                    {loading ? 'Setting up...' : 'Setup Judge Account'}
                  </button>
                  
                  {message && (
                    <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mt-4">
                      {message}
                    </div>
                  )}
                  
                  {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mt-4">
                      {error}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg">
                  This setup is only for managescore@gmail.com. Current user: {user.email}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
