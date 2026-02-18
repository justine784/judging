import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Test Firebase configuration by making a direct API call
    const firebaseConfig = {
      apiKey: "AIzaSyD9-7W1EtFevUqrBcVruR3oHgXEc4K4KcQ",
      authDomain: "judging-2a4da.firebaseapp.com",
      projectId: "judging-2a4da",
      appId: "1:954134091247:web:df9aea8c36ea8c64d2d21a"
    };

    // First test: Check if project exists by getting project info
    const projectInfoUrl = `https://firebase.googleapis.com/v1alpha/projects/${firebaseConfig.projectId}?key=${firebaseConfig.apiKey}`;
    
    let projectInfoResponse;
    try {
      projectInfoResponse = await fetch(projectInfoUrl);
    } catch (projectError) {
      return NextResponse.json({
        success: false,
        error: 'Project lookup failed',
        details: projectError.message,
        config: {
          projectId: firebaseConfig.projectId,
          apiKeyValid: firebaseConfig.apiKey.startsWith('AIza'),
          apiKeyLength: firebaseConfig.apiKey.length
        },
        troubleshooting: [
          '1. Check if project ID "judging-2a4da" exists in Firebase Console',
          '2. Verify the API key is valid for this project',
          '3. Ensure the project is not deleted or disabled'
        ]
      });
    }

    // Test the Firebase Auth API endpoint directly
    const testUrl = `https://identitytoolkit.googleapis.com/v1/projects/${firebaseConfig.projectId}/accounts:signInWithPassword?key=${firebaseConfig.apiKey}`;
    
    const response = await fetch(testUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'test123456',
        returnSecureToken: true
      })
    });

    const responseData = await response.json();
    
    return NextResponse.json({
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      data: responseData,
      config: {
        projectId: firebaseConfig.projectId,
        authDomain: firebaseConfig.authDomain,
        apiKeyValid: firebaseConfig.apiKey.startsWith('AIza'),
        apiKeyLength: firebaseConfig.apiKey.length
      },
      projectInfo: {
        projectExists: projectInfoResponse.ok,
        projectStatus: projectInfoResponse.status
      },
      troubleshooting: [
        'If you see "PROJECT_NOT_FOUND": Project ID is incorrect',
        'If you see "API_KEY_NOT_FOUND": API key is invalid',
        'If you see "EMAIL_NOT_FOUND" or "INVALID_PASSWORD": Auth is working but user doesn\'t exist',
        'If you see "IDENTITY_TOOLKIT_MISSING_OR_INVALID_API_KEY": Email/Password auth not enabled'
      ]
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack,
      troubleshooting: [
        'Check your Firebase project configuration',
        'Ensure Email/Password authentication is enabled',
        'Verify API key permissions'
      ]
    }, { status: 500 });
  }
}
