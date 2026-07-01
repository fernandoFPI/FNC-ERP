import { emailWrapper } from './base.js'

export function renderPasswordResetEmail(data: {
  resetUrl: string
  expiresInMinutes: number
  ipAddress: string
}): string {
  return emailWrapper(
    'Password Reset Request',
    'Reset your FNC ERP password',
    `
      <h2>Password Reset</h2>
      <p>
        We received a request to reset the password for your FNC ERP account.
        Click the button below to set a new password.
      </p>

      <p style="text-align:center;margin:28px 0">
        <a href="${data.resetUrl}" class="btn">Reset Password</a>
      </p>

      <p style="font-size:12px;color:#666;word-break:break-all">
        Or copy this link into your browser:<br>
        ${data.resetUrl}
      </p>

      <div class="alert alert-warning">
        This link expires in <strong>${data.expiresInMinutes} minutes</strong>.
        If you did not request a password reset, you can safely ignore this email.
        Your password will not change.
      </div>

      <table class="info-table">
        <tr><td>Request from IP</td><td>${data.ipAddress}</td></tr>
      </table>
    `,
  )
}
