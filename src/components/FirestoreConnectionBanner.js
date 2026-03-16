'use client';

import { useState, useEffect } from 'react';

export default function FirestoreConnectionBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState('');

  useEffect(() => {
    // Listen for console errors related to Firestore
    const originalConsoleError = console.error;
    
    console.error = (...args) => {
      const message = args.join(' ');
      
      // Check for Firestore connection errors
      if (message.includes('QUIC_PROTOCOL_ERROR') || 
          message.includes('CONNECTION_TIMED_OUT') ||
          message.includes('WebChannelConnection') ||
          message.includes('ERR_QUIC')) {
        
        setConnectionMessage('Experiencing connection issues. Retrying...');
        setShowBanner(true);
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
          setShowBanner(false);
        }, 5000);
      }
      
      // Call original console.error
      originalConsoleError.apply(console, args);
    };

    return () => {
      console.error = originalConsoleError;
    };
  }, []);

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 bg-yellow-50 border border-yellow-200 rounded-lg p-4 shadow-lg">
      <div className="flex items-center space-x-3">
        <div className="flex-shrink-0">
          <div className="w-4 h-4 bg-yellow-400 rounded-full animate-pulse"></div>
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-yellow-800">
            {connectionMessage}
          </p>
          <p className="text-xs text-yellow-600 mt-1">
            This is normal during unstable network conditions. Your data will be saved when connection is restored.
          </p>
        </div>
        <button
          onClick={() => setShowBanner(false)}
          className="flex-shrink-0 text-yellow-600 hover:text-yellow-800"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  );
}
