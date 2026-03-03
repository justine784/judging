const { getAuth } = require('firebase/auth');
const { doc, setDoc, getFirestore } = require('firebase/firestore');
const { initializeApp } = require('firebase/app');

// Use the same Firebase config as the main app
const firebaseConfig = {
  apiKey: "AIzaSyD9-7W1EtFevUqrBcVruR3oHgXEc4K4KcQ",
  authDomain: "judging-2a4da.firebaseapp.com",
  projectId: "judging-2a4da",
  storageBucket: "judging-2a4da.firebasestorage.app",
  messagingSenderId: "954134091247",
  appId: "1:954134091247:web:df9aea8c36ea8c64d2d21a",
  measurementId: "G-PKDBVPZQQV"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

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
      createdAt: new Date(),
      permissions: {
        canJudge: true,
        canViewScores: true,
        canManageScores: true
      }
    };

    await setDoc(doc(db, 'judges', userRecord.uid), judgeData);
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
          updatedAt: new Date(),
          permissions: {
            canJudge: true,
            canViewScores: true,
            canManageScores: true
          }
        };

        await setDoc(doc(db, 'judges', userRecord.uid), judgeData, { merge: true });
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
