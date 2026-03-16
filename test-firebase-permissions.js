// Test Firebase permissions and authentication
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, collection, onSnapshot } from 'firebase/firestore';

console.log('Testing Firebase permissions...');

// Test 1: Check authentication state
auth.onAuthStateChanged((user) => {
  console.log('Auth state changed:', user);
  if (user) {
    console.log('User is authenticated:', {
      uid: user.uid,
      email: user.email,
      emailVerified: user.emailVerified
    });
  } else {
    console.log('User is not authenticated');
  }
});

// Test 2: Try to read from contestants collection
const testContestantsRead = async () => {
  try {
    const contestantsRef = collection(db, 'contestants');
    const unsubscribe = onSnapshot(contestantsRef, (snapshot) => {
      console.log('✅ Contestants collection read successfully');
      console.log('Number of contestants:', snapshot.docs.length);
      unsubscribe();
    }, (error) => {
      console.error('❌ Error reading contestants collection:', error);
    });
  } catch (error) {
    console.error('❌ Error setting up contestants listener:', error);
  }
};

// Test 3: Try to read from events collection
const testEventsRead = async () => {
  try {
    const eventsRef = collection(db, 'events');
    const unsubscribe = onSnapshot(eventsRef, (snapshot) => {
      console.log('✅ Events collection read successfully');
      console.log('Number of events:', snapshot.docs.length);
      unsubscribe();
    }, (error) => {
      console.error('❌ Error reading events collection:', error);
    });
  } catch (error) {
    console.error('❌ Error setting up events listener:', error);
  }
};

// Test 4: Try to read from judges collection
const testJudgesRead = async () => {
  try {
    const judgesRef = collection(db, 'judges');
    const unsubscribe = onSnapshot(judgesRef, (snapshot) => {
      console.log('✅ Judges collection read successfully');
      console.log('Number of judges:', snapshot.docs.length);
      unsubscribe();
    }, (error) => {
      console.error('❌ Error reading judges collection:', error);
    });
  } catch (error) {
    console.error('❌ Error setting up judges listener:', error);
  }
};

// Run all tests
testContestantsRead();
testEventsRead();
testJudgesRead();

console.log('Firebase permission tests initiated...');
