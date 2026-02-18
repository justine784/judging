// Firebase Configuration Validation Script
// Run this with: node validate-firebase.js

const firebaseConfig = {
  apiKey: "AIzaSyD9-7W1EtFevUqrBcVruR3oHgXEc4K4KcQ",
  authDomain: "judging-2a4da.firebaseapp.com",
  projectId: "judging-2a4da",
  storageBucket: "judging-2a4da.firebasestorage.app",
  messagingSenderId: "954134091247",
  appId: "1:954134091247:web:df9aea8c36ea8c64d2d21a",
  measurementId: "G-PKDBVPZQQV"
};

console.log('Firebase Configuration Validation');
console.log('==================================');

// Check required fields
const requiredFields = ['apiKey', 'authDomain', 'projectId', 'appId'];
let allValid = true;

requiredFields.forEach(field => {
  if (!firebaseConfig[field]) {
    console.log(`❌ Missing required field: ${field}`);
    allValid = false;
  } else {
    console.log(`✅ ${field}: ${firebaseConfig[field]}`);
  }
});

// Check API key format
if (firebaseConfig.apiKey) {
  const apiKeyRegex = /^AIza[0-9A-Za-z_-]{35}$/;
  if (apiKeyRegex.test(firebaseConfig.apiKey)) {
    console.log('✅ API key format appears valid');
  } else {
    console.log('❌ API key format may be invalid');
    allValid = false;
  }
}

// Check authDomain format
if (firebaseConfig.authDomain) {
  const expectedDomain = `${firebaseConfig.projectId}.firebaseapp.com`;
  if (firebaseConfig.authDomain === expectedDomain) {
    console.log('✅ Auth domain matches project ID');
  } else {
    console.log(`❌ Auth domain mismatch. Expected: ${expectedDomain}, Got: ${firebaseConfig.authDomain}`);
    allValid = false;
  }
}

console.log('\nValidation Result:', allValid ? '✅ PASSED' : '❌ FAILED');

if (allValid) {
  console.log('\nNext steps:');
  console.log('1. Ensure Email/Password authentication is enabled in Firebase Console');
  console.log('2. Check if API key has proper restrictions');
  console.log('3. Verify project is active and not disabled');
  console.log('4. Test with /test-firebase route');
}
