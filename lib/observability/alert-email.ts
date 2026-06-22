import type { SystemEventSeverity } from "@/lib/observability/system-events";
import type { DailyHealthSummary } from "@/lib/observability/daily-summary";

function parseAlertRecipients() {
  return (process.env.OPS_ALERT_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

async function sendResendEmail(input: { subject: string; text: string; html: string }) {
  const recipients = parseAlertRecipients();
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const replyTo = process.env.RESEND_REPLY_TO_EMAIL || fromEmail;

  if (!recipients.length || !apiKey || !fromEmail) {
    throw new Error("Ops alert email is not configured. Set OPS_ALERT_EMAILS, RESEND_API_KEY, and RESEND_FROM_EMAIL.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      reply_to: replyTo ? [replyTo] : undefined,
      to: recipients,
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`Failed to send email: ${payload}`);
  }
}

export async function sendOpsAlertEmail(input: {
  subject: string;
  severity: SystemEventSeverity;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const subject = `[ActivationIQ][${input.severity.toUpperCase()}] ${input.subject}`;
  const text = [subject, "", input.message, input.metadata ? JSON.stringify(input.metadata, null, 2) : ""].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5">
      <h2 style="margin:0 0 12px">${subject}</h2>
      <p style="margin:0 0 10px;white-space:pre-wrap">${input.message}</p>
      ${input.metadata ? `<pre style="background:#f3f4f6;padding:12px;border-radius:8px;font-size:12px">${JSON.stringify(input.metadata, null, 2)}</pre>` : ""}
    </div>
  `;

  await sendResendEmail({ subject, text, html });
}

export async function sendDailyHealthEmail(summary: DailyHealthSummary) {
  const subject = "ActivationIQ Daily Health Report";
  const topCampaignsText = summary.topCampaigns.length
    ? summary.topCampaigns.map((c, i) => `${i + 1}. ${c.name} — ${c.submissions} submissions`).join("\n")
    : "No campaign activity today.";
  const topCampaignsHtml = summary.topCampaigns.length
    ? `<ol>${summary.topCampaigns.map((c) => `<li>${c.name} — ${c.submissions} submissions</li>`).join("")}</ol>`
    : "<p>No campaign activity today.</p>";

  const text = [
    `${subject} — ${summary.date}`,
    "",
    `Total submissions: ${summary.totalSubmissions}`,
    `Active users: ${summary.activeUsers}`,
    `Failed logins: ${summary.failedLogins}`,
    `Errors: ${summary.errorCount}`,
    `Storage growth: ${summary.storageGrowthLabel}`,
    `CPU/RAM usage: ${summary.cpuRamNote}`,
    "",
    "Top campaigns:",
    topCampaignsText,
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5">
      <h2 style="margin:0 0 12px">${subject} — ${summary.date}</h2>
      <ul>
        <li>Total submissions: ${summary.totalSubmissions}</li>
        <li>Active users: ${summary.activeUsers}</li>
        <li>Failed logins: ${summary.failedLogins}</li>
        <li>Errors: ${summary.errorCount}</li>
        <li>Storage growth: ${summary.storageGrowthLabel}</li>
        <li>CPU/RAM usage: ${summary.cpuRamNote}</li>
      </ul>
      <h3>Top campaigns</h3>
      ${topCampaignsHtml}
    </div>
  `;

  await sendResendEmail({ subject, text, html });
}
