// Debug script to identify permission issues
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { app } from './src/lib/firebase.js';

const auth = getAuth(app);
const db = getFirestore(app);

console.log('🔍 Starting Firebase permission debug...');

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    console.log('❌ No user authenticated');
    return;
  }
  
  console.log('✅ User authenticated:', user.email, 'UID:', user.uid);
  
  // Check if user exists in judges collection
  try {
    const judgeDoc = await getDoc(doc(db, 'judges', user.uid));
    if (judgeDoc.exists()) {
      const judgeData = judgeDoc.data();
      console.log('✅ Judge document found:', judgeData);
      
      // Test each collection listener
      console.log('\n📡 Testing collection listeners...');
      
      // Test events collection
      try {
        const unsubscribeEvents = onSnapshot(collection(db, 'events'), (snapshot) => {
          console.log('✅ Events listener - SUCCESS:', snapshot.size, 'documents');
          unsubscribeEvents();
        }, (error) => {
          console.error('❌ Events listener - ERROR:', error.code, error.message);
        });
      } catch (error) {
        console.error('❌ Events listener - CATCH ERROR:', error);
      }
      
      // Test contestants collection
      try {
        const unsubscribeContestants = onSnapshot(collection(db, 'contestants'), (snapshot) => {
          console.log('✅ Contestants listener - SUCCESS:', snapshot.size, 'documents');
          unsubscribeContestants();
        }, (error) => {
          console.error('❌ Contestants listener - ERROR:', error.code, error.message);
        });
      } catch (error) {
        console.error('❌ Contestants listener - CATCH ERROR:', error);
      }
      
      // Test scores collection
      try {
        const unsubscribeScores = onSnapshot(collection(db, 'scores'), (snapshot) => {
          console.log('✅ Scores listener - SUCCESS:', snapshot.size, 'documents');
          unsubscribeScores();
        }, (error) => {
          console.error('❌ Scores listener - ERROR:', error.code, error.message);
        });
      } catch (error) {
        console.error('❌ Scores listener - CATCH ERROR:', error);
      }
      
      // Test judges collection
      try {
        const unsubscribeJudges = onSnapshot(collection(db, 'judges'), (snapshot) => {
          console.log('✅ Judges listener - SUCCESS:', snapshot.size, 'documents');
          unsubscribeJudges();
        }, (error) => {
          console.error('❌ Judges listener - ERROR:', error.code, error.message);
        });
      } catch (error) {
        console.error('❌ Judges listener - CATCH ERROR:', error);
      }
      
    } else {
      console.log('❌ Judge document not found for UID:', user.uid);
    }
  } catch (error) {
    console.error('❌ Error checking judge document:', error.code, error.message);
  }
});

// Also check for managescore user
console.log('\n🔧 Checking for managescore user...');
onAuthStateChanged(auth, (user) => {
  if (user && user.email === 'managescore@gmail.com') {
    console.log('✅ Managescore user detected');
  }
});
