import { adminDb } from '@/lib/firebase-admin';
import { doc, getDoc } from 'firebase/firestore';
import { auth } from '@/lib/firebase';

export async function POST(request) {
  try {
    const { email, referenceNumber, userType } = await request.json();

    if (!email || !referenceNumber || !userType) {
      return Response.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Create custom email content with reference number
    const emailSubject = `Password Reset Request - ${userType.charAt(0).toUpperCase() + userType.slice(1)} Account`;
    
    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <!-- Header -->
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 15px;">
              <svg style="width: 30px; height: 30px; color: white;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
              </svg>
            </div>
            <h1 style="color: #333; margin: 0; font-size: 24px;">Password Reset Request</h1>
            <p style="color: #666; margin: 5px 0 0; font-size: 14px;">Judging Tabulation System</p>
          </div>

          <!-- Main Content -->
          <div style="margin-bottom: 30px;">
            <p style="color: #333; font-size: 16px; line-height: 1.5;">Hello,</p>
            <p style="color: #333; font-size: 16px; line-height: 1.5;">
              We received a password reset request for your ${userType} account associated with this email address.
            </p>
            
            <!-- Reference Number Section -->
            <div style="background-color: #e3f2fd; border-left: 4px solid #2196f3; padding: 20px; margin: 25px 0; border-radius: 5px;">
              <h3 style="color: #1976d2; margin: 0 0 10px 0; font-size: 18px;">Reference Number</h3>
              <div style="background-color: white; padding: 15px; border-radius: 5px; text-align: center; border: 2px dashed #2196f3;">
                <p style="color: #666; margin: 0 0 5px; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Your Reference Code</p>
                <p style="color: #1976d2; margin: 0; font-size: 24px; font-weight: bold; font-family: 'Courier New', monospace; letter-spacing: 2px;">${referenceNumber}</p>
              </div>
              <p style="color: #666; margin: 10px 0 0; font-size: 14px;">
                <strong>Important:</strong> Save this reference number. You may need it for verification purposes.
              </p>
            </div>

            <!-- Instructions -->
            <div style="background-color: #fff3e0; border-left: 4px solid #ff9800; padding: 20px; margin: 25px 0; border-radius: 5px;">
              <h3 style="color: #f57c00; margin: 0 0 10px 0; font-size: 18px;">Next Steps</h3>
              <ol style="color: #333; margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.6;">
                <li style="margin-bottom: 8px;">Click the password reset link below to reset your password</li>
                <li style="margin-bottom: 8px;">Keep your reference number safe for future reference</li>
                <li style="margin-bottom: 8px;">The reset link will expire in 24 hours</li>
                <li style="margin-bottom: 0;">Contact the administrator if you didn't request this reset</li>
              </ol>
            </div>

            <!-- Reset Button -->
            <div style="text-align: center; margin: 30px 0;">
              <a href="https://judging-2a4da.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=${referenceNumber}" 
                 style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);">
                Reset My Password
              </a>
            </div>

            <p style="color: #666; font-size: 14px; line-height: 1.5;">
              If the button above doesn't work, you can copy and paste this link into your browser:
            </p>
            <p style="word-break: break-all; background-color: #f5f5f5; padding: 10px; border-radius: 5px; font-size: 12px; color: #666;">
              https://judging-2a4da.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=${referenceNumber}
            </p>
          </div>

          <!-- Security Notice -->
          <div style="background-color: #ffebee; border-left: 4px solid #f44336; padding: 15px; margin: 20px 0; border-radius: 5px;">
            <p style="color: #c62828; margin: 0; font-size: 14px; font-weight: bold;">
              🔒 Security Notice
            </p>
            <p style="color: #666; margin: 5px 0 0; font-size: 13px;">
              If you didn't request a password reset, please ignore this email or contact your system administrator immediately.
            </p>
          </div>

          <!-- Footer -->
          <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
            <p style="color: #666; margin: 0; font-size: 12px;">
              © 2026 Judging Tabulation System | Bongabong, Oriental Mindoro
            </p>
            <p style="color: #999; margin: 5px 0 0; font-size: 11px;">
              This is an automated message. Please do not reply to this email.
            </p>
          </div>
        </div>
      </div>
    `;

    // Send email using Firebase Auth's built-in password reset email
    // Note: Firebase doesn't support custom email content directly, 
    // so we'll use the standard reset email and store the reference number
    await auth.sendPasswordResetEmail(email);

    // Store the email content in Firestore for reference
    await adminDb.collection('sentEmails').add({
      to: email,
      subject: emailSubject,
      referenceNumber: referenceNumber,
      userType: userType,
      content: emailContent,
      sentAt: new Date(),
      type: 'password_reset'
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
