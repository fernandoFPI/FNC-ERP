export const EMAIL_BASE_STYLES = `
  body { margin:0; padding:0; background:#f4f6f9; font-family:Arial,sans-serif; }
  .wrapper { max-width:600px; margin:0 auto; padding:32px 16px; }
  .card { background:white; border-radius:8px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.1); }
  .header { background:#1a3c5e; padding:24px 32px; }
  .header h1 { color:white; font-size:18px; margin:0; }
  .header p { color:#a8c4e0; font-size:13px; margin:6px 0 0; }
  .body { padding:32px; }
  .body p { font-size:14px; color:#374151; line-height:1.6; margin:0 0 16px; }
  .body h2 { font-size:16px; color:#1a3c5e; margin:0 0 16px; }
  .info-table { width:100%; border-collapse:collapse; margin:16px 0; }
  .info-table td { padding:8px 12px; font-size:13px; border-bottom:1px solid #f0f0f0; }
  .info-table td:first-child { color:#666; width:40%; }
  .info-table td:last-child { color:#1a1a1a; font-weight:500; }
  .btn { display:inline-block; padding:12px 28px; background:#1a3c5e;
         color:white; text-decoration:none; border-radius:6px;
         font-size:14px; font-weight:600; margin:8px 0; }
  .alert { padding:12px 16px; border-radius:6px; margin:16px 0; font-size:13px; }
  .alert-warning { background:#fffbeb; border-left:3px solid #f59e0b; color:#92400e; }
  .alert-info    { background:#eff6ff; border-left:3px solid #3b82f6; color:#1e40af; }
  .footer { padding:24px 32px; background:#f8fafc; border-top:1px solid #e5e7eb; }
  .footer p { font-size:11px; color:#9ca3af; margin:0; line-height:1.6; }
  .amount { font-family:'Courier New',monospace; font-weight:600; }
`

export function emailWrapper(title: string, subtitle: string, bodyContent: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>${EMAIL_BASE_STYLES}</style>
    </head>
    <body>
    <div class="wrapper">
      <div class="card">
        <div class="header">
          <h1>FNC Group ERP</h1>
          <p>${subtitle}</p>
        </div>
        <div class="body">
          ${bodyContent}
        </div>
        <div class="footer">
          <p>
            This is an automated message from FNC Group ERP. Please do not reply directly.<br>
            &copy; ${new Date().getFullYear()} FNC Group. All rights reserved.
          </p>
        </div>
      </div>
    </div>
    </body>
    </html>
  `
}
