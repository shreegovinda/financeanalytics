/**
 * Shared HTML for outbound email.
 *
 * Every interpolated value goes through escapeHtml. Names come from user input
 * at registration, so interpolating them raw would let a user put markup into
 * an email that carries this app's branding.
 */

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout({ heading, subheading, body }) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 8px 8px 0 0; color: white;">
        <h1 style="margin: 0; font-size: 24px;">Finance Analytics</h1>
        <p style="margin: 5px 0 0 0; font-size: 14px;">${escapeHtml(subheading)}</p>
      </div>

      <div style="padding: 30px; background: #f8f9fa; border: 1px solid #e0e0e0; border-radius: 0 0 8px 8px;">
        ${heading ? `<p style="color: #333; font-size: 16px; margin-bottom: 20px;">${escapeHtml(heading)}</p>` : ''}
        ${body}

        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">

        <p style="color: #999; font-size: 12px; text-align: center; margin: 10px 0;">
          © 2026 Finance Analytics. All rights reserved.
        </p>
      </div>
    </div>
  `;
}

function codeBlock(otp, caption) {
  return `
    <div style="background: white; border: 2px solid #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
      <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;">${escapeHtml(caption)}</p>
      <p style="margin: 0; font-size: 36px; font-weight: bold; color: #667eea; letter-spacing: 5px;">${escapeHtml(otp)}</p>
    </div>
  `;
}

function button(url, label) {
  const safeUrl = escapeHtml(url);
  return `
    <div style="text-align: center; margin: 24px 0;">
      <a href="${safeUrl}"
         style="display: inline-block; background: #667eea; color: #ffffff; text-decoration: none;
                padding: 14px 28px; border-radius: 8px; font-size: 16px; font-weight: bold;">
        ${escapeHtml(label)}
      </a>
    </div>
    <p style="color: #999; font-size: 12px; margin: 8px 0;">
      If the button does not work, paste this link into your browser:<br>
      <span style="color: #667eea; word-break: break-all;">${safeUrl}</span>
    </p>
  `;
}

function otpEmail({ name, otp, expiryMinutes = 5 }) {
  return {
    subject: 'Your Finance Analytics OTP Code',
    html: layout({
      subheading: 'Secure Login',
      heading: `Hi ${name},`,
      body: `
        <p style="color: #666; font-size: 14px; margin-bottom: 20px;">
          Your one-time password (OTP) for Finance Analytics is:
        </p>
        ${codeBlock(otp, 'Enter this code to verify your identity:')}
        <p style="color: #999; font-size: 12px; margin: 20px 0;">
          This code will expire in ${escapeHtml(expiryMinutes)} minutes. Do not share it with anyone.
        </p>
        <p style="color: #999; font-size: 12px; margin: 15px 0;">
          If you didn't request this code, please ignore this email.
        </p>
      `,
    }),
  };
}

/**
 * Signup verification carries both a one-click link and the code beneath it, so
 * the link works on desktop and the code works when the mail client mangles it.
 */
function verificationEmail({ name, otp, verifyUrl, expiryMinutes = 30 }) {
  return {
    subject: 'Verify your Finance Analytics email',
    html: layout({
      subheading: 'Confirm your email',
      heading: `Hi ${name},`,
      body: `
        <p style="color: #666; font-size: 14px; margin-bottom: 20px;">
          Welcome to Finance Analytics. Confirm your email address to activate
          your account.
        </p>
        ${button(verifyUrl, 'Verify my email')}
        <p style="color: #666; font-size: 14px; margin: 24px 0 0 0;">
          Prefer to enter a code? Use this one:
        </p>
        ${codeBlock(otp, 'Verification code')}
        <p style="color: #999; font-size: 12px; margin: 20px 0;">
          The link and the code both expire in ${escapeHtml(expiryMinutes)} minutes.
        </p>
        <p style="color: #999; font-size: 12px; margin: 15px 0;">
          If you didn't create this account, you can ignore this email — the
          address will not be used until it is verified.
        </p>
      `,
    }),
  };
}

module.exports = {
  escapeHtml,
  layout,
  codeBlock,
  button,
  otpEmail,
  verificationEmail,
};
