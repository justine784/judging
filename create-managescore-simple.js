// Simple script to add managescore@gmail.com to Firestore directly
const { doc, setDoc, collection } = require('firebase/firestore');
const { db } = require('./src/lib/firebase.js');

async function addManageScoreUser() {
  try {
    // Use a fixed UID for managescore@gmail.com (this would normally come from Firebase Auth)
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
      createdAt: new Date(),
      permissions: {
        canJudge: true,
        canViewScores: true,
        canManageScores: true
      }
    };

    // Create document reference in judges collection
    const judgesCollection = collection(db, 'judges');
    const judgeDoc = doc(judgesCollection, manageScoreUID);
    
    await setDoc(judgeDoc, judgeData);
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
