import { APP_NAME } from "../_shared/app-info.ts";
import { escapeHtml } from "../_shared/email.ts";

export function buildInviteEmailHtml(params: {
  workspaceName: string;
  invitedByName: string;
  inviteLink: string;
  roleLabel: string;
}): string {
  const { workspaceName, invitedByName, inviteLink, roleLabel } = params;
  const safeWorkspaceName = escapeHtml(workspaceName);
  const safeInvitedByName = escapeHtml(invitedByName);
  const safeRoleLabel = escapeHtml(roleLabel);
  const safeInviteLink = escapeHtml(inviteLink);

  return `<!DOCTYPE html>
<html lang="es-MX">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invitación a ${safeWorkspaceName}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f4;padding:40px 0">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
          <!-- Header -->
          <tr>
            <td style="padding:32px 32px 0;text-align:center">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width:40px;height:40px;background:linear-gradient(135deg,#9B7EDC,#7C3AED);border-radius:50%;text-align:center;vertical-align:middle;font-size:18px;font-weight:800;color:#ffffff;line-height:40px">P</td>
                </tr>
              </table>
              <h1 style="margin:16px 0 4px;font-size:22px;font-weight:800;color:#1c1917">Te invitaron a <span style="color:#7C3AED">${safeWorkspaceName}</span></h1>
              <p style="margin:0;font-size:14px;color:#71717a">${safeInvitedByName} te invitó como <strong>${safeRoleLabel}</strong></p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:24px 32px;text-align:center">
              <p style="margin:0 0 24px;font-size:14px;color:#57534e;line-height:1.5">
                ${APP_NAME} es un gestor de tareas basado en la Matriz Eisenhower. Organiza tu tiempo, decide qué hacer y colabora con tu equipo.
              </p>
              <a href="${safeInviteLink}" style="display:inline-block;padding:12px 32px;background-color:#1c1917;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:12px">Aceptar invitación</a>
              <p style="margin:16px 0 0;font-size:12px;color:#a1a1aa">O copia este enlace en tu navegador:</p>
              <p style="margin:4px 0 0;font-size:12px;color:#7C3AED;word-break:break-all">${safeInviteLink}</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:0 32px 24px;text-align:center;border-top:1px solid #e7e5e4">
              <p style="margin:16px 0 0;font-size:11px;color:#a1a1aa">${APP_NAME} — Open source task management</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    admin: "Administrador",
    leader: "Líder",
    member: "Miembro",
  };
  return labels[role] ?? role;
}
