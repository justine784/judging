// Test script for persistent scoring state functionality
// Run this script to verify that UI state persists across page refreshes

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, getDoc, doc, query, where, getDocs } = require('firebase/firestore');

// Firebase configuration (replace with your actual config)
const firebaseConfig = {
  // Your Firebase config here
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function testPersistentState() {
  console.log('🧪 Testing persistent scoring state...\n');

  // Test data
  const testJudgeId = 'test-judge-persistent';
  const testEventId = 'test-event-persistent';
  const testContestantId1 = 'test-contestant-1';
  const testContestantId2 = 'test-contestant-2';

  try {
    // Test 1: Create UI state entries
    console.log('📝 Creating test UI state entries...');
    
    // Create UI state for contestant 1 at criteria 2
    const uiState1 = {
      judgeId: testJudgeId,
      eventId: testEventId,
      contestantId: testContestantId1,
      currentCriteriaIndex: 2,
      isCriteriaLocked: false,
      lastUpdated: new Date().toISOString(),
      scoringMode: 'individual'
    };
    
    await setDoc(doc(db, 'judgeUIState', `${testJudgeId}_${testEventId}_${testContestantId1}`), uiState1);
    console.log('✅ Created UI state for contestant 1 at criteria 2');

    // Create UI state for contestant 2 as locked
    const uiState2 = {
      judgeId: testJudgeId,
      eventId: testEventId,
      contestantId: testContestantId2,
      currentCriteriaIndex: -1, // -1 indicates all criteria completed
      isCriteriaLocked: true,
      lastUpdated: new Date().toISOString(),
      scoringMode: 'all'
    };
    
    await setDoc(doc(db, 'judgeUIState', `${testJudgeId}_${testEventId}_${testContestantId2}`), uiState2);
    console.log('✅ Created UI state for contestant 2 as locked');

    // Test 2: Load and verify UI state restoration
    console.log('\n📂 Testing UI state restoration...');
    
    const uiStateQuery = query(
      collection(db, 'judgeUIState'),
      where('judgeId', '==', testJudgeId),
      where('eventId', '==', testEventId)
    );
    
    const querySnapshot = await getDocs(uiStateQuery);
    const uiStates = {};
    
    querySnapshot.forEach(doc => {
      const data = doc.data();
      uiStates[data.contestantId] = data;
      console.log(`📊 Loaded UI state for ${data.contestantId}:`, {
        currentCriteriaIndex: data.currentCriteriaIndex,
        isCriteriaLocked: data.isCriteriaLocked,
        scoringMode: data.scoringMode,
        lastUpdated: data.lastUpdated
      });
    });

    // Test 3: Verify restoration logic
    console.log('\n🔍 Verifying restoration logic...');
    
    // Find most recent contestant (should be contestant 2)
    let latestTimestamp = null;
    let latestContestantId = null;
    
    Object.keys(uiStates).forEach(contestantId => {
      const state = uiStates[contestantId];
      if (state.lastUpdated && (!latestTimestamp || state.lastUpdated > latestTimestamp)) {
        latestTimestamp = state.lastUpdated;
        latestContestantId = contestantId;
      }
    });
    
    console.log(`📊 Most recent contestant: ${latestContestantId}`);
    console.log(`📊 Expected: contestant 2 (locked) should be most recent`);

    // Verify the logic works correctly
    if (latestContestantId === testContestantId2) {
      console.log('✅ Restoration logic working correctly');
    } else {
      console.log('❌ Restoration logic failed');
    }

    // Test 4: Simulate page refresh scenario
    console.log('\n🔄 Simulating page refresh scenario...');
    console.log('📝 In a real page refresh, the system would:');
    console.log(`   1. Load UI states from Firestore`);
    console.log(`   2. Find contestant 2 (most recent)`);
    console.log(`   3. Restore to contestant 2`);
    console.log(`   4. Show contestant 2 as locked`);
    console.log(`   5. Judge can continue scoring other contestants`);

    // Cleanup test data
    console.log('\n🧹 Cleaning up test data...');
    const cleanupPromises = [];
    
    querySnapshot.forEach(doc => {
      cleanupPromises.push(deleteDoc(doc.ref));
    });
    
    await Promise.all(cleanupPromises);
    console.log('✅ Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testPersistentState().catch(console.error);
