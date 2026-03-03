# Setup Guide for managescore@gmail.com Account

## Overview
Created a custom dashboard for the `managescore@gmail.com` account with special score management features.

## What's Been Created

### 1. Custom Dashboard Page
- **Location**: `/src/app/judge/managescore/page.js`
- **Features**:
  - Real-time contestant scores overview
  - Score statistics and analytics
  - Event management interface
  - Quick actions for scoreboard access
  - System information panel

### 2. Authentication Routing
- **Modified**: `/src/app/judge/login/page.js`
- **Logic**: When `managescore@gmail.com` logs in, automatically redirects to `/judge/managescore` instead of regular judge dashboard

### 3. Database Setup Scripts
- **Created**: Multiple scripts to add the user to Firestore
  - `create-managescore-user.js` - Firebase client SDK version
  - `setup-managescore.js` - Firebase Admin SDK version  
  - `add-managescore.js` - Simplified admin version

## Setup Instructions

### Step 1: Create Firebase Auth User
1. Go to Firebase Console → Authentication
2. Click "Add User"
3. Email: `managescore@gmail.com`
4. Password: `judge123456`
5. Click "Add User"

### Step 2: Add to Firestore Judges Collection
Run one of these scripts:

```bash
# Option 1: Use the simplified script
node add-managescore.js

# Option 2: If you have Firebase Admin setup
node setup-managescore.js
```

### Step 3: Test the Login
1. Navigate to `/judge/login`
2. Enter credentials:
   - Email: `managescore@gmail.com`
   - Password: `judge123456`
3. Should redirect to custom dashboard at `/judge/managescore`

## Dashboard Features

### Main Dashboard Components
1. **Stats Cards**:
   - Total Contestants
   - Scored Contestants  
   - Total Events
   - Last Updated Time

2. **Contestant Scores Table**:
   - Real-time score data
   - Average score calculations
   - Performance status indicators
   - Judge count per contestant

3. **Quick Actions Panel**:
   - View Live Scoreboard
   - Refresh Data
   - System Info

4. **Recent Activity**:
   - Last score update timestamp
   - Activity monitoring

### Special Features
- **Real-time Updates**: Automatically refreshes when scores change
- **Score Analytics**: Visual progress bars and status indicators
- **Responsive Design**: Works on desktop and mobile
- **Role-based Access**: Only accessible to managescore@gmail.com

## Security Notes
- The account has `judge` role with full score management permissions
- Authentication redirects ensure only managescore@gmail.com can access this dashboard
- Regular judges are redirected to `/judge/dashboard`
- Admin users are blocked from judge login entirely

## Troubleshooting

### If login fails:
1. Verify user exists in Firebase Authentication
2. Check Firestore judges collection for the user document
3. Ensure user has `role: 'judge'` and `status: 'active'`

### If redirect doesn't work:
1. Check the login routing logic in `/src/app/judge/login/page.js`
2. Verify email matches exactly: `managescore@gmail.com`

### If dashboard shows no data:
1. Ensure contestants exist in Firestore
2. Check if scores collection has data
3. Verify real-time listeners are working

## Next Steps
- Customize the dashboard design as needed
- Add more score management features
- Integrate with existing admin functionality
- Set up notifications for score updates
