import { adminDb } from '@/lib/firebase-admin';

export async function POST(request) {
  try {
    const { email, referenceNumber, userType } = await request.json();

    if (!email || !referenceNumber || !userType) {
      return Response.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Create a password reset record with reference number
    const resetRecord = {
      email: email,
      referenceNumber: referenceNumber,
      userType: userType,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      status: 'pending'
    };

    // Store the reset request in Firestore
    await adminDb.collection('passwordResetRequests').add(resetRecord);

    // Store email content for admin reference
    const emailContent = `
      Password Reset Request - ${userType.toUpperCase()} ACCOUNT
      
      Email: ${email}
      Reference Number: ${referenceNumber}
      User Type: ${userType}
      Requested: ${new Date().toLocaleString()}
      Expires: ${new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleString()}
      
      Instructions:
      1. Verify this request in the admin dashboard
      2. Use the reference number to track the reset request
      3. Contact the user if additional verification is needed
    `;

    await adminDb.collection('emailLogs').add({
      to: email,
      subject: `Password Reset Request - ${userType.charAt(0).toUpperCase() + userType.slice(1)} Account`,
      referenceNumber: referenceNumber,
      userType: userType,
      content: emailContent.trim(),
      sentAt: new Date(),
      type: 'password_reset_request',
      status: 'logged_for_admin'
    });

    return Response.json({
      success: true,
      message: 'Password reset request logged successfully',
      referenceNumber: referenceNumber,
      instructions: `Reference number ${referenceNumber} has been generated. The administrator will review your request and send a reset link to your Gmail account.`
    });

  } catch (error) {
    console.error('Error processing password reset request:', error);
    return Response.json(
      { error: 'Failed to process password reset request' },
      { status: 500 }
    );
  }
}
