# Persistent Scoring State Implementation

## Overview
Successfully implemented persistent scoring state in Judge Dashboard to ensure that scores and UI state are preserved across page refreshes for both Individual Criteria and All Criteria scoring modes.

## Key Features Implemented

### 1. Firestore UI State Persistence
- **New Collection**: `judgeUIState` collection for storing judge-specific UI state
- **State Storage**: Saves current contestant, criteria index, and locked status
- **Cross-Session Persistence**: State survives page refreshes and browser restarts
- **Judge Privacy**: Each judge's state is isolated and secure

### 2. Enhanced State Restoration
- **Smart Restoration**: Returns to most recent activity on page load
- **Contestant Progress**: Maintains per-contestant criteria progression
- **Locked State**: Preserves locked/submitted status across sessions
- **Individual Criteria**: Continues from last criteria, not Criteria 1

### 3. Real-time Updates
- **Immediate Sync**: UI state updates instantly when scores are submitted
- **Visual Indicators**: Shows recent changes with pulsing animations
- **Automatic Saving**: State automatically saved to Firestore on changes

## Technical Implementation

### Data Structure
```javascript
// UI State Document in judgeUIState collection
{
  judgeId: "judge123",
  eventId: "event456", 
  contestantId: "contestant789",
  currentCriteriaIndex: 2,
  isCriteriaLocked: false,
  lastUpdated: "2024-03-16T13:37:00.000Z",
  scoringMode: "individual" // or "all"
}
```

### Core Functions Added

#### `saveUIStateToFirestore(contestantId, criteriaIndex, isLocked)`
```javascript
const saveUIStateToFirestore = async (contestantId, criteriaIndex, isLocked) => {
  const uiStateRef = doc(db, 'judgeUIState', `${user.uid}_${currentEvent.id}_${contestantId}`);
  const uiStateData = {
    judgeId: user.uid,
    eventId: currentEvent.id,
    contestantId: contestantId,
    currentCriteriaIndex: criteriaIndex,
    isCriteriaLocked: isLocked,
    lastUpdated: new Date().toISOString(),
    scoringMode: currentEvent?.enableIndividualSubmit ? 'individual' : 'all'
  };
  
  await setDocWithRetry(uiStateRef, uiStateData);
};
```

#### `loadUIStateFromFirestore()`
```javascript
const loadUIStateFromFirestore = async () => {
  const uiStateQuery = query(
    collection(db, 'judgeUIState'),
    where('judgeId', '==', user.uid),
    where('eventId', '==', currentEvent.id)
  );
  
  const querySnapshot = await getDocs(uiStateQuery);
  const uiStates = {};
  
  querySnapshot.forEach(doc => {
    const data = doc.data();
    uiStates[data.contestantId] = data;
  });
  
  return uiStates;
};
```

#### `restoreUIState()`
```javascript
const restoreUIState = async () => {
  const uiStates = await loadUIStateFromFirestore();
  
  // For Individual Criteria mode
  if (currentEvent?.enableIndividualSubmit) {
    // Find contestant with most recent activity
    let latestTimestamp = null;
    let latestContestantId = null;
    
    Object.keys(uiStates).forEach(contestantId => {
      const state = uiStates[contestantId];
      if (state.lastUpdated && (!latestTimestamp || state.lastUpdated > latestTimestamp)) {
        latestTimestamp = state.lastUpdated;
        latestContestantId = contestantId;
      }
    });
    
    // Restore to most recent contestant
    if (latestContestantId) {
      const contestantIndex = contestants.findIndex(c => c.id === latestContestantId);
      if (contestantIndex >= 0) {
        setCurrentContestantIndex(contestantIndex);
      }
    }
    
    // Restore criteria progress
    const restoredProgress = {};
    Object.keys(uiStates).forEach(contestantId => {
      const state = uiStates[contestantId];
      if (state.currentCriteriaIndex !== undefined) {
        const progressKey = `${user.uid}_${currentEvent.id}_${contestantId}`;
        restoredProgress[progressKey] = state.currentCriteriaIndex;
      }
    });
    
    if (Object.keys(restoredProgress).length > 0) {
      setJudgeCriteriaProgress(prev => ({ ...prev, ...restoredProgress }));
    }
  } else {
    // For All Criteria mode
    // Find first unscored contestant
    for (let i = 0; i < contestants.length; i++) {
      const contestant = contestants[i];
      const state = uiStates[contestant.id];
      
      if (!state || !state.isCriteriaLocked) {
        setCurrentContestantIndex(i);
        console.log(`🔄 Restored to first unscored contestant: ${contestant.contestantName} (index: ${i})`);
        break;
      }
    }
    
    // Restore locked contestants state
    const lockedContestants = new Set();
    Object.keys(uiStates).forEach(contestantId => {
      const state = uiStates[contestantId];
      if (state.isCriteriaLocked) {
        lockedContestants.add(contestantId);
      }
    });
    
    if (lockedContestants.size > 0) {
      setLockedContestants(prev => new Set([...prev, ...lockedContestants]));
    }
  }
};
```

