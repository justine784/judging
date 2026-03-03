const admin = require('firebase-admin');
const serviceAccount = require('./service-account-key.json');

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'judging-2a4da'
});

const auth = admin.auth();
const db = admin.firestore();

async function createManageScoreUser() {
  try {
    // Create the managescore@gmail.com user in Firebase Auth
    const userRecord = await auth.createUser({
      email: 'managescore@gmail.com',
      password: 'judge123456',
      displayName: 'Manage Score Judge'
    });

    console.log('✅ User created successfully:', userRecord.email);

    // Add the user to the judges collection with proper role
    const judgeData = {
      uid: userRecord.uid,
      email: 'managescore@gmail.com',
      name: 'Manage Score Judge',
      role: 'judge',
      status: 'active',
      assignedEvents: [], // Will be assigned by admin
      scoredContestants: [],
      scoredContestantsFinal: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      permissions: {
        canJudge: true,
        canViewScores: true,
        canManageScores: true
      }
    };

    await db.collection('judges').doc(userRecord.uid).set(judgeData);
    console.log('✅ Judge profile created in Firestore');
    console.log('📧 Email: managescore@gmail.com');
    console.log('🔑 Password: judge123456');
    console.log('🎭 Role: judge');
    console.log('✅ Status: active');
    
  } catch (error) {
    console.error('❌ Error creating user:', error);
    
    if (error.code === 'auth/email-already-exists') {
      console.log('ℹ️ User already exists. Updating Firestore profile...');
      
      // Get existing user and update their Firestore profile
      try {
        const userRecord = await auth.getUserByEmail('managescore@gmail.com');
        const judgeData = {
          uid: userRecord.uid,
          email: 'managescore@gmail.com',
          name: 'Manage Score Judge',
          role: 'judge',
          status: 'active',
          assignedEvents: [],
          scoredContestants: [],
          scoredContestantsFinal: [],
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          permissions: {
            canJudge: true,
            canViewScores: true,
            canManageScores: true
          }
        };

        await db.collection('judges').doc(userRecord.uid).set(judgeData, { merge: true });
        console.log('✅ Judge profile updated in Firestore');
      } catch (updateError) {
        console.error('❌ Error updating profile:', updateError);
      }
    }
  }
}

createManageScoreUser().then(() => {
  console.log('🎉 Process completed');
  process.exit(0);
}).catch((error) => {
  console.error('💥 Process failed:', error);
  process.exit(1);
});
