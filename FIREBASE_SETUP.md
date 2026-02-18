# Firebase Setup Guide for Judging System

## 🚨 Quick Fix for auth/invalid-credential Error

The error `auth/invalid-credential` almost always means **Email/Password authentication is not enabled** in your Firebase project.

## Step 1: Enable Email/Password Authentication

1. **Open Firebase Console**: https://console.firebase.google.com/
2. **Select your project**: `judging-2a4da`
3. **Go to Authentication**: Click "Authentication" in the left sidebar
4. **Sign-in method tab**: Click the "Sign-in method" tab
5. **Enable Email/Password**:
   - Find "Email/Password" in the list
   - Click the pencil icon (edit)
   - Select "Enabled"
   - Click "Save"

## Step 2: Create Admin User

1. **Still in Authentication**: Click the "Users" tab
2. **Add user**: Click "Add user"
3. **Enter admin credentials**:
   - Email: `admin@gmail.com` (or your preferred admin email)
   - Password: Create a secure password
4. **Click "Add user"**

## Step 3: Verify Configuration

Your Firebase configuration should match:
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyD9-7W1EtFevUqrBcVruR3oHgXEc4K4KcQ",
  authDomain: "judging-2a4da.firebaseapp.com",
  projectId: "judging-2a4da",
  storageBucket: "judging-2a4da.firebasestorage.app",
  messagingSenderId: "954134091247",
  appId: "1:954134091247:web:df9aea8c36ea8c64d2d21a"
};
```

## Step 4: Test the Fix

1. **Restart your dev server**: Stop and restart `npm run dev`
2. **Clear browser cache**: Refresh the page with Ctrl+Shift+R
3. **Test login**: Use the admin credentials you created

## Alternative: Test with Debug Page

Visit `http://localhost:3000/test-firebase` to see detailed Firebase diagnostics.

## Common Issues & Solutions

### Issue: API Key Restrictions
**Problem**: API key blocked for localhost
**Solution**:
1. Firebase Console → Project Settings → API Keys
2. Click your API key
3. Under "Application restrictions", ensure localhost is allowed

### Issue: Project Disabled
**Problem**: Firebase project is disabled
**Solution**:
1. Check Firebase Console for any project warnings
2. Ensure billing is active if required
3. Verify project status is "Active"

### Issue: Network/Firewall
**Problem**: Corporate firewall blocking Firebase
**Solution**:
1. Try from a different network
2. Check if you can access `https://firebase.googleapis.com`

## Verification Checklist

- [ ] Email/Password authentication enabled
- [ ] Admin user created in Firebase Console
- [ ] API key has no restrictive domain blocking
- [ ] Project is active and enabled
- [ ] No network/firewall issues
- [ ] Browser cache cleared

## Still Having Issues?

1. Check the browser console for detailed error messages
2. Visit `/test-firebase` for diagnostics
3. Verify all steps above are completed correctly

## Need Help?

- Firebase Documentation: https://firebase.google.com/docs/auth/web/start
- Firebase Console: https://console.firebase.google.com/
