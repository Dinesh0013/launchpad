import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = "Launchpad <noreply@launchpad.app>";

function button(label: string, href: string): string {
  return `
    <a href="${href}" style="
      display:inline-block;
      background:#18181b;
      color:#ffffff;
      text-decoration:none;
      padding:12px 24px;
      border-radius:8px;
      font-size:14px;
      font-weight:600;
      margin-top:24px;
    ">${label}</a>`;
}

function layout(body: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8" /></head>
      <body style="font-family:system-ui,sans-serif;background:#f9fafb;margin:0;padding:40px 16px;">
        <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:40px;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:32px;">
            <div style="width:32px;height:32px;background:#18181b;border-radius:8px;display:flex;align-items:center;justify-content:center;">
              <div style="width:14px;height:14px;background:#fff;border-radius:4px;"></div>
            </div>
            <span style="font-size:16px;font-weight:700;color:#18181b;">Launchpad</span>
          </div>
          ${body}
          <p style="font-size:12px;color:#9ca3af;margin-top:32px;border-top:1px solid #f3f4f6;padding-top:16px;">
            You received this email because you have an account on Launchpad.
          </p>
        </div>
      </body>
    </html>`;
}

export async function sendDeploySuccess(
  to: string,
  siteUrl: string,
  siteName: string
): Promise<void> {
  const html = layout(`
    <h2 style="font-size:20px;font-weight:700;color:#18181b;margin:0 0 8px;">Your site is live 🎉</h2>
    <p style="font-size:15px;color:#374151;margin:0;">
      Your site <strong>${siteName}</strong> is now live at:<br />
      <a href="${siteUrl}" style="color:#2563eb;">${siteUrl}</a>
    </p>
    ${button("Visit your site →", siteUrl)}
  `);

  await resend.emails.send({
    from: FROM,
    to: [to],
    subject: `Your site is live — ${siteName}`,
    html,
  });
}

export async function sendDeployFailed(
  to: string,
  siteName: string,
  dashboardUrl: string
): Promise<void> {
  const html = layout(`
    <h2 style="font-size:20px;font-weight:700;color:#18181b;margin:0 0 8px;">Deployment failed</h2>
    <p style="font-size:15px;color:#374151;margin:0;">
      Something went wrong deploying <strong>${siteName}</strong>.
      Click below to try again or check your files.
    </p>
    ${button("Go to dashboard →", dashboardUrl)}
  `);

  await resend.emails.send({
    from: FROM,
    to: [to],
    subject: `Deployment failed — ${siteName}`,
    html,
  });
}
