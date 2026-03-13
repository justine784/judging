# Debug Score Submission Issues

## How to Debug the Failed Submission

### Step 1: Open Browser Console
1. Press F12 to open Developer Tools
2. Go to Console tab
3. Clear the console (🗕️ button)

### Step 2: Attempt Score Submission
1. Go to Judge Dashboard
2. Select a contestant
3. Move the score slider to set a score (try different values: 0, 50, 100)
4. Click the "Submit" button for that criterion

### Step 3: Check Console Output
Look for these debug messages:

```
=== SCORE SUBMISSION DEBUG ===
Required Data: { eventId, contestantId, criteriaId, judgeId, ... }

=== DETAILED SCORE DEBUG ===
Contestant ID: "contestant123"
Criteria Key: "talent"
Full contestantScores object: {...}
Contestant score data: {...}
Raw score value: 85
Score type: "number"
Has key in object: true
Score is undefined: false
Score is null: false
Score is NaN: false
Score value check: 85 -> 85
✅ Score validation passed: 85
```

### Common Issues and Solutions

#### Issue 1: "Score not properly set"
**Console shows:**
```
❌ SCORE NOT PROPERLY SET: { score: undefined, key: "talent", ... }
```

**Cause:** Score not saved to state
**Solution:** 
- Check if slider is working
- Try moving slider to different positions
- Check if score value appears in the input field

#### Issue 2: "Missing required data"
**Console shows:**
```
Validation failed - missing required fields: { eventId: false, contestantId: true, ... }
```

**Cause:** Event not loaded or contestant not selected
**Solution:**
- Make sure event is selected and active
- Select a contestant before scoring

#### Issue 3: "Starting database write operations..." but no success
**Console shows:**
```
Starting database write operations...
Updating contestant document with data: {...}
```

**Cause:** Firestore permission issue or network problem
**Solution:**
- Check Firestore rules deployment
- Check network connection
- Check if user is properly authenticated

### Step 4: Test Different Values
Try submitting with different score values:
- **Score = 0**: Should show "⚠️ Score is 0, but allowing for testing"
- **Score = 50**: Should work normally
- **Score = 100**: Should work normally

### Step 5: Check Button State
Make sure the submit button is:
- **Blue** and clickable (not grayed out)
- **Not showing** "✓ Submitted" already
- **Not showing** loading state "⏳"

### Step 6: Network Tab Check
1. Go to Network tab in Developer Tools
2. Clear network log
3. Submit score
4. Look for Firestore requests:
   - Should see `UpdateDocument` requests
   - Should see `SetDocument` requests
   - Check for any red (failed) requests

### If Still Not Working

1. **Copy the full console output** and share it
2. **Check these specific things:**
   - What does `Full contestantScores object` show?
   - What does `Raw score value` show?
   - Are there any error messages in red?
   - Do you see "Starting database write operations..."?

### Quick Fix Test

If you want to bypass validation temporarily, you can test with this:

```javascript
// In submitScore function, temporarily replace the score validation with:
const score = 50; // Force test score
console.log('🧪 Using test score:', score);
```

This will help identify if the issue is with score retrieval or database operations.
