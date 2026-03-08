import { auth } from '@/lib/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import { sendPasswordResetEmailCustom } from '@/lib/email-service';

export async function POST(request) {
  try {
    const { email, useCustomEmail } = await request.json();

    if (!email) {
      return Response.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    console.log('Testing password reset email to:', email);

    // Generate a test reference number
    const testRefNumber = `TEST-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
    const testResetLink = `https://judging-2a4da.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=TEST123`;

    if (useCustomEmail) {
      // Send custom branded email via nodemailer
      try {
        await sendPasswordResetEmailCustom(email, 'judge', testRefNumber, testResetLink);
        console.log('Custom branded test email sent successfully');
        
        return Response.json({
          success: true,
          message: 'Custom branded test email sent successfully! Check your inbox.',
          email: email,
          referenceNumber: testRefNumber,
          emailType: 'custom_branded'
        });
      } catch (customEmailError) {
        console.error('Custom email failed:', customEmailError);
        return Response.json({
          success: false,
          message: 'Failed to send custom email. Please check Gmail SMTP settings.',
          error: customEmailError.message
        }, { status: 500 });
      }
    } else {
      // Send Firebase default password reset email
      await sendPasswordResetEmail(auth, email);
      console.log('Firebase password reset email sent successfully');

      return Response.json({
        success: true,
        message: 'Firebase password reset email sent successfully',
        email: email,
        emailType: 'firebase_default'
      });
    }

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
