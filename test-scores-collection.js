// Script to verify scores collection setup
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { firebaseConfig } from '../src/lib/firebase';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Test scores collection
const testScoresCollection = async () => {
  try {
    console.log('Testing scores collection...');
    
    // Create a test score document
    const testScore = {
      contestantId: 'test-contestant',
      contestantName: 'Test Contestant',
      contestantNo: '001',
      eventId: 'test-event',
      eventName: 'Test Event',
      judgeId: 'test-judge',
      judgeName: 'Test Judge',
      judgeEmail: 'test@example.com',
      scores: {
        'vocal_quality': 85,
        'stage_presence': 90,
        'song_interpretation': 80
      },
      criteria: [
        { name: 'Vocal Quality', weight: 40, enabled: true },
        { name: 'Stage Presence', weight: 30, enabled: true },
        { name: 'Song Interpretation', weight: 20, enabled: true }
      ],
      totalScore: 85.0,
      timestamp: new Date().toISOString(),
      createdAt: serverTimestamp()
    };
    
    // Save to scores collection
    const docRef = await addDoc(collection(db, 'scores'), testScore);
    console.log('✅ Test score saved successfully with ID:', docRef.id);
    
    // Read it back to verify
    const scoresCollection = collection(db, 'scores');
    const snapshot = await getDocs(scoresCollection);
    console.log(`✅ Scores collection has ${snapshot.size} documents`);
    
    return true;
  } catch (error) {
    console.error('❌ Error testing scores collection:', error);
    return false;
  }
};

// Run the test
testScoresCollection().then(success => {
  if (success) {
    console.log('🎉 Scores collection is working correctly!');
  } else {
    console.log('💥 Scores collection test failed!');
  }
});
