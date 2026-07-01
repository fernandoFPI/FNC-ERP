import { emailWrapper } from './base.js'

export function renderNewDeviceLoginEmail(data: {
  deviceName: string
  platform: string
  ipAddress: string
  loginAt: string
}): string {
  return emailWrapper(
    'New Device Login',
    'A new device accessed your account',
    `
      <h2>New Device Login Detected</h2>
      <p>Your FNC ERP account was accessed from a new device.</p>

      <table class="info-table">
        <tr><td>Device</td><td>${data.deviceName}</td></tr>
        <tr><td>Platform</td><td>${data.platform}</td></tr>
        <tr><td>IP address</td><td>${data.ipAddress}</td></tr>
        <tr><td>Time</td><td>${data.loginAt}</td></tr>
      </table>

      <p>If this was you logging in from a new device, no action is needed.</p>

      <div class="alert alert-warning">
        If this was not you, contact your system administrator immediately
        and change your password. You can revoke sessions from your account
        settings in FNC ERP.
      </div>
    `,
  )
}
