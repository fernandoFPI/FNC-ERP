import { emailWrapper } from './base.js'

export function renderMFASetupEmail(data: { employeeName: string }): string {
  return emailWrapper(
    'Two-Factor Authentication Enabled',
    'Your account security has been updated',
    `
      <h2>Two-Factor Authentication Enabled</h2>
      <p>Hello ${data.employeeName},</p>
      <p>
        Two-factor authentication (2FA) has been successfully enabled on
        your FNC ERP account. You will now be prompted for a verification
        code each time you log in.
      </p>

      <div class="alert alert-info">
        Make sure you keep your authenticator app accessible.
        If you lose access to your authenticator, contact your system administrator.
      </div>

      <p>
        If you did not enable 2FA on your account, contact your system
        administrator immediately.
      </p>
    `,
  )
}
