// Test script for real-time judge table updates
// Run this script to verify that the judge table updates in real-time when scores are submitted

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, onSnapshot, query, where } = require('firebase/firestore');

// Firebase configuration (replace with your actual config)
const firebaseConfig = {
  // Your Firebase config here
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Test data
const testJudgeId = 'test-judge-123';
const testEventId = 'test-event-456';
const testContestantId = 'test-contestant-789';

async function testRealtimeUpdates() {
  console.log('🧪 Testing real-time judge table updates...\n');

  // Set up listener for scores
  const scoresQuery = query(
    collection(db, 'scores'),
    where('judgeId', '==', testJudgeId),
    where('eventId', '==', testEventId)
  );

  // Listen for real-time updates
  const unsubscribe = onSnapshot(scoresQuery, (snapshot) => {
    console.log('📊 Real-time update received!');
    console.log('Documents count:', snapshot.docs.length);
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      console.log('Score document:', {
        contestantId: data.contestantId,
        contestantName: data.contestantName,
        scores: data.scores,
        totalScore: data.totalScore,
        timestamp: data.timestamp
      });
    });
    console.log('---');
  });

  // Simulate score submissions
  console.log('📤 Simulating score submissions...\n');

  // Test 1: Submit individual criteria score
  const score1 = {
    contestantId: testContestantId,
    contestantName: 'Test Contestant',
    contestantNo: '001',
    eventId: testEventId,
    eventName: 'Test Event',
    judgeId: testJudgeId,
    judgeName: 'Test Judge',
    judgeEmail: 'test@example.com',
    scores: {
      'criteria1': 85
    },
    criteria: [{ name: 'Criteria 1', weight: 50 }],
    totalScore: 42.5,
    isFinalRound: false,
    timestamp: new Date().toISOString(),
    isIndividualSubmission: true
  };

  try {
    await addDoc(collection(db, 'scores'), score1);
    console.log('✅ Submitted score for Criteria 1: 85');
    
    // Wait a moment, then submit another score
    setTimeout(async () => {
      const score2 = {
        ...score1,
        scores: {
          'criteria2': 90
        },
        totalScore: 45.0,
        timestamp: new Date().toISOString()
      };

      await addDoc(collection(db, 'scores'), score2);
      console.log('✅ Submitted score for Criteria 2: 90');

      // Wait a moment, then update the first score
      setTimeout(async () => {
        const score3 = {
          ...score1,
          scores: {
            'criteria1': 88  // Updated score
          },
          totalScore: 44.0,
          timestamp: new Date().toISOString()
        };

        await addDoc(collection(db, 'scores'), score3);
        console.log('✅ Updated score for Criteria 1: 88');

        // Clean up after test
        setTimeout(() => {
          console.log('\n🧹 Test completed! Cleaning up...');
          unsubscribe();
        }, 2000);
      }, 2000);
    }, 2000);
  } catch (error) {
    console.error('❌ Error submitting test scores:', error);
    unsubscribe();
  }
}

// Run the test
testRealtimeUpdates().catch(console.error);
