// Add managescore@gmail.com to Firestore judges collection
const admin = require('firebase-admin');

// Initialize Firebase Admin with your config
const serviceAccount = {
  "type": "service_account",
  "project_id": "judging-2a4da",
  "private_key_id": "your-private-key-id",
  "private_key": "-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@judging-2a4da.iam.gserviceaccount.com",
  "client_id": "your-client-id",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token"
};

// Try to initialize with service account or fallback to environment
try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'judging-2a4da'
  });
} catch (error) {
  console.log('Firebase Admin already initialized or using environment variables');
}

const db = admin.firestore();

async function addManageScoreUser() {
  try {
    const manageScoreUID = 'managescore-uid-12345';
    
    const judgeData = {
      uid: manageScoreUID,
      email: 'managescore@gmail.com',
      name: 'Manage Score Judge',
      role: 'judge',
      status: 'active',
      assignedEvents: [],
      scoredContestants: [],
      scoredContestantsFinal: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      permissions: {
        canJudge: true,
        canViewScores: true,
        canManageScores: true
      }
    };

    await db.collection('judges').doc(manageScoreUID).set(judgeData);
    console.log('✅ Manage Score judge profile created in Firestore');
    console.log('📧 Email: managescore@gmail.com');
    console.log('🔑 Password: judge123456 (create this in Firebase Console)');
    console.log('🎭 Role: judge');
    console.log('✅ Status: active');
    console.log('');
    console.log('📝 Next steps:');
    console.log('1. Go to Firebase Console -> Authentication');
    console.log('2. Create user with email: managescore@gmail.com');
    console.log('3. Set password: judge123456');
    console.log('4. The user can now login at /judge/login');
    console.log('5. Will be redirected to custom dashboard at /judge/managescore');
    
  } catch (error) {
    console.error('❌ Error adding user:', error);
  }
}

addManageScoreUser().then(() => {
  console.log('🎉 Process completed');
  process.exit(0);
}).catch((error) => {
  console.error('💥 Process failed:', error);
  process.exit(1);
});
