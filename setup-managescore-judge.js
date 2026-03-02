/**
 * Setup script for managescore@gmail.com judge account
 * This script creates the Firestore document for the judge account
 * 
 * Usage: node setup-managescore-judge.js
 * 
 * Prerequisites:
 * 1. Firebase user must already exist in Authentication
 * 2. Environment variables must be configured
 */

const admin = require('firebase-admin');

// Check if we're in a Node.js environment with proper module support
if (typeof require === 'undefined') {
  console.error('This script must be run with Node.js');
  process.exit(1);
}

// Initialize Firebase Admin SDK
try {
  const serviceAccount = {
    "type": "service_account",
    "project_id": "judging-2a4da",
    "private_key_id": process.env.FIREBASE_PRIVATE_KEY_ID || "",
    "private_key": process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n') || "",
    "client_email": process.env.FIREBASE_CLIENT_EMAIL || "",
    "client_id": process.env.FIREBASE_CLIENT_ID || "",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token"
  };

  if (!serviceAccount.private_key || !serviceAccount.client_email) {
    throw new Error('Missing Firebase credentials in environment variables');
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  console.log('✅ Firebase Admin SDK initialized');
} catch (error) {
  console.error('❌ Failed to initialize Firebase Admin SDK:', error.message);
  console.log('\n💡 Please ensure the following environment variables are set:');
  console.log('   - FIREBASE_PRIVATE_KEY');
  console.log('   - FIREBASE_CLIENT_EMAIL');
  console.log('   - FIREBASE_CLIENT_ID');
  console.log('   - FIREBASE_PRIVATE_KEY_ID');
  console.log('\n📖 See SETUP_MANAGESCORE_JUDGE.md for manual setup instructions');
  process.exit(1);
}

const auth = admin.auth();
const db = admin.firestore();

async function setupManageScoreJudge() {
  const email = 'managescore@gmail.com';
  
  try {
    console.log(`🔍 Looking for user: ${email}`);
    
    // Get user by email
    const userRecord = await auth.getUserByEmail(email);
    console.log(`✅ Found user: ${userRecord.uid}`);
    
    // Create judge document
    const judgeData = {
      uid: userRecord.uid,
      email: email,
      displayName: 'Manage Score Judge',
      role: 'judge',
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastLogin: null,
      assignedEvents: [],
      permissions: [
        'view_events',
        'score_contestants',
        'view_scoreboard',
        'edit_own_scores'
      ],
      specialization: 'general',
      experience: 'senior'
    };
    
    // Save to Firestore
    await db.collection('judges').doc(userRecord.uid).set(judgeData);
    console.log('✅ Judge document created in Firestore');
    
    // Verify the document was created
    const judgeDoc = await db.collection('judges').doc(userRecord.uid).get();
    if (judgeDoc.exists) {
      console.log('✅ Verification successful - judge document exists');
      console.log('\n🎉 Setup completed successfully!');
      console.log('\n📋 Account Details:');
      console.log(`   Email: ${email}`);
      console.log(`   UID: ${userRecord.uid}`);
      console.log(`   Role: judge`);
      console.log(`   Status: active`);
      console.log(`   Dashboard: /judge/managescore`);
      console.log('\n🔐 Login Credentials:');
      console.log(`   Email: ${email}`);
      console.log(`   Password: [Set during Firebase Auth creation]`);
      console.log('\n🚀 Next Steps:');
      console.log('   1. Navigate to /judge/login');
      console.log('   2. Login with the credentials');
      console.log('   3. You will be redirected to the custom dashboard');
    } else {
      console.error('❌ Verification failed - judge document not found');
    }
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    
    if (error.code === 'auth/user-not-found') {
      console.log('\n⚠️  User not found in Firebase Authentication');
      console.log('💡 Please create the user first in Firebase Console or CLI:');
      console.log('   firebase auth:create-user --email managescore@gmail.com --password judge123456 --email-verified');
      console.log('\n📖 See SETUP_MANAGESCORE_JUDGE.md for detailed instructions');
    } else if (error.code === 'permission-denied') {
      console.log('\n⚠️  Permission denied - check Firebase Admin SDK permissions');
      console.log('💡 Ensure your service account has Firestore write permissions');
    }
    
    process.exit(1);
  }
}

// Run the setup
setupManageScoreJudge()
  .then(() => {
    console.log('\n✨ Setup script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Setup script failed:', error);
    process.exit(1);
  });
