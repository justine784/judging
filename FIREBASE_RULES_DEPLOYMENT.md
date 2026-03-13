# Firebase Firestore Rules Deployment Guide

## Current Rules vs Enhanced Rules

### Current Rules (firestore.rules)
- Basic authentication checks
- Allows any authenticated user to write to most collections
- No role-based access control

### Enhanced Rules (firestore-enhanced.rules)
- Role-based access control (Admin vs Judge)
- Proper validation of required fields
- Security for score submissions
- Better overall security

### Simple Rules (firestore-simple.rules)
- Most lenient rules for testing
- Good for debugging score submission issues

## How to Deploy Firebase Rules

### Method 1: Using Firebase CLI
```bash
# Deploy enhanced rules
firebase deploy --only firestore:rules --config firestore.rules

# Or deploy simple rules for testing
firebase deploy --only firestore:rules --config firestore-simple.rules
```

### Method 2: Using Firebase Console
1. Go to Firebase Console
2. Select your project
3. Go to Firestore Database
4. Click "Rules" tab
5. Copy and paste the rules content
6. Click "Publish"

### Method 3: Replace current rules file
```bash
# Backup current rules
cp firestore.rules firestore.rules.backup

# Use enhanced rules
cp firestore-enhanced.rules firestore.rules

# Deploy
firebase deploy --only firestore:rules
```

## Recommended Deployment Steps

### For Testing (Fix Score Submission Issues)
1. **Use Simple Rules First:**
   ```bash
   cp firestore-simple.rules firestore.rules
   firebase deploy --only firestore:rules
   ```

2. **Test Score Submission**
   - Try submitting scores as a judge
   - Check if the "Failed to submit score" error is fixed

3. **If Working, Deploy Enhanced Rules:**
   ```bash
   cp firestore-enhanced.rules firestore.rules
   firebase deploy --only firestore:rules
   ```

## Rule Explanations

### Key Features in Enhanced Rules:

1. **Authentication Check**: `isAuthenticated()`
2. **Role Validation**: `isAdmin()` and `isJudge()`
3. **Event Assignment Check**: `isAssignedJudge(eventId)`
4. **Field Validation**: Ensures required fields are present
5. **Judge ID Validation**: Ensures judges can only submit as themselves

### Score Submission Security:
```javascript
// Judges can only submit scores with their own judgeId
allow write: if isJudge() && 
             request.resource.data.judgeId == request.auth.uid &&
             request.resource.data.keys().hasAll(['eventId', 'contestantId', 'judgeId', 'score', 'timestamp']);
```

## Troubleshooting Score Submission Issues

### Common Permission Errors:
1. **"Missing or insufficient permissions"**
   - Check if user is authenticated
   - Verify judge role in judges collection
   - Ensure judge is assigned to the event

2. **"Failed to submit score"**
   - Try using simple rules first
   - Check console logs for specific error
   - Verify all required fields are present

### Debug Steps:
1. Deploy simple rules
2. Test score submission
3. Check browser console for errors
4. If working, deploy enhanced rules
5. Test again with enhanced security

## Security Recommendations

### Production Environment:
- Use enhanced rules
- Regularly audit judge permissions
- Monitor score submission logs

### Development/Testing:
- Use simple rules for initial debugging
- Switch to enhanced rules once working
- Test with different user roles
