// Test script to verify live scoreboard updates for individual criteria scoring
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, onSnapshot, query, where } = require('firebase/firestore');

// Firebase configuration (use the same config as your app)
const firebaseConfig = {
  // Add your Firebase config here or import from your config file
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Test data
const testEventId = 'test-event-id';
const testContestantId = 'test-contestant-id';
const testJudgeId = 'test-judge-id';

// Test individual criteria submission
async function testIndividualCriteriaSubmission() {
  console.log('🧪 Testing Individual Criteria Submission for Live Scoreboard...');
  
  try {
    // Simulate Judge 1 submitting Criteria 1
    const score1 = {
      contestantId: testContestantId,
      contestantName: 'Test Contestant',
      contestantNo: '001',
      eventId: testEventId,
      eventName: 'Test Event',
      judgeId: 'judge1',
      judgeName: 'Judge 1',
      judgeEmail: 'judge1@test.com',
      scores: {
        'criteria1': 9
      },
      criteria: [{ name: 'Criteria 1', weight: 50, enabled: true }],
      totalScore: 4.5, // 9 * 0.5 weight
      isFinalRound: false,
      timestamp: new Date().toISOString(),
      isIndividualSubmission: true
    };
    
    const docRef1 = await addDoc(collection(db, 'scores'), score1);
    console.log('✅ Judge 1 - Criteria 1 submitted:', docRef1.id);
    
    // Wait a moment to see if live scoreboard updates
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Simulate Judge 2 submitting Criteria 1
    const score2 = {
      contestantId: testContestantId,
      contestantName: 'Test Contestant',
      contestantNo: '001',
      eventId: testEventId,
      eventName: 'Test Event',
      judgeId: 'judge2',
      judgeName: 'Judge 2',
      judgeEmail: 'judge2@test.com',
      scores: {
        'criteria1': 8
      },
      criteria: [{ name: 'Criteria 1', weight: 50, enabled: true }],
      totalScore: 4.0, // 8 * 0.5 weight
      isFinalRound: false,
      timestamp: new Date().toISOString(),
      isIndividualSubmission: true
    };
    
    const docRef2 = await addDoc(collection(db, 'scores'), score2);
    console.log('✅ Judge 2 - Criteria 1 submitted:', docRef2.id);
    
    // Wait a moment to see if live scoreboard updates
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Simulate Judge 1 submitting Criteria 2
    const score3 = {
      contestantId: testContestantId,
      contestantName: 'Test Contestant',
      contestantNo: '001',
      eventId: testEventId,
      eventName: 'Test Event',
      judgeId: 'judge1',
      judgeName: 'Judge 1',
      judgeEmail: 'judge1@test.com',
      scores: {
        'criteria2': 7
      },
      criteria: [
        { name: 'Criteria 1', weight: 50, enabled: true },
        { name: 'Criteria 2', weight: 50, enabled: true }
      ],
      totalScore: 8.0, // (9*0.5) + (7*0.5) = 4.5 + 3.5 = 8.0
      isFinalRound: false,
      timestamp: new Date().toISOString(),
      isIndividualSubmission: true
    };
    
    const docRef3 = await addDoc(collection(db, 'scores'), score3);
    console.log('✅ Judge 1 - Criteria 2 submitted:', docRef3.id);
    
    console.log('🎉 All test scores submitted. Check the live scoreboard for real-time updates.');
    console.log('Expected behavior:');
    console.log('- After Judge 1 submits Criteria 1: Contestant should show score 4.5');
    console.log('- After Judge 2 submits Criteria 1: Contestant should show average (4.5 + 4.0) / 2 = 4.25');
    console.log('- After Judge 1 submits Criteria 2: Contestant should show total with both criteria');
    
  } catch (error) {
    console.error('❌ Error during test:', error);
  }
}

// Listen to real-time updates from scores collection
function listenToScoresUpdates() {
  console.log('👂 Listening to real-time scores updates...');
  
  const scoresQuery = query(collection(db, 'scores'), where('eventId', '==', testEventId));
  
  const unsubscribe = onSnapshot(scoresQuery, (snapshot) => {
    console.log('📊 Live Scoreboard Update - Scores changed:', snapshot.docs.length, 'documents');
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      console.log(`  - ${data.judgeName}: ${JSON.stringify(data.scores)} (Total: ${data.totalScore})`);
    });
    
    // Simulate the aggregation logic from live scoreboard
    const aggregatedScores = aggregateScores(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    console.log('📈 Aggregated result:', aggregatedScores);
  });
  
  return unsubscribe;
}

