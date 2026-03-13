# Quick Firebase Permissions Fix

## Problem: "Missing or insufficient permissions"

## Immediate Solutions (Choose one)

### Option 1: Run Auto-Fix Script (Easiest)
1. Open browser console (F12) on admin page
2. Copy and paste contents of `fix-firebase-permissions.js`
3. Press Enter
4. Follow the instructions

### Option 2: Create Admin User
1. Go to Firebase Console: https://console.firebase.google.com
2. Select project: `judging-2a4da`
3. Authentication → Users → Add user
4. Email: `admin@gmail.com`
5. Password: `admin123`
6. Login at `/admin/login`

### Option 3: Temporary Open Access
1. Firebase Console → Firestore → Rules
2. Replace with:
```javascript
rules_version='2'
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```
3. Click Publish
4. Login as admin
5. Restore proper rules after

### Option 4: Use Your Email
1. Edit `src/app/admin/layout.js` line 23:
   ```javascript
   const ADMIN_EMAIL = 'your-email@example.com';
   ```
2. Edit `firestore.rules` line 8:
   ```javascript
   request.auth.token.email == 'your-email@example.com';
   ```
3. Deploy rules
4. Create user with your email

## Debug Commands (Run in Console)

```javascript
// Check current auth state
window.checkPermissions();

// Create admin user
window.createAdminUser('admin@gmail.com', 'admin123');

// Manual login
window.loginAsAdmin('admin@gmail.com', 'admin123');
```

## Common Issues & Fixes

### Issue: "permission-denied"
**Fix**: Create admin user or use temporary open access

### Issue: "auth/user-not-found"
**Fix**: Create the user in Firebase Authentication first

### Issue: "auth/invalid-credential"
**Fix**: Check Firebase project configuration and API keys

## After Fix
1. Test admin dashboard access
2. Verify all pages work (events, judges, scoreboard)
3. Restore proper security rules if using temporary access

## Need Help?
- Check browser console for specific errors
- Verify Firebase project is active
- Ensure Authentication is enabled
- Check network connectivity