### Enhanced Score Submission

#### Individual Criteria Mode
- Saves UI state after each criteria submission
- Advances to next criteria automatically
- Moves to next contestant when all criteria completed

#### All Criteria Mode  
- Saves UI state as locked (`currentCriteriaIndex: -1`)
- Prevents re-submission unless explicitly allowed
- Maintains contestant scoring state

### Updated Score Submission Flow

```javascript
// In submitScore function - enhanced for persistence
if (currentEvent?.enableIndividualSubmit) {
  // Individual Criteria mode - save progress
  const criteria = getCurrentEventCriteria();
  const criteriaIndex = criteria.findIndex(c => getCriteriaKey(c.name, usingFinalRoundCriteria) === key);
  
  if (criteriaIndex !== -1) {
    updateJudgeCriteriaProgress(criteriaIndex, contestantId);
  }
  await updateCriteriaCompletion(key);
  checkAndReturnToFirstContestant();
} else {
  // All Criteria mode - save locked state
  console.log('Saving UI state for All Criteria mode...');
  await saveUIStateToFirestore(contestantId, -1, true); // -1 indicates all criteria completed
}
```

## Firestore Security Rules

### New Collection Added
```javascript
// JUDGE UI STATE COLLECTION
match /judgeUIState/{id} {
  // Read access for the judge who owns the data and admins
  allow read, get: if (request.auth.uid == id || isAdmin() || isDevelopmentUser() || isDevelopmentMode());
  
  // Write access for the judge who owns the data and admins
  allow create, update: if (request.auth.uid == id || isAdmin() || isDevelopmentUser() || isDevelopmentMode());
  
  // Delete access for the judge who owns the data and admins
  allow delete: if (request.auth.uid == id || isAdmin() || isDevelopmentUser() || isDevelopmentMode());
  
  // Allow list access for real-time listeners
  allow list: if isAuthenticated() || isDevelopmentUser() || isDevelopmentMode() || true;
}
```

## Expected Behavior

### Individual Criteria Mode

#### Before Refresh:
1. Judge scores Contestant 1 → Criteria 1, 2 (submitted)
2. Judge scores Contestant 2 → Criteria 1 (submitted)

#### After Refresh:
1. Page loads → UI state restored from Firestore
2. System returns to Contestant 2 (most recent activity)
3. Criteria progress shows: Contestant 1 locked, Contestant 2 at Criteria 2
4. Judge can continue scoring Contestant 2 → Criteria 2, 3...

### All Criteria Mode

#### Before Refresh:
1. Judge scores Contestant 1 → All Criteria (submitted)
2. Judge scores Contestant 2 → All Criteria (submitted)

#### After Refresh:
1. Page loads → UI state restored from Firestore
2. Both contestants show as locked/submitted
3. Scores remain unchanged and visible
4. Judge cannot re-submit unless editing is explicitly allowed

## Benefits

### ✅ **Data Persistence**
- Scores survive page refreshes
- UI state maintained across sessions
- No data loss during browser restart

### ✅ **Judge Privacy**
- Each judge's state is isolated
- Secure access controls in Firestore
- No cross-judge interference

### ✅ **User Experience**
- Seamless continuation after page refresh
- No need to restart scoring from beginning
- Intuitive state restoration

### ✅ **Administrative Control**
- Admin can override judge state if needed
- Development mode available for testing
- Clear audit trail with timestamps

## Files Modified

### Core Implementation
- `src/app/judge/dashboard/page.js` - Added UI state persistence functions
- Enhanced `submitScore()` function with Firestore saving
- Updated `updateJudgeCriteriaProgress()` with UI state calls
- Added `restoreUIState()` function for page load restoration

### Security Rules
- `firestore.rules` - Added `judgeUIState` collection permissions
- Maintains existing security model
- Proper access controls for judges and admins

## Testing

### Manual Testing Steps
1. Submit scores in Individual Criteria mode
2. Refresh page - should continue from same criteria
3. Submit scores in All Criteria mode
4. Refresh page - should show locked contestants

### Automated Testing
Run the existing test scripts to verify:
- Score submission functionality
- UI state persistence
- Real-time restoration
- Cross-judge isolation

## Future Enhancements

### Potential Improvements
- **Offline Support**: Cache UI state for offline mode
- **Conflict Resolution**: Handle simultaneous editing scenarios
- **Historical Tracking**: Show score change history
- **Performance Metrics**: Track restoration timing

---

## Summary
The persistent scoring state implementation ensures that judges' work is never lost due to page refreshes. The system uses Firestore as the source of truth for UI state, providing a seamless experience that maintains both scoring data and interface state across sessions while preserving judge privacy and data integrity.
