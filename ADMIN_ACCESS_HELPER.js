// Admin Access Helper - Run this in browser console to debug Firebase auth issues
// Copy and paste this code into the browser console when on the admin page

async function debugFirebaseAuth() {
  console.log('=== Firebase Auth Debug ===');
  
  // Check Firebase auth state
  const { auth } = await import('@/lib/firebase');
  const currentUser = auth.currentUser;
  
  console.log('Current User:', currentUser);
  console.log('User Email:', currentUser?.email);
  console.log('User UID:', currentUser?.uid);
  console.log('Is Admin:', currentUser?.email === 'admin@gmail.com');
  
  // Check if user exists in Firestore
  if (currentUser) {
    try {
      const { doc, getDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      
      // Check if user exists in judges collection
      const judgeDoc = await getDoc(doc(db, 'judges', currentUser.uid));
      console.log('Judge Document Exists:', judgeDoc.exists());
      if (judgeDoc.exists()) {
        console.log('Judge Data:', judgeDoc.data());
      }
      
      // Try to access events collection
      try {
        const { collection, getDocs } = await import('firebase/firestore');
        const eventsSnapshot = await getDocs(collection(db, 'events'));
        console.log('Events Access: SUCCESS - Found', eventsSnapshot.size, 'events');
      } catch (eventsError) {
        console.error('Events Access: FAILED', eventsError.code, eventsError.message);
      }
      
    } catch (firestoreError) {
      console.error('Firestore Error:', firestoreError);
    }
  } else {
    console.log('No user is currently authenticated');
  }
  
  console.log('=== End Debug ===');
}

// Auto-run the debug function
debugFirebaseAuth();

// Also provide a manual login helper
window.loginAsAdmin = async function(email = 'admin@gmail.com', password = 'your-password') {
  try {
    const { auth } = await import('@/lib/firebase');
    const { signInWithEmailAndPassword } = await import('firebase/auth');
    
    console.log('Attempting to login as:', email);
    const result = await signInWithEmailAndPassword(auth, email, password);
    console.log('Login successful:', result.user.email);
    console.log('Please refresh the page to see changes');
    return result;
  } catch (error) {
    console.error('Login failed:', error.code, error.message);
    return null;
  }
};

console.log('Debug helper loaded. Run debugFirebaseAuth() to check auth state.');
console.log('Use window.loginAsAdmin("admin@gmail.com", "password") to test login.');
