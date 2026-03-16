// Test script to verify Firestore permissions
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, onSnapshot } = require('firebase/firestore');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');

// Firebase configuration
const firebaseConfig = {
  // Add your Firebase config here
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function testPermissions() {
  try {
    console.log('Testing Firestore permissions...');
    
    // Test 1: Read contestants collection
    console.log('\n1. Testing contestants collection read...');
    const contestantsQuery = collection(db, 'contestants');
    const contestantsSnapshot = await getDocs(contestantsQuery);
    console.log(`✓ Successfully read ${contestantsSnapshot.size} contestants`);
    
    // Test 2: Read events collection
    console.log('\n2. Testing events collection read...');
    const eventsQuery = collection(db, 'events');
    const eventsSnapshot = await getDocs(eventsQuery);
    console.log(`✓ Successfully read ${eventsSnapshot.size} events`);
    
    // Test 3: Real-time listener for contestants
    console.log('\n3. Testing real-time listener for contestants...');
    const unsubscribe = onSnapshot(contestantsQuery, (snapshot) => {
      console.log(`✓ Real-time update received: ${snapshot.size} contestants`);
      unsubscribe();
    });
    
    // Test 4: Real-time listener for events
    console.log('\n4. Testing real-time listener for events...');
    const unsubscribeEvents = onSnapshot(eventsQuery, (snapshot) => {
      console.log(`✓ Real-time update received: ${snapshot.size} events`);
      unsubscribeEvents();
    });
    
    console.log('\n✅ All permission tests passed!');
    
  } catch (error) {
    console.error('❌ Permission test failed:', error.code, error.message);
  }
}

// Run the test
testPermissions();
