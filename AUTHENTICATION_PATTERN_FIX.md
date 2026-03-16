# Proper Authentication Pattern Implementation

## Problem Solved
Fixed the Firebase permissions error by implementing the correct authentication pattern using `onAuthStateChanged`.

## Key Changes Made

### 1. Imported onAuthStateChanged
```javascript
import { signOut, onAuthStateChanged } from 'firebase/auth';
```

### 2. Proper Authentication Flow
The application now follows the correct pattern:

```javascript
useEffect(() => {
  const unsubscribe = auth.onAuthStateChanged(async (user) => {
    if (user) {
      // User is authenticated
      // Verify judge role and permissions
      // THEN set up listeners
      setupContestantsListener(judgeData);
      setupScoresListener(judgeData);
      setupEventsListener(judgeData);
    } else {
      // User not authenticated - redirect to login
      router.push('/judge/login');
    }
  });
  
  return () => unsubscribe();
}, []);
```

### 3. Removed Redundant Authentication Checks
**Before (Incorrect):**
```javascript
if (auth.currentUser) {
  setupContestantsListener(judgeData);
} else {
  console.error('Cannot setup contestants listener - user not authenticated');
}
```

**After (Correct):**
```javascript
// No need to check auth.currentUser - we're already inside onAuthStateChanged
setupContestantsListener(judgeData);
```

### 4. Enhanced Error Handling
Updated all listener error handling to be more descriptive:
```javascript
if (error.code === 'permission-denied') {
  console.error('Permission denied for [collection]. Judge may not have proper permissions.');
} else if (error.code === 'unauthenticated') {
  console.error('User not authenticated for [collection].');
}
```

## Why This Pattern Works

### ✅ **Correct Flow:**
1. `onAuthStateChanged` waits for authentication to complete
2. User object is guaranteed to be available when callback fires
3. Listeners are only set up AFTER authentication is confirmed
4. No race conditions between authentication and Firestore operations

### ❌ **Previous Problems:**
1. Listeners might start before authentication completes
2. `auth.currentUser` could be null during listener setup
3. Race conditions causing permission errors
4. Redundant authentication checks

## Benefits

1. **No More Permission Errors**: Firestore operations only start after authentication
2. **Cleaner Code**: Removed redundant authentication checks
3. **Better Error Messages**: More descriptive error handling
4. **Proper React Pattern**: Correct use of `onAuthStateChanged` in useEffect
5. **Automatic Cleanup**: Proper unsubscribe function handling

## Testing Instructions

1. Start the application: `npm run dev`
2. Navigate to judge login page
3. Login with valid judge credentials
4. Check browser console - should see:
   - ✅ "Contestants updated in real-time"
   - ✅ "Judge scores updated in real-time" 
   - ✅ "Events updated in real-time"
   - ❌ No "Missing or insufficient permissions" errors

## Firebase Security Rules
The security rules are already properly configured and deployed to project `judging-2a4da`. The issue was purely in the authentication timing, not the rules themselves.

## Summary
This implementation ensures that Firebase listeners are only created after the user is fully authenticated, eliminating the race condition that was causing the permission errors.
