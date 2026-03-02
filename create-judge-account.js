const admin = require('firebase-admin');

// Initialize Firebase Admin SDK using environment variables (same as firebase-admin.js)
if (!admin.apps.length) {
  const serviceAccount = {
    "type": "service_account",
    "project_id": "judging-2a4da",
    "private_key_id": process.env.FIREBASE_PRIVATE_KEY_ID,
    "private_key": process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    "client_email": process.env.FIREBASE_CLIENT_EMAIL,
    "client_id": process.env.FIREBASE_CLIENT_ID,
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token"
  };

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const auth = admin.auth();
const db = admin.firestore();

async function createJudgeAccount() {
  try {
    console.log('Creating judge account for managescore@gmail.com...');
    
    // Create user in Firebase Authentication
    const userRecord = await auth.createUser({
      email: 'managescore@gmail.com',
      emailVerified: true,
      password: 'judge123456', // Default password, should be changed on first login
      displayName: 'Manage Score Judge',
    });
    
    console.log('✅ Firebase Auth user created:', userRecord.uid);
    
    // Create judge document in Firestore
    const judgeData = {
      uid: userRecord.uid,
      email: 'managescore@gmail.com',
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
    
    await db.collection('judges').doc(userRecord.uid).set(judgeData);
    
    console.log('✅ Judge document created in Firestore');
    console.log('📧 Email: managescore@gmail.com');
    console.log('🔑 Password: judge123456 (change on first login)');
    console.log('👤 Name: Manage Score Judge');
    console.log('🎯 Role: judge');
    console.log('✅ Status: active');
    
    console.log('\nJudge account created successfully!');
    console.log('The user can now log in at /judge/login');
    
  } catch (error) {
    console.error('❌ Error creating judge account:', error);
    
    if (error.code === 'auth/email-already-exists') {
      console.log('⚠️  User already exists. Creating/updating judge document...');
      
      // Get existing user
      const userRecord = await auth.getUserByEmail('managescore@gmail.com');
      
      // Create/update judge document
      const judgeData = {
        uid: userRecord.uid,
        email: 'managescore@gmail.com',
        displayName: userRecord.displayName || 'Manage Score Judge',
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
      
      await db.collection('judges').doc(userRecord.uid).set(judgeData);
      console.log('✅ Judge document created/updated in Firestore');
    }
  }
}

// Run the function
createJudgeAccount().then(() => {
  console.log('Script completed');
  process.exit(0);
}).catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});
