# Setup Guide for managescore@gmail.com Judge Account

## 📋 Overview
This guide will help you set up the judge account for `managescore@gmail.com` with access to a custom dashboard.

## 🔧 Step 1: Create Firebase Authentication User

### Option A: Using Firebase Console
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (`judging-2a4da`)
3. Navigate to **Authentication** → **Users**
4. Click **Add user**
5. Enter:
   - **Email**: `managescore@gmail.com`
   - **Password**: `judge123456` (or your preferred password)
   - Check **Email verified**
6. Click **Add user**

### Option B: Using Firebase CLI
```bash
firebase auth:create-user --email managescore@gmail.com --password judge123456 --email-verified
```

## 🗄️ Step 2: Create Firestore Judge Document

After creating the Firebase Auth user, you need to create a document in the `judges` collection.

### Using Firebase Console
1. Go to **Firestore Database**
2. Navigate to the `judges` collection
3. Click **Add document**
4. Use the **User UID** from the Authentication step as the **Document ID**
5. Add the following fields:

```json
{
  "uid": "USER_UID_FROM_AUTH",
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

### Using the Setup Script
Run the provided script to automatically create the Firestore document:

```bash
node setup-managescore-judge.js
```

## 🎯 Step 3: Verify Setup

1. Navigate to `/judge/login`
2. Login with:
   - **Email**: `managescore@gmail.com`
   - **Password**: `judge123456`
3. You should be redirected to `/judge/managescore` (custom dashboard)

## 📱 Features Available

The Manage Score Dashboard includes:
- **Event Management**: View and select available events
- **Judge Statistics**: Track available events, status, and experience
- **Quick Actions**: Access scoreboard, help, and profile
- **Custom UI**: Specialized interface for score management

## 🔐 Security Notes

- The default password should be changed after first login
- The account has judge-level permissions only
- Access is restricted to the managescore dashboard
- Admin users cannot access this portal

## 🚀 Testing

After setup, test the following:
1. Login functionality works
2. Dashboard loads correctly
3. Events are displayed
4. Logout functionality works
5. Navigation to evaluation pages works

## 🛠️ Troubleshooting

### Common Issues:

**"User not authorized"**
- Verify the user exists in the `judges` collection
- Check that the `role` field is set to "judge"
- Ensure the `status` field is "active"

**"Invalid credentials"**
- Double-check the email and password
- Ensure the user exists in Firebase Authentication
- Verify the email is marked as verified

**"Dashboard not loading"**
- Check browser console for errors
- Verify Firebase configuration
- Ensure the user UID matches between Auth and Firestore

## 📞 Support

If you encounter issues:
1. Check the browser console for error messages
2. Verify Firebase project configuration
3. Ensure all required fields are present in the judge document
4. Contact the system administrator for assistance

---

**Note**: This setup creates a specialized judge account with access to a custom dashboard designed for score management tasks.
