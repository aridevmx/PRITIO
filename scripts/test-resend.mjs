#!/usr/bin/env node

// Requiere la API key en la variable de entorno RESEND_API_KEY.
// Ejecuta: RESEND_API_KEY=re_xxx node scripts/test-resend.mjs

import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
if (!RESEND_API_KEY) {
  console.error("❌ Define RESEND_API_KEY (no lo pongas en el código).");
  process.exit(1);
}

const TO = "pritioappmx@gmail.com";
const FROM = "onboarding@resend.dev";
const SUBJECT = "[Pritio] Prueba de Resend";

const resend = new Resend(RESEND_API_KEY);

const { data, error } = await resend.emails.send({
  from: FROM,
  to: TO,
  subject: SUBJECT,
  html: `
    <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
      <h1 style="color: #7c3aed;">✅ Pritio — Resend funciona</h1>
      <p>Este es un correo de prueba desde Resend.</p>
      <p>Si recibes esto, la integración está lista para la Edge Function <strong>send-invite</strong>.</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb;" />
      <p style="color: #6b7280; font-size: 12px;">Pritio App — Pritio.app</p>
    </div>
  `,
});

if (error) {
  console.error("❌ Error:", error);
  process.exit(1);
}

console.log("✅ Email enviado:", data?.id);
