// Simple API route for judge auth deletion
// This provides a fallback when Firebase Admin SDK is not configured

export async function POST(request) {
  // Set headers to ensure JSON response
  const headers = {
    'Content-Type': 'application/json',
  };

  try {
    const body = await request.json();
    const { uid } = body;

    if (!uid) {
      return Response.json({ 
        success: false,
        error: 'UID is required',
        received: body
      }, { 
        status: 400,
        headers 
      });
    }

    console.log(`Received request to delete auth account for UID: ${uid}`);

    // Check if Firebase Admin SDK environment variables are configured
    const hasAdminConfig = !!(process.env.FIREBASE_PROJECT_ID && 
                           process.env.FIREBASE_CLIENT_EMAIL && 
                           process.env.FIREBASE_PRIVATE_KEY);

    if (!hasAdminConfig) {
      console.warn('Firebase Admin SDK not configured. Returning manual deletion instructions.');
      
      return Response.json({ 
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
          FIREBASE_PROJECT_ID: !!process.env.FIREBASE_PROJECT_ID,
          FIREBASE_CLIENT_EMAIL: !!process.env.FIREBASE_CLIENT_EMAIL,
          FIREBASE_PRIVATE_KEY: !!process.env.FIREBASE_PRIVATE_KEY,
        }
      }, { 
        status: 503, // Service Unavailable
        headers 
      });
    }

    // Try to use Firebase Admin SDK if available
    try {
      // Dynamic import to avoid errors when SDK is not available
      const admin = require('firebase-admin');
      
      // Initialize if not already done
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          }),
        });
      }

      // Delete the user
      await admin.auth().deleteUser(uid);
      console.log(`Successfully deleted auth account for UID: ${uid}`);
      
      return Response.json({ 
        success: true, 
        message: 'Authentication account deleted successfully',
        uid: uid
      }, { 
        headers 
      });

    } catch (adminError) {
      console.error('Firebase Admin SDK error:', adminError);
      
      return Response.json({ 
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
      }, { 
        status: 500,
        headers 
      });
    }

  } catch (error) {
    console.error('API Error:', error);
    
    return Response.json({ 
      success: false,
      error: 'Internal server error',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { 
      status: 500,
      headers 
    });
  }
}
