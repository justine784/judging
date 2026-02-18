# Firebase Authentication Troubleshooting Guide

## Error: `auth/invalid-credential`

This error typically occurs when there are issues with Firebase configuration or authentication setup.

## Common Causes and Solutions

### 1. **Firebase Project Configuration**
- **Issue**: API key restrictions or incorrect project settings
- **Solution**: 
  1. Go to Firebase Console → Project Settings → General
  2. Check that your API key is correct
  3. Ensure the project ID matches: `judging-2a4da`

### 2. **Authentication Method Not Enabled**
- **Issue**: Email/Password authentication is not enabled
- **Solution**:
  1. Go to Firebase Console → Authentication → Sign-in method
  2. Enable "Email/Password" provider
  3. Make sure it's not disabled

### 3. **API Key Restrictions**
- **Issue**: API key has domain restrictions that block localhost
- **Solution**:
  1. Go to Firebase Console → Project Settings → API Keys
  2. Edit your API key
  3. Under "API restrictions", ensure it allows "Firebase Authentication API"
  4. Under "Application restrictions", add localhost domains if needed

### 4. **Firebase SDK Version Issues**
- **Issue**: Incompatible Firebase SDK version
- **Current Version**: Firebase v12.9.0 (should be compatible)
- **Solution**: Ensure all Firebase packages are same version

### 5. **Network/Environment Issues**
- **Issue**: Firewall or network blocking Firebase services
- **Solution**:
  1. Check if you can access `https://firebase.googleapis.com`
  2. Verify no ad blockers are blocking Firebase requests

## Debugging Steps

### Step 1: Check Firebase Initialization
Look for the debug panel in the bottom-right corner of the login page (development only).

### Step 2: Verify Configuration
```javascript
// Check these values in src/lib/firebase.js
const firebaseConfig = {
  apiKey: "AIzaSyD9-7W1EtFevUqrBcVruR3oHgXEc4K4KcQ", // Should be valid
  authDomain: "judging-2a4da.firebaseapp.com", // Should match project
  projectId: "judging-2a4da", // Should match project ID
  appId: "1:954134091247:web:df9aea8c36ea8c64d2d21a" // Should be valid
};
```

### Step 3: Test with Firebase Console
1. Go to Firebase Console → Authentication → Users
2. Try to add a test user manually
3. If you can't add users, there's a configuration issue

### Step 4: Check Browser Console
Open browser dev tools and look for:
- Firebase initialization errors
- Network request failures
- CORS errors

## Quick Fixes

### Fix 1: Reinitialize Firebase
Delete `node_modules/.cache` and restart the dev server:
```bash
rm -rf node_modules/.cache
npm run dev
```

### Fix 2: Clear Browser Data
Clear browser localStorage and cookies for localhost.

### Fix 3: Test with Different Credentials
Try creating a new user in Firebase Console and test with those credentials.

## Admin Account Setup

If this is a fresh setup, you need to create an admin user:

1. Go to Firebase Console → Authentication → Users
2. Click "Add user"
3. Create user with email: `admin@gmail.com` (or your preferred admin email)
4. Set a password
5. Test login with these credentials

## Still Having Issues?

1. Check the Firebase Debug panel on the login page
2. Look at browser console for detailed error messages
3. Verify all Firebase services are enabled in your project
4. Ensure your Firebase project is not in a disabled state