// Simulate the live scoreboard aggregation logic
function aggregateScores(scores) {
  const contestantScores = scores.filter(score => score.contestantId === testContestantId);
  
  if (contestantScores.length === 0) {
    return { totalScore: 0, judgeCount: 0, criteriaScores: {} };
  }
  
  // Aggregate all scores from each judge (merge individual criteria submissions)
  const aggregatedScoresByJudge = {};
  contestantScores.forEach(score => {
    const judgeId = score.judgeId;
    if (!aggregatedScoresByJudge[judgeId]) {
      aggregatedScoresByJudge[judgeId] = {
        judgeId: judgeId,
        judgeName: score.judgeName,
        scores: {},
        totalScore: 0,
        timestamp: score.timestamp
      };
    }
    
    // Merge scores from this submission
    Object.assign(aggregatedScoresByJudge[judgeId].scores, score.scores || {});
    
    // Update timestamp if this is more recent
    if (new Date(score.timestamp) > new Date(aggregatedScoresByJudge[judgeId].timestamp)) {
      aggregatedScoresByJudge[judgeId].timestamp = score.timestamp;
    }
  });
  
  // Calculate total scores for each judge based on merged criteria scores
  const judgeScoresList = Object.values(aggregatedScoresByJudge);
  
  judgeScoresList.forEach(judgeScore => {
    let totalScore = 0;
    
    // Simple calculation for test (Criteria 1: weight 50%, Criteria 2: weight 50%)
    const criteria1Score = judgeScore.scores['criteria1'] || 0;
    const criteria2Score = judgeScore.scores['criteria2'] || 0;
    
    totalScore = (criteria1Score * 0.5) + (criteria2Score * 0.5);
    judgeScore.totalScore = parseFloat(totalScore.toFixed(1)) || 0;
  });
  
  // Calculate average of all judges' totalScores
  const totalScoreSum = judgeScoresList.reduce((sum, score) => sum + (score.totalScore || 0), 0);
  const totalScore = judgeScoresList.length > 0 ? totalScoreSum / judgeScoresList.length : 0;
  
  // Calculate criteria averages
  const criteriaScores = {};
  const criteria1Values = judgeScoresList.map(judge => judge.scores['criteria1'] || 0).filter(val => val > 0);
  const criteria2Values = judgeScoresList.map(judge => judge.scores['criteria2'] || 0).filter(val => val > 0);
  
  if (criteria1Values.length > 0) {
    criteriaScores['criteria1'] = criteria1Values.reduce((sum, val) => sum + val, 0) / criteria1Values.length;
  }
  if (criteria2Values.length > 0) {
    criteriaScores['criteria2'] = criteria2Values.reduce((sum, val) => sum + val, 0) / criteria2Values.length;
  }
  
  return {
    totalScore: parseFloat(totalScore.toFixed(1)),
    judgeCount: judgeScoresList.length,
    criteriaScores,
    judgeBreakdown: judgeScoresList
  };
}

// Run the test
async function runTest() {
  console.log('🚀 Starting Live Scoreboard Individual Criteria Test...');
  
  const unsubscribe = listenToScoresUpdates();
  
  // Wait a moment for listener to set up
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  await testIndividualCriteriaSubmission();
  
  // Keep listening for updates
  console.log('🔄 Test complete. Keep listening for updates for 30 seconds...');
  setTimeout(() => {
    unsubscribe();
    console.log('✅ Test finished. Unsubscribed from updates.');
  }, 30000);
}

// Run if this script is executed directly
if (require.main === module) {
  runTest().catch(console.error);
}

module.exports = {
  testIndividualCriteriaSubmission,
  listenToScoresUpdates,
  aggregateScores
};
