'use client';

import { useState } from 'react';
import { sendPasswordResetEmail, fetchSignInMethodsForEmail } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

export default function ForgotPasswordModal({ isOpen, onClose, userType = 'admin' }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [step, setStep] = useState(1); // 1: email input, 2: sending, 3: success

  const generateReferenceNumber = () => {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `REF-${timestamp.slice(-6)}-${random}`;
  };

  const validateEmail = (value) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    setError('');
    setStep(2);

    try {
      // Check if user exists in the appropriate collection
      let userExists = false;
      
      if (userType === 'admin') {
        // For admin, check if it's the admin email
        if (email === 'admin@gmail.com') {
          userExists = true;
        }
      } else {
        // For judge, check if they exist in judges collection
        try {
          console.log('Checking for judge with email:', email);
          const judgesRef = collection(db, 'judges');
          const q = query(judgesRef, where('email', '==', email));
          const querySnapshot = await getDocs(q);
          console.log('Judge query snapshot size:', querySnapshot.size);
          
          userExists = !querySnapshot.empty;
          
          // Additional check: verify the judge has proper status and role
          if (userExists) {
            const judgeDoc = querySnapshot.docs[0];
            const judgeData = judgeDoc.data();
            console.log('Judge data found:', judgeData);
            
            // Check if judge is active and has correct role
            if (judgeData.status === 'inactive' || judgeData.role !== 'judge') {
              console.log('Judge is inactive or has wrong role:', { status: judgeData.status, role: judgeData.role });
              userExists = false;
            }
          } else {
            console.log('No judge found with email:', email);
          }
        } catch (err) {
          console.error('Error checking judge collection:', err);
          userExists = false;
        }
      }

      if (!userExists) {
        if (userType === 'judge') {
          setError('No judge account found with this email address. Please contact the administrator.');
        } else {
          setError('No admin account found with this email address.');
        }
        setLoading(false);
        setStep(1);
        return;
      }

      // Generate reference number (will be sent in email only)
      const refNumber = generateReferenceNumber();

      // Send password reset email
      console.log('Sending password reset email to:', email);
      
      try {
        // First, store the reference number in Firestore
        await setDoc(doc(db, 'passwordResets', refNumber), {
          email: email,
          userType: userType,
          createdAt: serverTimestamp(),
          used: false,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
        });
        
        // Send the Firebase password reset email
        console.log('Attempting to send password reset email...');
        await sendPasswordResetEmail(auth, email);
        console.log('Password reset email sent successfully to:', email);
        
        // Try to send custom branded email with reference number
        try {
          const emailResponse = await fetch('/api/send-reset-email', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: email,
              referenceNumber: refNumber,
              userType: userType
            })
          });
          
          if (emailResponse.ok) {
            console.log('Custom branded email sent successfully');
          }
        } catch (emailErr) {
          console.warn('Custom email failed, but Firebase email was sent:', emailErr);
        }
        
        // Log the request
        try {
          const logResponse = await fetch('/api/log-reset-request', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: email,
              referenceNumber: refNumber,
              userType: userType
            })
          });
          
          if (logResponse.ok) {
            const logData = await logResponse.json();
            console.log('Reset request logged:', logData);
          }
        } catch (logError) {
          console.warn('Failed to log reset request, but email was sent:', logError);
        }
        
        setSuccess(true);
        setStep(3);
        
      } catch (emailError) {
        console.error('Error sending password reset email:', emailError);
        throw emailError;
      }
    } catch (error) {
      console.error('Password reset error:', error);
      setStep(1);
      
      // Handle specific Firebase Auth errors
      if (error.code === 'auth/user-not-found') {
        setError('No account found with this email address. Please check your email or contact the administrator.');
      } else if (error.code === 'auth/invalid-email') {
        setError('Invalid email address format. Please enter a valid email.');
      } else if (error.code === 'auth/too-many-requests') {
        setError('Too many password reset attempts. Please try again later or contact the administrator.');
      } else if (error.code === 'auth/network-request-failed') {
        setError('Network error. Please check your internet connection and try again.');
      } else if (error.message && error.message.includes('sendPasswordResetEmail')) {
        setError('Failed to send reset email. Please try again or contact the administrator.');
      } else {
        setError('An error occurred while processing your request. Please try again or contact the administrator.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setEmail('');
    setError('');
    setSuccess(false);
    setStep(1);
    onClose();
  };

  if (!isOpen) return null;

  // Determine theme colors based on userType
  const isAdmin = userType === 'admin';
  const themeColors = isAdmin 
    ? {
        primary: 'from-gray-700 via-gray-800 to-gray-700',
        light: 'gray',
        icon: 'text-gray-600',
        bg: 'bg-gray-100',
        border: 'border-gray-200',
        ring: 'ring-gray-100',
        button: 'from-gray-700 to-gray-800',
        shadow: 'shadow-gray-300'
      }
    : {
        primary: 'from-green-600 via-emerald-600 to-green-600',
        light: 'green',
        icon: 'text-green-600',
        bg: 'bg-green-100',
        border: 'border-green-200',
        ring: 'ring-green-100',
        button: 'from-green-600 to-emerald-600',
        shadow: 'shadow-green-300'
      };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 animate-fadeIn">
      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl max-w-md w-full relative overflow-hidden animate-slideUp">
        {/* Decorative top gradient */}
        <div className={`absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r ${themeColors.primary}`}></div>
        
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 sm:top-4 sm:right-4 w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-all duration-200 z-10"
        >
          <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>

        <div className="p-5 sm:p-6 md:p-8">
          {/* Step 1 & 2: Email Input / Sending */}
          {!success ? (
            <>
              {/* Header */}
              <div className="text-center mb-5 sm:mb-6">
                <div className={`mx-auto w-14 h-14 sm:w-16 sm:h-16 ${themeColors.bg} rounded-2xl flex items-center justify-center mb-3 sm:mb-4 shadow-lg`}>
                  {step === 2 ? (
                    <svg className={`w-7 h-7 sm:w-8 sm:h-8 ${themeColors.icon} animate-pulse`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path>
                    </svg>
                  ) : (
                    <svg className={`w-7 h-7 sm:w-8 sm:h-8 ${themeColors.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path>
                    </svg>
                  )}
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1.5 sm:mb-2">
                  {step === 2 ? 'Sending Reset Link...' : 'Forgot Password?'}
                </h2>
                <p className="text-gray-500 text-xs sm:text-sm px-2">
                  {step === 2 
                    ? 'Please wait while we send the reset link to your email'
                    : `Enter your ${userType} email address to receive a password reset link`
                  }
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Email Field */}
                <div className="space-y-1.5">
                  <label htmlFor="reset-email" className="block text-xs sm:text-sm font-semibold text-gray-700">
                    Email Address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg className={`w-4 h-4 sm:w-5 sm:h-5 ${themeColors.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                      </svg>
                    </div>
                    <input
                      id="reset-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={loading}
                      className={`w-full pl-10 pr-4 py-2.5 sm:py-3 border-2 ${themeColors.border} rounded-xl focus:ring-4 focus:${themeColors.ring} focus:border-${themeColors.light}-500 outline-none transition-all text-sm sm:text-base disabled:bg-gray-50 disabled:cursor-not-allowed`}
                      placeholder={`${userType}@example.com`}
                      required
                    />
                  </div>
                </div>

                {/* Error Message */}
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm flex items-start gap-2 animate-shake">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <span>{error}</span>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading || !email}
                  className={`w-full bg-gradient-to-r ${themeColors.button} text-white font-semibold py-2.5 sm:py-3 px-4 rounded-xl hover:shadow-lg hover:${themeColors.shadow} transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98] text-sm sm:text-base`}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Sending...</span>
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                      </svg>
                      <span>Send Reset Link</span>
                    </span>
                  )}
                </button>

                {/* Help Text */}
                <p className="text-center text-[10px] sm:text-xs text-gray-400 pt-2">
                  A password reset link will be sent to your Gmail inbox
                </p>
              </form>
            </>
          ) : (
            /* Step 3: Success State */
            <div className="text-center">
              {/* Success Icon */}
              <div className="relative mx-auto w-16 h-16 sm:w-20 sm:h-20 mb-4 sm:mb-5">
                <div className={`absolute inset-0 ${themeColors.bg} rounded-full animate-ping opacity-30`}></div>
                <div className={`relative w-full h-full ${themeColors.bg} rounded-full flex items-center justify-center shadow-lg`}>
                  <svg className={`w-8 h-8 sm:w-10 sm:h-10 ${themeColors.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"></path>
                  </svg>
                </div>
              </div>
              
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">
                Reset Link Sent! 📧
              </h3>
              <p className="text-gray-500 text-xs sm:text-sm mb-4 sm:mb-5 px-2">
                We've sent a password reset link to <span className="font-semibold text-gray-700">{email}</span>
              </p>
              
              {/* Instructions Card */}
              <div className={`${isAdmin ? 'bg-gray-50 border-gray-200' : 'bg-green-50 border-green-200'} border rounded-xl p-3 sm:p-4 mb-4 sm:mb-5 text-left`}>
                <div className="flex items-center gap-2 mb-2 sm:mb-3">
                  <div className={`w-6 h-6 sm:w-7 sm:h-7 ${themeColors.bg} rounded-lg flex items-center justify-center`}>
                    <svg className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${themeColors.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path>
                    </svg>
                  </div>
                  <span className={`text-xs sm:text-sm font-semibold ${isAdmin ? 'text-gray-700' : 'text-green-700'}`}>What to do next:</span>
                </div>
                <ul className={`text-[10px] sm:text-xs ${isAdmin ? 'text-gray-600' : 'text-green-700'} space-y-1.5 sm:space-y-2`}>
                  <li className="flex items-start gap-2">
                    <span className={`w-4 h-4 sm:w-5 sm:h-5 ${isAdmin ? 'bg-gray-200 text-gray-600' : 'bg-green-200 text-green-700'} rounded-full flex items-center justify-center flex-shrink-0 text-[10px] sm:text-xs font-bold`}>1</span>
                    <span>Check your Gmail inbox (also check spam/junk folder)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className={`w-4 h-4 sm:w-5 sm:h-5 ${isAdmin ? 'bg-gray-200 text-gray-600' : 'bg-green-200 text-green-700'} rounded-full flex items-center justify-center flex-shrink-0 text-[10px] sm:text-xs font-bold`}>2</span>
                    <span>Click the password reset link in the email</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className={`w-4 h-4 sm:w-5 sm:h-5 ${isAdmin ? 'bg-gray-200 text-gray-600' : 'bg-green-200 text-green-700'} rounded-full flex items-center justify-center flex-shrink-0 text-[10px] sm:text-xs font-bold`}>3</span>
                    <span>Create your new secure password</span>
                  </li>
                </ul>
              </div>

              {/* Info notice */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 sm:p-3 mb-4 sm:mb-5">
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                  <div className="text-left">
                    <p className="text-[10px] sm:text-xs text-amber-700">
                      <span className="font-semibold">Note:</span> The reset link will expire in 24 hours. Your reference number is included in the email for support purposes.
                    </p>
                  </div>
                </div>
              </div>

              {/* Close Button */}
              <button
                onClick={handleClose}
                className={`w-full bg-gradient-to-r ${themeColors.button} text-white font-semibold py-2.5 sm:py-3 px-4 rounded-xl hover:shadow-lg transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] text-sm sm:text-base`}
              >
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                  <span>Got it, close</span>
                </span>
              </button>

              {/* Additional help */}
              <p className="text-[10px] sm:text-xs text-gray-400 mt-3 sm:mt-4">
                Didn't receive the email? Check your spam folder or contact the administrator
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
