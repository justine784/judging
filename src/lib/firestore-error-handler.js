'use client';

import { doc, onSnapshot, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

// Connection state tracking
let connectionState = {
  isConnected: true,
  retryCount: 0,
  maxRetries: 5,
  retryDelay: 1000,
  listeners: new Map()
};

// Exponential backoff function
const getRetryDelay = (attempt) => {
  const baseDelay = 1000;
  const maxDelay = 30000;
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  return delay + Math.random() * 1000; // Add jitter
};

// Connection status monitoring
const monitorConnection = () => {
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      console.log('Network connection restored');
      connectionState.isConnected = true;
      connectionState.retryCount = 0;
    });

    window.addEventListener('offline', () => {
      console.warn('Network connection lost');
      connectionState.isConnected = false;
    });
  }
};

// Enhanced onSnapshot with retry logic
export function onSnapshotWithRetry(docRef, callback, errorCallback) {
  const listenerId = Math.random().toString(36).substr(2, 9);
  
  const attemptSnapshot = (attempt = 0) => {
    if (attempt >= connectionState.maxRetries) {
      console.error('Max retry attempts reached for Firestore listener');
      errorCallback && errorCallback(new Error('Max retry attempts reached'));
      return;
    }

    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        connectionState.retryCount = 0;
        connectionState.isConnected = true;
        callback(snapshot);
      },
      (error) => {
        console.warn(`Firestore listener error (attempt ${attempt + 1}):`, error);
        
        // Check if it's a connection error
        if (error.code === 'unavailable' || 
            error.code === 'deadline-exceeded' ||
            error.message.includes('QUIC') ||
            error.message.includes('timeout')) {
          
          connectionState.isConnected = false;
          connectionState.retryCount = attempt + 1;
          
          // Retry with exponential backoff
          const delay = getRetryDelay(attempt);
          console.log(`Retrying Firestore connection in ${delay}ms...`);
          
          setTimeout(() => {
            attemptSnapshot(attempt + 1);
          }, delay);
        } else {
          // For non-connection errors, call error callback immediately
          errorCallback && errorCallback(error);
        }
      }
    );

    // Store unsubscribe function
    connectionState.listeners.set(listenerId, unsubscribe);
    
    return unsubscribe;
  };

  return attemptSnapshot();
}

// Enhanced getDoc with retry logic
export async function getDocWithRetry(docRef, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const docSnap = await getDoc(docRef);
      connectionState.isConnected = true;
      connectionState.retryCount = 0;
      return docSnap;
    } catch (error) {
      console.warn(`getDoc error (attempt ${attempt + 1}):`, error);
      
      // Check if it's a connection error
      if (error.code === 'unavailable' || 
          error.code === 'deadline-exceeded' ||
          error.message.includes('QUIC') ||
          error.message.includes('timeout')) {
        
        if (attempt === maxRetries - 1) {
          throw error;
        }
        
        // Wait before retrying
        const delay = getRetryDelay(attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // For non-connection errors, throw immediately
        throw error;
      }
    }
  }
}

// Enhanced setDoc with retry logic
export async function setDocWithRetry(docRef, data, options = {}, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await setDoc(docRef, data, options);
      connectionState.isConnected = true;
      connectionState.retryCount = 0;
      return;
    } catch (error) {
      console.warn(`setDoc error (attempt ${attempt + 1}):`, error);
      
      // Check if it's a connection error
      if (error.code === 'unavailable' || 
          error.code === 'deadline-exceeded' ||
          error.message.includes('QUIC') ||
          error.message.includes('timeout')) {
        
        if (attempt === maxRetries - 1) {
          throw error;
        }
        
        // Wait before retrying
        const delay = getRetryDelay(attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // For non-connection errors, throw immediately
        throw error;
      }
    }
  }
}

// Enhanced updateDoc with retry logic
export async function updateDocWithRetry(docRef, data, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await updateDoc(docRef, data);
      connectionState.isConnected = true;
      connectionState.retryCount = 0;
      return;
    } catch (error) {
      console.warn(`updateDoc error (attempt ${attempt + 1}):`, error);
      
      // Check if it's a connection error
      if (error.code === 'unavailable' || 
          error.code === 'deadline-exceeded' ||
          error.message.includes('QUIC') ||
          error.message.includes('timeout')) {
        
        if (attempt === maxRetries - 1) {
          throw error;
        }
        
        // Wait before retrying
        const delay = getRetryDelay(attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // For non-connection errors, throw immediately
        throw error;
      }
    }
  }
}

// Get connection status
export function getConnectionStatus() {
  return {
    isConnected: connectionState.isConnected,
    retryCount: connectionState.retryCount,
    maxRetries: connectionState.maxRetries
  };
}

// Cleanup all listeners
export function cleanupAllListeners() {
  connectionState.listeners.forEach(unsubscribe => {
    unsubscribe();
  });
  connectionState.listeners.clear();
}

// Initialize connection monitoring
if (typeof window !== 'undefined') {
  monitorConnection();
}

export default {
  onSnapshotWithRetry,
  getDocWithRetry,
  setDocWithRetry,
  updateDocWithRetry,
  getConnectionStatus,
  cleanupAllListeners
};
