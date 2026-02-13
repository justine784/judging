'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

export default function JudgeLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user && user.email === 'admin@gmail.com') {
        // Admin user is trying to access judge login, redirect to admin dashboard
        router.push('/admin/dashboard');
      }
    });

    return () => unsubscribe();
  }, [router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Prevent admin from trying to log in through judge portal
    if (email === 'admin@gmail.com') {
      setError('Admin users cannot access the judge portal. Please use the admin login.');
      setLoading(false);
      return;
    }

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      // Check if user is a judge by verifying they exist in the judges collection
      const user = userCredential.user;
      const judgeDoc = await getDoc(doc(db, 'judges', user.uid));
      
      if (!judgeDoc.exists()) {
        // User is not in the judges collection, sign them out and show error
        await auth.signOut();
        setError('You are not authorized to access the judge portal. Please contact the administrator.');
        return;
      }
      
      const judgeData = judgeDoc.data();
      
      // Check if judge is active
      if (judgeData.status === 'inactive') {
        await auth.signOut();
        setError('Your judge account has been deactivated. Please contact the administrator.');
        return;
      }
      
      // Check if user has judge role
      if (judgeData.role !== 'judge') {
        await auth.signOut();
        setError('Invalid user role. Please contact the administrator.');
        return;
      }
      
      // User is verified as a judge, proceed to dashboard
      router.push('/judge/dashboard');
    } catch (error) {
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        setError('Invalid email or password. Please try again.');
      } else if (error.code === 'auth/too-many-requests') {
        setError('Too many failed login attempts. Please try again later.');
      } else {
        setError('Login failed. Please try again.');
      }
      console.error('Login error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-xl p-2 mb-4">
            <img
              src="/logo.jpg"
              alt="Bongabong Logo"
              className="rounded-full object-contain w-full h-full"
            />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Judge Login</h1>
          <p className="text-gray-600">Enter your credentials to access the judging panel</p>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none transition-all"
                placeholder="judge@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none transition-all"
                placeholder="Enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-purple-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              {loading ? 'Signing in...' : 'Sign In as Judge'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Need help? Contact the system administrator
            </p>
          </div>
        </div>

        {/* Back to Home */}
        <div className="text-center mt-6">
          <button
            onClick={() => router.push('/')}
            className="text-purple-600 hover:text-purple-700 font-medium text-sm"
          >
            ← Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}
