'use client';

import { useState } from 'react';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Debug: Log the email being used
    console.log('Attempting login with email:', email);

    // Basic email validation
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address.');
      setLoading(false);
      return;
    }

    try {
      // Sign out any existing user to prevent authentication conflicts
      await signOut(auth);
      
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      console.log('Login successful:', userCredential.user.email);
      
      // Wait a brief moment for auth state to propagate
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Force redirect to dashboard with full page refresh
      window.location.href = '/admin/dashboard';
    } catch (error) {
      console.error('Login error details:', error.code, error.message);
      
      // Provide more specific error messages
      switch (error.code) {
        case 'auth/user-not-found':
          setError('Admin account not found. Please create the admin@gmail.com account in Firebase Console.');
          break;
        case 'auth/wrong-password':
          setError('Incorrect password. Please check your password.');
          break;
        case 'auth/invalid-email':
          setError('Invalid email format.');
          break;
        case 'auth/user-disabled':
          setError('Admin account has been disabled.');
          break;
        case 'auth/too-many-requests':
          setError('Too many failed attempts. Please try again later.');
          break;
        default:
          setError(`Login failed: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo Section */}
        <div className="text-center mb-8">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-white shadow-xl p-2 mb-4">
            <Image
              src="/logo.jpg"
              alt="Admin Logo"
              width={80}
              height={80}
              className="rounded-full object-contain"
            />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Login</h1>
          <p className="text-gray-600">Judging Tabulation System</p>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <form onSubmit={handleLogin} className="space-y-6">
            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none transition-all"
                placeholder="Enter your email"
                required
              />
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none transition-all"
                placeholder="Enter your password"
                required
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {/* Login Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold py-3 px-4 rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Additional Links */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              <button 
                onClick={() => router.push('/')}
                className="text-purple-600 hover:text-purple-700 font-medium transition-colors"
              >
                ← Back to Home
              </button>
            </p>
          </div>
        </div>

        {/* Footer Info */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>© 2026 Judging Tabulation System</p>
          <p>Bongabong, Oriental Mindoro</p>
        </div>
      </div>
    </div>
  );
}
