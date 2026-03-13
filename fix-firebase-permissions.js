// Firebase Permissions Fix Script
// Run this in browser console on admin page to fix permissions

async function fixFirebasePermissions() {
  console.log('🔧 Starting Firebase permissions fix...');
  
  try {
    // Import Firebase modules
    const { auth } = await import('@/lib/firebase');
    const { doc, getDoc, setDoc, collection, getDocs } = await import('firebase/firestore');
    const { db } = await import('@/lib/firebase');
    
    // Check current user
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.error('❌ No user logged in. Please login first.');
      return;
    }
    
    console.log('✅ Current user:', currentUser.email);
    console.log('✅ User UID:', currentUser.uid);
    
    // Test basic Firestore access
    console.log('🔍 Testing Firestore access...');
    
    try {
      // Try to read events collection
      const eventsQuery = collection(db, 'events');
      const eventsSnapshot = await getDocs(eventsQuery);
      console.log(`✅ Events access: SUCCESS (${eventsSnapshot.size} events found)`);
    } catch (eventsError) {
      console.error('❌ Events access failed:', eventsError.code, eventsError.message);
      
      // If permission denied, try to create admin user document
      if (eventsError.code === 'permission-denied') {
        console.log('🔧 Attempting to create admin user document...');
        
        try {
          // Create admin user in judges collection
          const adminDoc = doc(db, 'judges', currentUser.uid);
          await setDoc(adminDoc, {
            email: currentUser.email,
            name: currentUser.email.split('@')[0],
            role: 'admin',
            assignedEvents: [],
            createdAt: new Date().toISOString(),
            isActive: true
          });
          
          console.log('✅ Admin user document created successfully!');
          console.log('🔄 Please refresh the page and try again.');
          
        } catch (createError) {
          console.error('❌ Failed to create admin document:', createError.code, createError.message);
          
          // If still permission denied, provide manual fix instructions
          if (createError.code === 'permission-denied') {
            console.log(`
🔧 MANUAL FIX REQUIRED:

1. Go to Firebase Console: https://console.firebase.google.com
2. Select project: judging-2a4da
3. Go to Firestore Database → Rules
4. Replace existing rules with:

rules_version='2'
service cloud.firestore {
  match /databases/{database}/documents {
    // Temporary: Allow any authenticated user
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}

5. Click "Publish"
6. Refresh this page
7. After fixing, restore proper security rules
            `);
          }
        }
      }
    }
    
    // Test other collections
    const collections = ['judges', 'contestants', 'scores'];
    for (const collectionName of collections) {
      try {
        const collQuery = collection(db, collectionName);
        const snapshot = await getDocs(collQuery);
        console.log(`✅ ${collectionName} access: SUCCESS (${snapshot.size} documents)`);
      } catch (error) {
        console.error(`❌ ${collectionName} access failed:`, error.code);
      }
    }
    
    console.log('🔧 Permissions fix completed!');
    
  } catch (error) {
    console.error('❌ Fix failed:', error);
  }
}

// Auto-run the fix
fixFirebasePermissions();

// Also provide helper functions
window.createAdminUser = async function(email = 'admin@gmail.com', password = 'admin123') {
  try {
    const { auth } = await import('@/lib/firebase');
    const { createUserWithEmailAndPassword } = await import('firebase/auth');
    
    console.log('🔧 Creating admin user:', email);
    const result = await createUserWithEmailAndPassword(auth, email, password);
    console.log('✅ Admin user created:', result.user.email);
    return result;
  } catch (error) {
    console.error('❌ Failed to create admin user:', error.code, error.message);
    return null;
  }
};

window.checkPermissions = async function() {
  try {
    const { auth } = await import('@/lib/firebase');
    const { doc, getDoc, collection, getDocs } = await import('firebase/firestore');
    const { db } = await import('@/lib/firebase');
    
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.log('❌ No user logged in');
      return;
    }
    
    console.log('🔍 Checking permissions for:', currentUser.email);
    
    // Check if user is admin
    const isAdmin = currentUser.email === 'admin@gmail.com';
    console.log('👤 Is admin:', isAdmin);
    
    // Check Firestore access
    const tests = [
      { name: 'events', collection: 'events' },
      { name: 'judges', collection: 'judges' },
      { name: 'contestants', collection: 'contestants' },
      { name: 'scores', collection: 'scores' }
    ];
    
    for (const test of tests) {
      try {
        const query = collection(db, test.collection);
        const snapshot = await getDocs(query);
        console.log(`✅ ${test.name}: ${snapshot.size} documents`);
      } catch (error) {
        console.log(`❌ ${test.name}: ${error.code}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Permission check failed:', error);
  }
};

console.log('🔧 Firebase permissions fix loaded!');
console.log('Run window.checkPermissions() to test access');
console.log('Run window.createAdminUser() to create admin account');
