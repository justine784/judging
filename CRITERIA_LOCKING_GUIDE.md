# Criteria Locking with Individual Submit Mode - Implementation Guide

## 🎯 Feature Overview

When the admin enables "Individual Submit per Criteria", the scoring system enforces sequential criteria scoring. Judges must complete the current criteria before the next one becomes available.

## 📋 Implementation Summary

### ✅ What Was Implemented:

1. **State Management**
   - `criteriaCompletion` - Tracks completion status per criteria per event
   - `currentActiveCriteriaIndex` - Tracks which criteria is currently active

2. **Core Functions**
   - `checkAllJudgesSubmittedForCriteria()` - Verifies all judges submitted for current criteria
   - `getCurrentActiveCriteriaIndex()` - Determines the next available criteria
   - `isCriteriaLocked()` - Checks if a criteria should be locked
   - `isCriteriaActive()` - Checks if a criteria is currently active
   - `updateCriteriaCompletion()` - Updates completion status and unlocks next criteria

3. **UI Updates**
   - **Mobile & Desktop**: Added criteria locking to all input disabled conditions
   - **Visual Indicators**: Added status badges (🔒 Locked, 🟢 Active, ⏳ Waiting)
   - **Card Styling**: Different colors for active vs locked criteria
   - **Submit Buttons**: Disabled for locked criteria

4. **Integration**
   - Integrated with existing `submitScore()` function
   - Added automatic criteria completion check after each submission
   - Added initialization logic for individual submit mode

## 🚀 How to Test

### Step 1: Enable Individual Submit Mode
1. Go to Admin Dashboard → Events → Manage Criteria
2. Enable "Individual Submit per Criteria" toggle
3. Save the changes

### Step 2: Judge Dashboard Behavior
1. Open Judge Dashboard
2. Select an event with individual submit enabled
3. Select a contestant

**Expected Behavior:**
- ✅ **Criteria 1**: 🟢 Active (green border, enabled inputs)
- ✅ **Criteria 2+**: 🔒 Locked (gray border, disabled inputs)
- ✅ **Visual Indicators**: Status badges show current state

### Step 3: Sequential Scoring Flow

#### Initial State:
```
🟢 Criteria 1: Active - Can score and submit
🔒 Criteria 2: Locked - Cannot interact
🔒 Criteria 3: Locked - Cannot interact
```

#### After Judge 1 submits Criteria 1:
```
🟢 Criteria 1: Active (still active until ALL judges submit)
🔒 Criteria 2: Locked
🔒 Criteria 3: Locked
```

#### After ALL judges submit Criteria 1:
```
🔒 Criteria 1: Locked - Now locked, read-only
🟢 Criteria 2: Active - Now unlocked for scoring
🔒 Criteria 3: Locked
```

#### Notification:
```
🎉 All judges completed previous criteria! You can now score: [Criteria 2 Name]
```

### Step 4: Complete Flow Testing
1. **Multiple Judges**: Test with 2+ judges
2. **All Contestants**: Ensure flow works for each contestant
3. **Criteria Progression**: Verify sequential unlocking
4. **Final Criteria**: Ensure proper completion message

## 🔧 Technical Details

### State Management:
```javascript
const [criteriaCompletion, setCriteriaCompletion] = useState({});
const [currentActiveCriteriaIndex, setCurrentActiveCriteriaIndex] = useState(0);
```

### Key Functions:
```javascript
// Check if all judges submitted for a criteria
const checkAllJudgesSubmittedForCriteria = async (criteriaKey, eventId) => {
  // Checks all contestants and all assigned judges
  // Returns true if all submissions complete
}

// Determine active criteria index
const getCurrentActiveCriteriaIndex = () => {
  // Finds first criteria not marked as completed
  // Returns index of next available criteria
}

// Update completion and unlock next criteria
const updateCriteriaCompletion = async (criteriaKey) => {
  // Checks if all judges submitted
  // Updates completion status
  // Unlocks next criteria with notification
}
```

### UI Integration:
```javascript
// Disabled condition for inputs
disabled={existingConditions || isCriteriaLocked(currentGlobalIndex)}

// Visual styling
className={isCriteriaActive(currentGlobalIndex) ? 'border-emerald-400 bg-emerald-50' : 
         isCriteriaLocked(currentGlobalIndex) ? 'border-gray-300 bg-gray-50' : 
         'border-gray-200'}

// Status indicators
{isCriteriaLocked(currentGlobalIndex) ? '🔒 Locked' : 
 isCriteriaActive(currentGlobalIndex) ? '🟢 Active' : '⏳ Waiting'}
```

## 🎨 Visual Indicators

### Active Criteria:
- **Border**: Emerald green (`border-emerald-400`)
- **Background**: Light green (`bg-emerald-50`)
- **Badge**: 🟢 Active (green background)
- **Inputs**: Enabled and interactive

### Locked Criteria:
- **Border**: Gray (`border-gray-300`)
- **Background**: Light gray (`bg-gray-50`)
- **Badge**: 🔒 Locked (gray background)
- **Inputs**: Disabled and non-interactive

### Waiting Criteria:
- **Border**: Default gray
- **Background**: Default white
- **Badge**: ⏳ Waiting (blue background)

## 🔄 Automatic Progression

1. **Judge submits score** → `submitScore()` called
2. **Score saved** → Database updated
3. **Completion check** → `updateCriteriaCompletion()` called
4. **All judges checked** → `checkAllJudgesSubmittedForCriteria()`
5. **Status updated** → `criteriaCompletion` state updated
6. **Next criteria unlocked** → UI automatically updates
7. **Notification shown** → Judges informed of next available criteria

## 🚨 Important Notes

### Admin Control:
- Only admin can enable/disable individual submit mode
- Mode applies per event, not globally
- Can be toggled on/off at any time

### Judge Experience:
- Clear visual feedback for criteria status
- Sequential progression enforced automatically
- No ability to skip or jump to future criteria
- Previous criteria become read-only after completion

### Data Integrity:
- Each judge submission tracked individually
- Completion status stored per event
- Real-time updates across all judges
- Proper error handling for network issues

## 🐛 Troubleshooting

### Issues to Check:
1. **Criteria not unlocking**: Check if ALL judges submitted
2. **Visual indicators wrong**: Verify `currentGlobalIndex` calculation
3. **Submit buttons still enabled**: Check disabled conditions include `isCriteriaLocked()`
4. **No notifications**: Check `updateCriteriaCompletion()` function calls

### Console Logs:
Look for these debug messages:
```
🔧 Initializing criteria completion tracking for individual submit mode
📋 Initialized criteria completion status: {...}
Checking submissions for criteria: [criteria_key]
✅ All judges submitted for criteria: [criteria_key]
🎉 Criteria [criteria_key] completed by all judges!
```

## ✅ Expected Final Behavior

When fully implemented and tested:
1. **Admin enables** individual submit mode
2. **Judges see** only first criteria active
3. **Sequential progression** enforced automatically
4. **Clear visual feedback** for criteria status
5. **Proper notifications** when criteria unlock
6. **Complete workflow** from first to last criteria

The system ensures fair, sequential judging while maintaining data integrity and providing clear user guidance.
