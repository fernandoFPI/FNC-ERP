import { emailWrapper } from './base.js'

export function renderPasswordChangedEmail(data: { changedAt: string; ipAddress: string }): string {
  return emailWrapper(
    'Password Changed',
    'Your password has been updated',
    `
      <h2>Password Changed Successfully</h2>
      <p>Your FNC ERP password was successfully changed.</p>

      <table class="info-table">
        <tr><td>Changed at</td><td>${data.changedAt}</td></tr>
        <tr><td>From IP</td><td>${data.ipAddress}</td></tr>
      </table>

      <div class="alert alert-warning">
        If you did not make this change, contact your system administrator
        immediately and change your password again. All active sessions
        have been terminated as a security measure.
      </div>
    `,
  )
}
