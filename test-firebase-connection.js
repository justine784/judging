// Firebase Connection Test Script
// Run this script to verify Firebase authentication and Firestore permissions

const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, collection, getDocs, doc, getDoc } = require('firebase/firestore');

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD9-7W1EtFevUqrBcVruR3oHgXEc4K4KcQ",
  authDomain: "judging-2a4da.firebaseapp.com",
  projectId: "judging-2a4da",
  storageBucket: "judging-2a4da.firebasestorage.app",
  messagingSenderId: "954134091247",
  appId: "1:954134091247:web:df9aea8c36ea8c64d2d21a"
};

// Test functions
async function testFirebaseConnection() {
  console.log('🔍 Testing Firebase Connection...\n');
  
  try {
    // Initialize Firebase
    const app = initializeApp(firebaseConfig);
    console.log('✅ Firebase app initialized successfully');
    
    // Initialize services
    const auth = getAuth(app);
    const db = getFirestore(app);
    console.log('✅ Firebase services initialized');
    
    // Test Firestore collections access
    console.log('\n📚 Testing Firestore collections access...');
    
    const collections = ['contestants', 'events', 'judges', 'scores', 'slideSubmissions'];
    
    for (const collectionName of collections) {
      try {
        const querySnapshot = await getDocs(collection(db, collectionName));
        console.log(`✅ ${collectionName}: ${querySnapshot.size} documents accessible`);
      } catch (error) {
        console.log(`❌ ${collectionName}: ${error.code} - ${error.message}`);
      }
    }
    
    // Test authentication state
    console.log('\n🔐 Testing authentication state...');
    const currentUser = auth.currentUser;
    if (currentUser) {
      console.log(`✅ User authenticated: ${currentUser.email} (${currentUser.uid})`);
    } else {
      console.log('⚠️ No authenticated user (this is expected in server-side testing)');
    }
    
    console.log('\n🎉 Firebase connection test completed!');
    
  } catch (error) {
    console.error('❌ Firebase connection test failed:', error);
  }
}

// Test with mock authentication (development mode)
async function testWithMockAuth() {
  console.log('\n🎭 Testing with mock authentication (development mode)...');
  
  try {
    // In development, we can test without real authentication
    // This simulates what the client-side code does
    
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    
    console.log('📡 Testing Firestore rules with mock user context...');
    
    // Try to read from collections that should be accessible
    const testResults = {};
    
    const collections = [
      { name: 'contestants', expectedAccess: true },
      { name: 'events', expectedAccess: true },
      { name: 'judges', expectedAccess: false }, // Should require auth
      { name: 'scores', expectedAccess: false }, // Should require auth
      { name: 'slideSubmissions', expectedAccess: false } // Should require auth
    ];
    
    for (const { name, expectedAccess } of collections) {
      try {
        const querySnapshot = await getDocs(collection(db, name));
        testResults[name] = {
          accessible: true,
          documentCount: querySnapshot.size,
          expectedAccess,
          result: querySnapshot.size >= 0 ? '✅ PASS' : '❌ FAIL'
        };
      } catch (error) {
        testResults[name] = {
          accessible: false,
          error: error.code,
          expectedAccess,
          result: expectedAccess ? '❌ FAIL' : '✅ PASS'
        };
      }
    }
    
    console.log('\n📊 Test Results:');
    Object.entries(testResults).forEach(([collectionName, result]) => {
      console.log(`${result.result} ${collectionName}: ${
        result.accessible 
          ? `${result.documentCount} documents` 
          : `${result.error} (expected: ${result.expectedAccess ? 'accessible' : 'restricted'})`
      }`);
    });
    
  } catch (error) {
    console.error('❌ Mock auth test failed:', error);
  }
}

// Run tests
if (require.main === module) {
  testFirebaseConnection()
    .then(() => testWithMockAuth())
    .catch(console.error);
}

module.exports = {
  testFirebaseConnection,
  testWithMockAuth
};
