// Simple API route for judge auth deletion
// This provides a fallback when Firebase Admin SDK is not configured

// Helper function to ensure consistent JSON responses
function createJsonResponse(data, status = 200) {
  const headers = {
    'Content-Type': 'application/json',
  };
  return new Response(JSON.stringify(data), {
    status,
    headers
  });
}

export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError);
      return createJsonResponse({ 
        success: false,
        error: 'Invalid JSON in request body',
        details: parseError.message
      }, 400);
    }
    
    const { uid } = body;

    console.log('Received request to delete auth account for UID:', uid);
    console.log('Request body:', body);

    if (!uid) {
      console.log('Missing UID in request');
      return createJsonResponse({ 
        success: false,
        error: 'UID is required',
        received: body
      }, 400);
    }

    console.log(`Attempting to delete auth account for UID: ${uid}`);

    // Check if Firebase Admin SDK environment variables are configured
    const envVars = {
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
      FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
      FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY
    };
    
    console.log('Environment variables status:', {
      FIREBASE_PROJECT_ID: !!envVars.FIREBASE_PROJECT_ID,
      FIREBASE_CLIENT_EMAIL: !!envVars.FIREBASE_CLIENT_EMAIL,
      FIREBASE_PRIVATE_KEY: !!envVars.FIREBASE_PRIVATE_KEY
    });

    const hasAdminConfig = !!(envVars.FIREBASE_PROJECT_ID && 
                           envVars.FIREBASE_CLIENT_EMAIL && 
                           envVars.FIREBASE_PRIVATE_KEY);

    if (!hasAdminConfig) {
      console.warn('Firebase Admin SDK not configured. Returning manual deletion instructions.');
      
      return createJsonResponse({ 
        success: false,
        error: 'Firebase Admin SDK not configured on server',
        details: 'Manual deletion required. Please delete the user from Firebase Console.',
        instructions: {
          step1: 'Go to Firebase Console: https://console.firebase.google.com',
          step2: 'Select your project',
          step3: 'Go to Authentication -> Users',
          step4: 'Find the user with UID: ' + uid,
          step5: 'Click the three-dot menu and select "Delete account"',
          step6: 'Confirm the deletion'
        },
        missingVars: {
          FIREBASE_PROJECT_ID: !!envVars.FIREBASE_PROJECT_ID,
          FIREBASE_CLIENT_EMAIL: !!envVars.FIREBASE_CLIENT_EMAIL,
          FIREBASE_PRIVATE_KEY: !!envVars.FIREBASE_PRIVATE_KEY,
        }
      }, 503);
    }

    // Try to use Firebase Admin SDK if available
    try {
      console.log('Attempting to initialize Firebase Admin SDK...');
      
      // Dynamic import to avoid errors when SDK is not available
      let admin;
      try {
        admin = require('firebase-admin');
        console.log('Firebase Admin SDK loaded successfully');
      } catch (importError) {
        console.error('Failed to import Firebase Admin SDK:', importError);
        throw new Error('Firebase Admin SDK not available. Please install firebase-admin package.');
      }
      
      // Initialize if not already done
      if (!admin.apps.length) {
        console.log('Initializing Firebase Admin SDK...');
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: envVars.FIREBASE_PROJECT_ID,
            clientEmail: envVars.FIREBASE_CLIENT_EMAIL,
            privateKey: envVars.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          }),
        });
        console.log('Firebase Admin SDK initialized successfully');
      } else {
        console.log('Firebase Admin SDK already initialized');
      }

      console.log('Attempting to delete user from Firebase Auth...');
      // Delete the user
      await admin.auth().deleteUser(uid);
      console.log(`Successfully deleted auth account for UID: ${uid}`);
      
      return createJsonResponse({ 
        success: true, 
        message: 'Authentication account deleted successfully',
        uid: uid
      });

    } catch (adminError) {
      console.error('Firebase Admin SDK error:', adminError);
      console.error('Admin error details:', {
        message: adminError.message,
        stack: adminError.stack,
        code: adminError.code,
        name: adminError.name
      });
      
      return createJsonResponse({ 
        success: false,
        error: 'Firebase Admin SDK error',
        details: adminError.message,
        instructions: {
          step1: 'Go to Firebase Console: https://console.firebase.google.com',
          step2: 'Select your project',
          step3: 'Go to Authentication -> Users',
          step4: 'Find the user with UID: ' + uid,
          step5: 'Click the three-dot menu and select "Delete account"',
          step6: 'Confirm the deletion'
        }
      }, 500);
    }

  } catch (error) {
    console.error('API Error:', error);
    console.error('API error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code
    });
    
    return createJsonResponse({ 
      success: false,
      error: 'Internal server error',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, 500);
  }
}
