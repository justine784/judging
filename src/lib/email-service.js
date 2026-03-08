import nodemailer from 'nodemailer';

// Gmail SMTP Configuration
// Note: You need to use an App Password from Google Account settings
// Go to: Google Account > Security > 2-Step Verification > App Passwords
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER || 'your-email@gmail.com',
    pass: process.env.GMAIL_APP_PASSWORD || 'your-app-password'
  }
});

// Base URL for the application (update this to your deployed URL)
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://judging-2a4da.firebaseapp.com';

// Generate Password Reset Email HTML
export const generatePasswordResetEmail = (userType, referenceNumber, resetLink) => {
  const userTypeDisplay = userType.charAt(0).toUpperCase() + userType.slice(1);
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset - Judging & Tabulation System</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f0fdf4; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 50%, #bbf7d0 100%); padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 20px; box-shadow: 0 20px 60px rgba(34, 197, 94, 0.15); overflow: hidden;">
          
          <!-- Header with Logo -->
          <tr>
            <td style="background: linear-gradient(135deg, #166534 0%, #15803d 50%, #16a34a 100%); padding: 30px 40px; text-align: center;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <!-- Logo Container -->
                    <div style="background-color: #ffffff; width: 90px; height: 90px; border-radius: 50%; display: inline-block; padding: 5px; box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2); margin-bottom: 15px;">
                      <img src="${BASE_URL}/logo.jpg" alt="Bongabong Logo" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover;" />
                    </div>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 10px;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                      Judging & Tabulation System
                    </h1>
                    <p style="color: #bbf7d0; margin: 8px 0 0; font-size: 14px; letter-spacing: 1px;">
                      MUNICIPALITY OF BONGABONG
                    </p>
                    <p style="color: #86efac; margin: 5px 0 0; font-size: 12px;">
                      Oriental Mindoro, Philippines
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 40px;">
              
              <!-- Title -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 30px;">
                <tr>
                  <td align="center">
                    <div style="background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%); border-radius: 50%; width: 70px; height: 70px; display: inline-block; text-align: center; line-height: 70px; margin-bottom: 15px;">
                      <span style="font-size: 32px;">🔐</span>
                    </div>
                    <h2 style="color: #166534; margin: 0; font-size: 24px; font-weight: 600;">
                      Password Reset Request
                    </h2>
                    <p style="color: #6b7280; margin: 10px 0 0; font-size: 15px;">
                      ${userTypeDisplay} Account Recovery
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Greeting -->
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                Magandang araw!
              </p>
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 25px;">
                We received a password reset request for your <strong style="color: #166534;">${userTypeDisplay}</strong> account in the Judging & Tabulation System. If you made this request, please use the information below to reset your password.
              </p>

              <!-- Reference Number Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 25px;">
                <tr>
                  <td style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border: 2px solid #86efac; border-radius: 15px; padding: 25px; text-align: center;">
                    <p style="color: #15803d; margin: 0 0 10px; font-size: 13px; text-transform: uppercase; letter-spacing: 2px; font-weight: 600;">
                      📋 Your Reference Number
                    </p>
                    <div style="background-color: #ffffff; border: 2px dashed #22c55e; border-radius: 10px; padding: 15px; margin: 10px 0;">
                      <p style="color: #166534; margin: 0; font-size: 28px; font-weight: 700; font-family: 'Courier New', monospace; letter-spacing: 3px;">
                        ${referenceNumber}
                      </p>
                    </div>
                    <p style="color: #6b7280; margin: 10px 0 0; font-size: 13px;">
                      ⚠️ Please save this reference number for your records
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Instructions -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 25px;">
                <tr>
                  <td style="background-color: #fefce8; border-left: 4px solid #eab308; border-radius: 0 10px 10px 0; padding: 20px;">
                    <p style="color: #a16207; margin: 0 0 12px; font-size: 16px; font-weight: 600;">
                      📝 Instructions:
                    </p>
                    <ol style="color: #374151; margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8;">
                      <li>Click the "Reset Password" button below</li>
                      <li>Create a new secure password (at least 6 characters)</li>
                      <li>Use your new password to log in to the system</li>
                      <li>Keep your reference number for verification if needed</li>
                    </ol>
                  </td>
                </tr>
              </table>

              <!-- Reset Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <a href="${resetLink}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #166534 0%, #15803d 50%, #16a34a 100%); color: #ffffff; padding: 18px 45px; text-decoration: none; border-radius: 30px; font-weight: 600; font-size: 16px; box-shadow: 0 8px 25px rgba(22, 101, 52, 0.35); letter-spacing: 0.5px;">
                      🔑 Reset My Password
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Alternative Link -->
              <p style="color: #6b7280; font-size: 13px; line-height: 1.5; margin: 0 0 10px;">
                If the button doesn't work, copy and paste this link in your browser:
              </p>
              <p style="background-color: #f3f4f6; padding: 12px 15px; border-radius: 8px; word-break: break-all; font-size: 12px; color: #4b5563; margin: 0 0 25px; font-family: 'Courier New', monospace;">
                ${resetLink}
              </p>

              <!-- Security Notice -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 20px;">
                <tr>
                  <td style="background-color: #fef2f2; border-left: 4px solid #ef4444; border-radius: 0 10px 10px 0; padding: 15px;">
                    <p style="color: #dc2626; margin: 0 0 5px; font-size: 14px; font-weight: 600;">
                      🔒 Security Notice
                    </p>
                    <p style="color: #6b7280; margin: 0; font-size: 13px; line-height: 1.5;">
                      If you did not request this password reset, please ignore this email or contact the system administrator immediately. This link will expire in 24 hours.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Expiry Notice -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 15px; background-color: #f0fdf4; border-radius: 10px;">
                    <p style="color: #15803d; margin: 0; font-size: 13px;">
                      ⏰ This password reset link will expire in <strong>24 hours</strong>
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%); padding: 30px 40px; border-top: 1px solid #e5e7eb;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <img src="${BASE_URL}/logo.jpg" alt="Bongabong Logo" style="width: 45px; height: 45px; border-radius: 50%; margin-bottom: 12px; border: 2px solid #22c55e;" />
                    <p style="color: #166534; margin: 0; font-size: 14px; font-weight: 600;">
                      Judging & Tabulation System
                    </p>
                    <p style="color: #6b7280; margin: 8px 0 0; font-size: 12px;">
                      Municipality of Bongabong, Oriental Mindoro
                    </p>
                    <p style="color: #9ca3af; margin: 15px 0 0; font-size: 11px;">
                      © 2026 All Rights Reserved
                    </p>
                    <p style="color: #d1d5db; margin: 8px 0 0; font-size: 10px;">
                      This is an automated message. Please do not reply to this email.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

// Send Email Function
export const sendEmail = async ({ to, subject, html }) => {
  try {
    const mailOptions = {
      from: `"Judging & Tabulation System" <${process.env.GMAIL_USER || 'noreply@bongabong.gov.ph'}>`,
      to: to,
      subject: subject,
      html: html
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};

// Send Password Reset Email
export const sendPasswordResetEmailCustom = async (email, userType, referenceNumber, resetLink) => {
  const subject = `🔐 Password Reset Request - ${userType.charAt(0).toUpperCase() + userType.slice(1)} Account | Judging & Tabulation System`;
  const html = generatePasswordResetEmail(userType, referenceNumber, resetLink);
  
  return sendEmail({
    to: email,
    subject: subject,
    html: html
  });
};

export default transporter;
