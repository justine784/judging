'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import ForgotPasswordModal from '@/components/ForgotPasswordModal';

// Floating shapes component for animated background - Green/Emerald theme matching home page
const FloatingShapes = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none">
    {/* Animated gradient orbs */}
    <div className="absolute -top-40 -right-40 w-60 h-60 sm:w-80 sm:h-80 bg-gradient-to-br from-green-400/30 to-emerald-300/20 rounded-full blur-3xl animate-blob"></div>
    <div className="absolute -bottom-40 -left-40 w-60 h-60 sm:w-80 sm:h-80 bg-gradient-to-tr from-emerald-400/30 to-teal-300/20 rounded-full blur-3xl animate-blob animation-delay-2000"></div>
    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-72 h-72 sm:w-96 sm:h-96 bg-gradient-to-r from-green-200/20 to-emerald-200/20 rounded-full blur-3xl animate-blob animation-delay-4000"></div>
    
    {/* Floating bubbles matching home page style */}
    <div className="absolute top-20 left-[15%] w-3 h-3 sm:w-4 sm:h-4 bg-green-400/40 rounded-full animate-bubble"></div>
    <div className="absolute top-40 right-[20%] w-2 h-2 sm:w-3 sm:h-3 bg-emerald-400/40 rounded-full animate-bubble animation-delay-1000"></div>
    <div className="absolute bottom-32 left-[25%] w-4 h-4 sm:w-5 sm:h-5 bg-teal-400/30 rounded-full animate-bubble animation-delay-3000"></div>
    <div className="absolute top-1/3 right-[10%] w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-500/40 rounded-full animate-bubble animation-delay-2000"></div>
    <div className="absolute bottom-20 right-[30%] w-3 h-3 sm:w-4 sm:h-4 bg-emerald-300/30 rounded-full animate-bubble animation-delay-4000"></div>
    
    {/* Grid pattern overlay */}
    <div className="absolute inset-0 bg-[linear-gradient(rgba(34,197,94,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(34,197,94,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
  </div>
);

