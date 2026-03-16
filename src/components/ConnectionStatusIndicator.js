'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getConnectionStatus } from '@/lib/firestore-error-handler';

export default function ConnectionStatusIndicator() {
  const [connectionStatus, setConnectionStatus] = useState({
    isConnected: true,
    retryCount: 0,
    maxRetries: 5
  });
  
  const previousStatusRef = useRef(null);

  const updateConnectionStatus = useCallback(() => {
    const status = getConnectionStatus();
    // Only update if status has actually changed
    setConnectionStatus(prev => {
      const hasChanged = JSON.stringify(prev) !== JSON.stringify(status);
      return hasChanged ? status : prev;
    });
  }, []);

  useEffect(() => {
    // Initial update
    updateConnectionStatus();

    // Update status every 2 seconds
    const interval = setInterval(updateConnectionStatus, 2000);

    // Listen for online/offline events
    const handleOnline = () => {
      setConnectionStatus(prev => ({ ...prev, isConnected: true, retryCount: 0 }));
    };

    const handleOffline = () => {
      setConnectionStatus(prev => ({ ...prev, isConnected: false }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [updateConnectionStatus]);

  const getStatusColor = () => {
    if (!connectionStatus.isConnected) return 'bg-red-500';
    if (connectionStatus.retryCount > 0) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getStatusText = () => {
    if (!connectionStatus.isConnected) return 'Offline';
    if (connectionStatus.retryCount > 0) return `Reconnecting... (${connectionStatus.retryCount}/${connectionStatus.maxRetries})`;
    return 'Connected';
  };

  return (
    <div className="fixed top-4 right-4 z-50 flex items-center space-x-2 bg-white rounded-lg shadow-lg px-3 py-2 border border-gray-200">
      <div className={`w-3 h-3 rounded-full ${getStatusColor()} ${connectionStatus.isConnected ? 'animate-pulse' : ''}`}></div>
      <span className="text-sm font-medium text-gray-700">
        {getStatusText()}
      </span>
    </div>
  );
}
