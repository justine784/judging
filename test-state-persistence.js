// Test script to verify state persistence functionality
// Run this script in the browser console when on the judge dashboard

console.log('🧪 Testing Judge Dashboard State Persistence...\n');

// Test 1: Check if currentContestantIndex starts at 0
console.log('📍 Test 1: Initial Contestant Index');
console.log('Current contestant index:', window.currentContestantIndex || 'Not accessible');
console.log('Expected: 0 (Contestant 1)');

// Test 2: Check if Firestore collections exist
console.log('\n📂 Test 2: Firestore Collections Check');
if (window.firebase && window.db) {
  const collections = ['judgeUIState', 'contestants', 'scores'];
  collections.forEach(async (collectionName) => {
    try {
      const querySnapshot = await window.firebase.firestore().collection(window.db, collectionName).limit(1).get();
      console.log(`${collectionName}: ✅ Accessible (${querySnapshot.size} documents)`);
    } catch (error) {
      console.log(`${collectionName}: ❌ Error - ${error.message}`);
    }
  });
} else {
  console.log('Firebase not accessible from console');
}

// Test 3: Simulate state saving
console.log('\n💾 Test 3: State Saving Simulation');
console.log('To test state persistence:');
console.log('1. Navigate to a contestant (not Contestant 1)');
console.log('2. Enter some scores');
console.log('3. Refresh the page');
console.log('4. Check if you return to the same contestant with scores preserved');

// Test 4: Check localStorage for fallback
console.log('\n💾 Test 4: LocalStorage Check');
const keys = Object.keys(localStorage).filter(key => key.includes('judge') || key.includes('contestant'));
console.log('LocalStorage keys related to judging:', keys);
keys.forEach(key => {
  console.log(`${key}:`, localStorage.getItem(key)?.substring(0, 100) + '...');
});

// Test 5: Monitor network requests for Firestore operations
console.log('\n🌐 Test 5: Network Monitoring');
console.log('Open the Network tab in DevTools and filter for "firestore"');
console.log('Look for these operations during page load:');
console.log('- judgeUIState collection reads (state restoration)');
console.log('- Individual contestant state documents');

// Test 6: Manual state restoration check
console.log('\n🔄 Test 6: Manual State Restoration Check');
console.log('Run this after refreshing the page:');
console.log(`
// Check if state was restored
const judgeUIStateDocs = await firebase.firestore()
  .collection(db, 'judgeUIState')
  .where('judgeId', '==', user.uid)
  .where('eventId', '==', currentEvent.id)
  .get();
  
console.log('Found UI state documents:', judgeUIStateDocs.size);
judgeUIStateDocs.forEach(doc => {
  console.log('State for contestant:', doc.data().contestantId, doc.data());
});
`);

// Test 7: Verify contestant navigation state saving
console.log('\n🧭 Test 7: Navigation State Saving');
console.log('To test navigation state saving:');
console.log('1. Start at Contestant 1');
console.log('2. Navigate to Contestant 3');
console.log('3. Enter scores and submit some criteria');
console.log('4. Navigate to Contestant 5');
console.log('5. Refresh the page');
console.log('6. Expected: Should return to Contestant 5 (last viewed)');

// Test 8: Score preservation verification
console.log('\n📊 Test 8: Score Preservation Verification');
console.log('To verify score preservation:');
console.log('1. Enter scores for multiple contestants');
console.log('2. Navigate between contestants');
console.log('3. Refresh the page');
console.log('4. Check that all entered scores are still visible');

console.log('\n✅ State Persistence Test Guide Complete!');
console.log('Follow the steps above to verify all functionality works correctly.');
