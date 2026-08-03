const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SMTP_HOST = Deno.env.get("SMTP_HOST") ?? "";
const SMTP_PORT = Deno.env.get("SMTP_PORT") ?? "587";
const SMTP_USER = Deno.env.get("SMTP_USER") ?? "";
const SMTP_PASS = Deno.env.get("SMTP_PASS") ?? "";
const SMTP_FROM = Deno.env.get("SMTP_FROM") ?? "prio@clipotapp.com";
const FROM_NAME = Deno.env.get("SMTP_FROM_NAME") ?? "Priorify";

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  if (RESEND_API_KEY) {
    return sendViaResend(params);
  }
  if (SMTP_HOST) {
    return sendViaSmtp(params);
  }
  console.warn("No email provider configured. Would send:", params.subject);
  return false;
}

async function sendViaResend({ to, subject, html }: SendEmailParams): Promise<boolean> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${FROM_NAME} <${SMTP_FROM}>`,
      to,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error (${res.status}): ${body}`);
  }

  return true;
}

async function sendViaSmtp({ to, subject, html }: SendEmailParams): Promise<boolean> {
  const port = parseInt(SMTP_PORT, 10);
  const { SmtpClient } = await import("https://deno.land/x/smtp@v0.7.0/mod.ts");

  const client = new SmtpClient();
  await client.connect({
    hostname: SMTP_HOST,
    port,
    username: SMTP_USER,
    password: SMTP_PASS,
  });

  await client.send({
    from: `${FROM_NAME} <${SMTP_FROM}>`,
    to,
    subject,
    content: html,
    html,
  });

  await client.close();
  return true;
}
