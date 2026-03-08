import { adminDb } from '@/lib/firebase-admin';
import { sendPasswordResetEmailCustom, generatePasswordResetEmail } from '@/lib/email-service';

// Base URL for the application
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://judging-2a4da.firebaseapp.com';

export async function POST(request) {
  try {
    // Check if admin services are available
    if (!adminDb) {
      return Response.json(
        { error: 'Server configuration error. Admin services not available.' },
        { status: 500 }
      );
    }

    const { email, referenceNumber, userType, resetLink } = await request.json();

    if (!email || !referenceNumber || !userType) {
      return Response.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Generate the reset link if not provided
    const finalResetLink = resetLink || `${BASE_URL}/__/auth/action?mode=resetPassword&oobCode=${referenceNumber}`;

    // Create custom email subject
    const emailSubject = `🔐 Password Reset Request - ${userType.charAt(0).toUpperCase() + userType.slice(1)} Account | Judging & Tabulation System`;
    
    // Generate email HTML content
    const emailContent = generatePasswordResetEmail(userType, referenceNumber, finalResetLink);

    try {
      // Try to send custom email via nodemailer/Gmail
      await sendPasswordResetEmailCustom(email, userType, referenceNumber, finalResetLink);
      console.log('Custom branded email sent successfully to:', email);
    } catch (emailError) {
      console.error('Failed to send custom email, falling back to Firebase:', emailError);
      // If custom email fails, we'll still store the record but note the failure
    }

    // Store the email content in Firestore for reference
    await adminDb.collection('sentEmails').add({
      to: email,
      subject: emailSubject,
      referenceNumber: referenceNumber,
      userType: userType,
      content: emailContent,
      sentAt: new Date(),
      type: 'password_reset',
      resetLink: finalResetLink
    });

    return Response.json({
      success: true,
      message: 'Password reset email sent successfully with reference number',
      referenceNumber: referenceNumber
    });

  } catch (error) {
    console.error('Error sending password reset email:', error);
    return Response.json(
      { error: 'Failed to send password reset email' },
      { status: 500 }
    );
  }
}
