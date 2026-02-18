import { auth } from '@/lib/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';

export async function POST(request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return Response.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    console.log('Testing password reset email to:', email);

    // Test sending password reset email
    await sendPasswordResetEmail(auth, email);

    console.log('Test password reset email sent successfully');

    return Response.json({
      success: true,
      message: 'Test password reset email sent successfully',
      email: email
    });

  } catch (error) {
    console.error('Test password reset error:', error);
    
    return Response.json(
      { 
        error: error.message || 'Failed to send test password reset email',
        code: error.code,
        details: error.toString()
      },
      { status: 500 }
    );
  }
}
