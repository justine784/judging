# Firebase Permissions Error - Quick Fix Guide

## Problem
You're seeing "FirebaseError: Missing or insufficient permissions" errors in the admin panel.

## Root Cause
The admin panel requires authentication as `admin@gmail.com`, but either:
1. You're not logged in as the correct admin user
2. The admin user doesn't exist in Firebase Authentication
3. Firebase security rules are blocking access

## Quick Fix Steps

### Step 1: Check Current Authentication
1. Open the browser console (F12)
2. Go to the admin page
3. Look for console logs showing the current user email
4. Check if you're logged in as `admin@gmail.com`

### Step 2: Create Admin User (if needed)
Go to Firebase Console:
1. Visit https://console.firebase.google.com
2. Select your project: `judging-2a4da`
3. Go to "Authentication" → "Users"
4. Click "Add user"
5. Email: `admin@gmail.com`
6. Password: Set any password (remember it)
7. Click "Add user"

### Step 3: Login as Admin
1. Go to `/admin/login`
2. Login with:
   - Email: `admin@gmail.com`
   - Password: The password you just set
3. You should now be able to access the admin panel

### Step 4: If Still Having Issues

#### Option A: Use Debug Mode (Temporary)
I've enabled temporary debug mode that allows any authenticated user to access the admin panel. This will help us identify the issue.

#### Option B: Check Firebase Rules
The Firebase security rules expect:
```javascript
function isAdmin() {
  return request.auth != null && 
         request.auth.token.email == 'admin@gmail.com';
}
```

#### Option C: Manual Debug
1. Open browser console
2. Copy and paste this code:
```javascript
// Check current auth state
import('@/lib/firebase').then(({ auth }) => {
  console.log('Current user:', auth.currentUser?.email);
  console.log('User UID:', auth.currentUser?.uid);
  console.log('Is authenticated:', !!auth.currentUser);
});
```

### Step 5: Create Your Own Admin Email (Alternative)
If you want to use a different email:

1. **Update Firebase Rules**:
   Go to Firebase Console → Firestore → Rules
   Replace `admin@gmail.com` with your email

2. **Update Code**:
   Replace all instances of `admin@gmail.com` with your email in:
   - `src/app/admin/layout.js`
   - `src/app/admin/events/page.js`
   - `src/app/admin/judges/page.js`
   - `src/app/admin/dashboard/page.js`
   - `src/app/admin/scoreboard/page.js`
   - All other admin pages

3. **Update Firestore Rules**:
   ```javascript
   function isAdmin() {
     return request.auth != null && 
            request.auth.token.email == 'your-email@example.com';
   }
   ```

## Common Issues & Solutions

### Issue: "auth/user-not-found"
**Solution**: Create the admin user in Firebase Console first

### Issue: "auth/wrong-password"
**Solution**: Reset the password in Firebase Console or use the correct password

### Issue: Still getting permission errors
**Solution**: 
1. Check if you're logged in as the correct email
2. Verify Firebase rules are correctly configured
3. Make sure the user exists in Firebase Authentication

### Issue: ERR_BLOCKED_BY_CLIENT
**Solution**: 
1. Disable ad blockers temporarily
2. Check browser extensions
3. Try a different browser

## Testing the Fix

1. Login as admin
2. Go to admin dashboard
3. Check console for any remaining errors
4. Try accessing events, judges, and scoreboard pages

## When to Remove Debug Mode

Once you confirm the admin login works, remove the debug mode by:
1. Uncommenting the original code in admin pages
2. Removing the temporary bypasses
3. Ensuring only `admin@gmail.com` can access admin functions

## Need Help?

If you're still stuck:
1. Check the browser console for specific error messages
2. Verify your Firebase project settings
3. Make sure Authentication is enabled in Firebase Console
4. Contact me with the exact error messages you're seeing
