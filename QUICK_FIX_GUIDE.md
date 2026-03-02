# Quick Fix: managescore@gmail.com Login Issue

## 🚨 Problem
The error "You are not authorized to access the judge portal" means the user exists in Firebase Authentication but **doesn't have a document in the Firestore `judges` collection**.

## 🔧 Quick Fix Solution

### Step 1: Login to Setup Page
1. Go to: `/setup-judge`
2. Login with `managescore@gmail.com` and your password
3. Click "Setup Judge Account"

### Step 2: Try Judge Login
1. After setup completes, go to: `/judge/login`
2. Login with `managescore@gmail.com`
3. You should be redirected to `/judge/managescore`

## 📋 Alternative: Manual Firebase Console Setup

If the automated setup doesn't work:

### 1. Get User UID
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Navigate to **Authentication** → **Users**
3. Find `managescore@gmail.com` and copy the **User UID**

### 2. Create Judge Document
1. Navigate to **Firestore Database**
2. Go to the `judges` collection
3. Click **Add document**
4. Use the copied **User UID** as the Document ID
5. Add these fields:

```json
{
  "uid": "COPIED_USER_UID",
  "email": "managescore@gmail.com",
  "displayName": "Manage Score Judge",
  "role": "judge",
  "status": "active",
  "createdAt": "timestamp",
  "lastLogin": null,
  "assignedEvents": [],
  "permissions": [
    "view_events",
    "score_contestants",
    "view_scoreboard",
    "edit_own_scores"
  ],
  "specialization": "general",
  "experience": "senior"
}
```

## ✅ Verification

After setup, the login should work and redirect to `/judge/managescore`

## 🔍 Debug Steps

If still not working:

1. **Check User Exists**: Verify `managescore@gmail.com` exists in Firebase Authentication
2. **Check Document Exists**: Verify the judge document exists in Firestore with correct UID
3. **Check Role**: Ensure the `role` field is exactly `"judge"`
4. **Check Status**: Ensure the `status` field is `"active"`

## 📞 Support

If you continue to have issues:
1. Check browser console for specific error messages
2. Verify Firebase project configuration
3. Contact the system administrator

---

**The automated setup page at `/setup-judge` should resolve this issue quickly!**
