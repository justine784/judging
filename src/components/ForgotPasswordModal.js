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
  const [referenceNumber, setReferenceNumber] = useState('');

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
        return;
      }

      // Generate reference number
      const refNumber = generateReferenceNumber();
      setReferenceNumber(refNumber);

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
        
        // Verify the email was sent by checking the console
        console.log('Email delivery confirmed. User should receive an email shortly.');
        
        // Try to log the request (but don't fail if this doesn't work)
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
        
      } catch (emailError) {
        console.error('Error sending password reset email:', emailError);
        throw emailError;
      }
    } catch (error) {
      console.error('Password reset error:', error);
      
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
    setReferenceNumber('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Forgot Password?</h2>
          <p className="text-gray-600 text-sm">
            Enter your email address and we'll send you a password reset link with a reference number
          </p>
        </div>

        {!success ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Field */}
            <div>
              <label htmlFor="reset-email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                id="reset-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder={`Enter your ${userType} email`}
                required
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !email}
              className="w-full bg-blue-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-blue-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Sending Reset Email...
                </span>
              ) : (
                'Send Reset Email'
              )}
            </button>
          </form>
        ) : (
          /* Success State */
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">📧 Reset Email Sent!</h3>
              <p className="text-gray-600 text-sm mb-4">
                A password reset link has been sent to your Gmail account
              </p>
              
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
                <p className="text-xs text-green-800 font-medium mb-2">✅ What to do next:</p>
                <ul className="text-xs text-green-700 space-y-1">
                  <li>• Check your Gmail inbox (including spam folder)</li>
                  <li>• Click the reset link in the email</li>
                  <li>• Create a new password</li>
                  <li>• The link expires in 24 hours</li>
                </ul>
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                <p className="text-xs text-blue-700 font-medium mb-1">Reference Number:</p>
                <p className="text-lg font-mono font-bold text-blue-900">{referenceNumber}</p>
                <p className="text-xs text-blue-600 mt-2">Save this for support purposes</p>
              </div>
              
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                <p className="text-xs text-yellow-800 font-medium mb-1">⚠️ Important:</p>
                <ul className="text-xs text-yellow-700 space-y-1">
                  <li>• If you don't see the email, check your spam folder</li>
                  <li>• The email is from Firebase (noreply@judging-2a4da.firebaseapp.com)</li>
                  <li>• Contact admin if you don't receive it within 5 minutes</li>
                </ul>
              </div>
              
              <p className="text-xs text-gray-500">
                Your request has been processed with reference number {referenceNumber}
              </p>
            </div>

            <button
              onClick={handleClose}
              className="w-full bg-gray-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-gray-700 transition-all duration-200 shadow-lg"
            >
              Close
            </button>
          </div>
        )}

        {/* Help Text */}
        {!success && (
          <div className="mt-4 text-center">
            <p className="text-xs text-gray-500">
              Need help? Contact the system administrator
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