export default function JudgeLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isFocused, setIsFocused] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const emailInputRef = useRef(null);
  const passwordInputRef = useRef(null);

  useEffect(() => {
    setMounted(true);
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user && user.email === 'admin@gmail.com') {
        // Admin user is trying to access judge login, redirect to admin dashboard
        router.push('/admin/dashboard');
      }
    });

    // Load saved credentials on mount
    const savedEmail = localStorage.getItem('judgeEmail');
    const savedRemember = localStorage.getItem('judgeRememberMe');
    if (savedEmail && savedRemember === 'true') {
      setEmail(savedEmail);
      setRememberMe(true);
    }
    // Focus email input on mount
    setTimeout(() => emailInputRef.current?.focus(), 100);

    return () => unsubscribe();
  }, [router]);

  // Validate email in real-time
  const validateEmail = (value) => {
    if (!value) {
      setEmailError('');
      return true;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      setEmailError('Please enter a valid email address');
      return false;
    }
    setEmailError('');
    return true;
  };

  // Validate password in real-time
  const validatePassword = (value) => {
    if (!value) {
      setPasswordError('');
      return true;
    }
    if (value.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return false;
    }
    setPasswordError('');
    return true;
  };

  // Handle Enter key navigation
  const handleKeyDown = (e, nextField) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (nextField === 'submit') {
        handleSubmit(e);
      } else {
        nextField?.current?.focus();
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate all fields
    const isEmailValid = validateEmail(email);
    const isPasswordValid = validatePassword(password);
    
    if (!isEmailValid || !isPasswordValid) {
      setError('Please fix the errors above');
      return;
    }
    
    setError('');
    setLoading(true);

    // Prevent admin from trying to log in through judge portal
    if (email === 'admin@gmail.com') {
      setError('Admin users cannot access the judge portal. Please use the admin login.');
      setLoading(false);
      return;
    }

    // Save email if remember me is checked
    if (rememberMe) {
      localStorage.setItem('judgeEmail', email);
      localStorage.setItem('judgeRememberMe', 'true');
    } else {
      localStorage.removeItem('judgeEmail');
      localStorage.removeItem('judgeRememberMe');
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
      if (judgeData.isActive === false) {
        await auth.signOut();
        setError('🚫 Your judge account has been deactivated. Please contact the administrator for assistance.');
        return;
      }
      
      // Check if user has judge role
      if (judgeData.role !== 'judge') {
        await auth.signOut();
        setError('Invalid user role. Please contact the administrator.');
        return;
      }
      
      // User is verified as a judge, check if it's the special managescore account
      if (user.email === 'managescore@gmail.com') {
        router.push('/judge/managescore');
      } else {
        router.push('/judge/dashboard');
      }
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-green-50 to-emerald-100 flex items-center justify-center px-3 sm:px-4 py-4 sm:py-6 relative overflow-hidden">
      {/* Animated Background */}
      <FloatingShapes />
      
      {/* Decorative corner accents */}
      <div className="absolute top-0 left-0 w-48 h-48 sm:w-64 sm:h-64 bg-gradient-to-br from-green-500/10 to-transparent rounded-br-full"></div>
      <div className="absolute bottom-0 right-0 w-48 h-48 sm:w-64 sm:h-64 bg-gradient-to-tl from-emerald-500/10 to-transparent rounded-tl-full"></div>
      
      <div className={`w-full max-w-md relative z-10 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        {/* Logo Section with glow effect */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="relative mx-auto flex h-24 w-24 sm:h-28 sm:w-28 items-center justify-center mb-3 sm:mb-4">
            {/* Glow ring */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 animate-pulse blur-md opacity-40"></div>
            <div className="relative h-20 w-20 sm:h-24 sm:w-24 rounded-full bg-white shadow-2xl p-2 ring-4 ring-white/50">
              <img
                src="/logo.jpg"
                alt="Bongabong Logo"
                className="rounded-full object-contain w-full h-full"
              />
            </div>
          </div>
          
          {/* Title with icon badge */}
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gradient-to-br from-green-600 to-emerald-600 rounded-lg flex items-center justify-center shadow-lg">
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold bg-gradient-to-r from-gray-900 via-green-800 to-emerald-900 bg-clip-text text-transparent">
              Judge Portal
            </h1>
          </div>
          <p className="text-xs sm:text-sm md:text-base text-gray-600 font-medium px-2 sm:px-4">Enter your credentials to access the evaluation panel</p>
        </div>

        {/* Login Form Card with glassmorphism */}
        <div className="backdrop-blur-xl bg-white/80 rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-6 md:p-8 border border-white/50 relative overflow-hidden mx-1 sm:mx-0">
          {/* Card shine effect */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-green-500 via-emerald-500 to-green-500"></div>
          
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
            {/* Error Message at top */}
            {error && (
              <div className="bg-gradient-to-r from-red-50 to-red-100/50 border border-red-200 text-red-700 px-3 sm:px-4 py-2 sm:py-3 rounded-xl flex items-start gap-2 sm:gap-3 animate-shake">
                <div className="w-5 h-5 sm:w-6 sm:h-6 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-3 h-3 sm:w-4 sm:h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </div>
                <span className="text-xs sm:text-sm font-medium">{error}</span>
              </div>
            )}

            {/* Email Field */}
            <div className="space-y-1.5 sm:space-y-2">
              <label htmlFor="email" className="block text-xs sm:text-sm font-semibold text-gray-700 flex items-center gap-1.5 sm:gap-2">
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                </svg>
                Email Address
              </label>
              <div className="relative group">
                <input
                  ref={emailInputRef}
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    validateEmail(e.target.value);
                  }}
                  onKeyDown={(e) => handleKeyDown(e, passwordInputRef)}
                  onFocus={() => setIsFocused('email')}
                  onBlur={() => setIsFocused('')}
                  className={`w-full px-3 sm:px-4 py-3 sm:py-3.5 border-2 rounded-xl outline-none transition-all duration-300 text-gray-900 bg-white/70 backdrop-blur-sm text-sm sm:text-base ${
                    emailError 
                      ? 'border-red-300 bg-red-50/70 focus:ring-4 focus:ring-red-100' 
                      : isFocused === 'email'
                      ? 'border-green-500 bg-green-50/50 ring-4 ring-green-100 shadow-lg shadow-green-100'
                      : 'border-gray-200 hover:border-gray-300 focus:border-green-500 focus:ring-4 focus:ring-green-100'
                  }`}
                  placeholder="judge@example.com"
                  required
                  autoComplete="email"
                />
                {email && !emailError && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 animate-scale-in">
                    <div className="w-5 h-5 sm:w-6 sm:h-6 bg-green-100 rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 sm:w-4 sm:h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"></path>
                      </svg>
                    </div>
                  </div>
                )}
              </div>
              {emailError && (
                <p className="text-xs text-red-600 flex items-center gap-1 animate-shake">
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                  {emailError}
                </p>
              )}
            </div>

            {/* Password Field */}
            <div className="space-y-1.5 sm:space-y-2">
              <label htmlFor="password" className="block text-xs sm:text-sm font-semibold text-gray-700 flex items-center gap-1.5 sm:gap-2">
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
                </svg>
                Password
              </label>
              <div className="relative group">
                <input
                  ref={passwordInputRef}
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    validatePassword(e.target.value);
                  }}
                  onKeyDown={(e) => handleKeyDown(e, 'submit')}
                  onFocus={() => setIsFocused('password')}
                  onBlur={() => setIsFocused('')}
                  className={`w-full px-3 sm:px-4 py-3 sm:py-3.5 pr-12 border-2 rounded-xl outline-none transition-all duration-300 text-gray-900 bg-white/70 backdrop-blur-sm text-sm sm:text-base ${
                    passwordError 
                      ? 'border-red-300 bg-red-50/70 focus:ring-4 focus:ring-red-100' 
                      : isFocused === 'password'
                      ? 'border-green-500 bg-green-50/50 ring-4 ring-green-100 shadow-lg shadow-green-100'
                      : 'border-gray-200 hover:border-gray-300 focus:border-green-500 focus:ring-4 focus:ring-green-100'
                  }`}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-green-600 transition-all duration-200 p-1 sm:p-1.5 rounded-lg hover:bg-green-50"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path>
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                    </svg>
                  )}
                </button>
              </div>
              {passwordError && (
                <p className="text-xs text-red-600 flex items-center gap-1 animate-shake">
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                  {passwordError}
                </p>
              )}
            </div>

            {/* Remember Me & Forgot Password */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
              <label className="flex items-center gap-1.5 sm:gap-2 cursor-pointer group">
                <div className="relative">
                  <input
                    id="remember"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-gray-300 rounded-md peer-checked:border-green-600 peer-checked:bg-green-600 transition-all duration-200 flex items-center justify-center group-hover:border-green-400">
                    {rememberMe && (
                      <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
                      </svg>
                    )}
                  </div>
                </div>
                <span className="text-xs sm:text-sm text-gray-600 group-hover:text-gray-900 transition-colors select-none">Remember me</span>
              </label>
              <button 
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-xs sm:text-sm text-green-600 hover:text-green-700 font-medium transition-colors hover:underline"
              >
                Forgot password?
              </button>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={loading || !email || !password || emailError || passwordError}
              className="w-full relative group overflow-hidden bg-gradient-to-r from-green-600 via-emerald-600 to-green-600 text-white font-semibold py-3 sm:py-4 px-4 sm:px-6 rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-green-200 hover:shadow-xl hover:shadow-green-300 transform hover:scale-[1.02] active:scale-[0.98]"
            >
              {/* Shine effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-all duration-700"></div>
              
              <span className={`flex items-center justify-center gap-2 sm:gap-3 transition-opacity duration-200 ${loading ? 'opacity-0' : 'opacity-100'}`}>
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <span className="text-sm sm:text-base">Sign In as Judge</span>
              </span>
              
              {loading && (
                <span className="absolute inset-0 flex items-center justify-center gap-2 sm:gap-3">
                  <svg className="animate-spin h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span className="text-sm font-medium">Authenticating...</span>
                </span>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="my-4 sm:my-6 flex items-center gap-3 sm:gap-4">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent"></div>
            <span className="text-[10px] sm:text-xs text-gray-400 font-medium">EVALUATION PANEL</span>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent"></div>
          </div>

          {/* Additional Links */}
          <div className="flex items-center justify-center gap-2 sm:gap-4 text-xs sm:text-sm">
            <button 
              onClick={() => router.push('/')}
              className="flex items-center gap-1.5 sm:gap-2 text-gray-600 hover:text-green-600 font-medium transition-all duration-200 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg hover:bg-green-50"
            >
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>
              </svg>
              Home
            </button>
            <div className="w-px h-3 sm:h-4 bg-gray-300"></div>
            <button 
              onClick={() => {
                setEmail('');
                setPassword('');
                setError('');
                setEmailError('');
                setPasswordError('');
                emailInputRef.current?.focus();
              }}
              className="flex items-center gap-1.5 sm:gap-2 text-gray-600 hover:text-green-600 font-medium transition-all duration-200 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg hover:bg-green-50"
            >
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
              </svg>
              Reset
            </button>
          </div>

          {/* Help notice */}
          <div className="mt-3 sm:mt-4 text-center">
            <div className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 bg-green-50/50 rounded-lg text-[10px] sm:text-xs text-gray-500">
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <span>Need help? Contact the system administrator</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 sm:mt-6 text-center">
          <div className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-white/50 backdrop-blur-sm rounded-full text-[10px] sm:text-xs text-gray-500 border border-gray-200/50">
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <span>Judge Portal - Secure Authentication</span>
          </div>
        </div>
      </div>
      
{/* Forgot Password Modal */}
      <ForgotPasswordModal 
        isOpen={showForgotPassword} 
        onClose={() => setShowForgotPassword(false)} 
        userType="judge" 
      />
    </div>
  );
}
