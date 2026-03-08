# Email Configuration Guide - Judging & Tabulation System

## Overview
The Judging & Tabulation System now sends beautifully branded emails featuring:
- 🏛️ **Bongabong Municipality Logo**
- 🎨 **Green/Emerald themed design** matching the system
- 📧 **Professional email template** with the "Judging & Tabulation System" branding

---

## Gmail SMTP Setup

### Step 1: Enable 2-Factor Authentication
1. Go to your Google Account: https://myaccount.google.com
2. Click on **Security** in the left sidebar
3. Under "How you sign in to Google", click **2-Step Verification**
4. Follow the prompts to enable 2FA

### Step 2: Generate App Password
1. Go to: https://myaccount.google.com/apppasswords
2. Select **App**: Mail
3. Select **Device**: Other (Custom name)
4. Enter name: `Judging System`
5. Click **Generate**
6. **Copy the 16-character password** (e.g., `xxxx xxxx xxxx xxxx`)

### Step 3: Create Environment File
Create a `.env.local` file in the root of your project:

```env
# Gmail SMTP Configuration
GMAIL_USER=your-actual-email@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx

# Base URL (for email links and logo)
NEXT_PUBLIC_BASE_URL=https://judging-2a4da.firebaseapp.com
```

---

## Email Features

### Password Reset Email
The system now sends a branded password reset email with:
- ✅ Bongabong Municipality logo
- ✅ "Judging & Tabulation System" header
- ✅ Green/emerald color theme
- ✅ Reference number in a styled box
- ✅ Clear instructions in Filipino & English
- ✅ Security notice
- ✅ Professional footer with copyright

### Email Template Preview
The email includes:
1. **Header** - Logo + "Judging & Tabulation System" + Municipality info
2. **Body** - Greeting, explanation, reference number box
3. **Actions** - Big green "Reset Password" button
4. **Footer** - Copyright and automated message notice

---

## Testing the Email

### Option 1: Using the API
```bash
# Test custom branded email
curl -X POST http://localhost:3000/api/test-reset-email \
  -H "Content-Type: application/json" \
  -d '{"email": "test@gmail.com", "useCustomEmail": true}'
```

### Option 2: Using the Forgot Password Modal
1. Go to `/admin/login` or `/judge/login`
2. Click "Forgot password?"
3. Enter your email
4. Check your inbox for the branded email

---

## Troubleshooting

### Email not sending?
1. **Check GMAIL_USER**: Make sure it's a valid Gmail address
2. **Check GMAIL_APP_PASSWORD**: Must be 16 characters (no spaces when saved)
3. **2FA Required**: App passwords only work with 2FA enabled
4. **Check spam folder**: The email might be in spam initially

### Logo not showing?
- The logo is hosted at `/logo.jpg` on your deployed URL
- Make sure `NEXT_PUBLIC_BASE_URL` is set correctly
- The URL must be publicly accessible

### Error: "Authentication failed"
- Re-generate your App Password
- Make sure you're using App Password, not your Gmail password
- Check that 2FA is still enabled

---

## File Structure

```
src/
├── lib/
│   └── email-service.js     # Email sending and templates
└── app/
    └── api/
        ├── send-reset-email/route.js    # Send password reset
        ├── test-reset-email/route.js    # Test email sending
        └── log-reset-request/route.js   # Log requests
```

---

## Security Notes

⚠️ **Never commit `.env.local` to Git!**

The `.gitignore` should include:
```
.env.local
.env*.local
```

---

© 2026 Judging & Tabulation System | Municipality of Bongabong, Oriental Mindoro
