export interface DigestTask {
  title: string;
  dueDate: string | null;
  priority: string;
  quadrant: string;
  workspaceName: string;
}

export function buildDigestHtml(params: {
  userName: string;
  overdueCount: number;
  todayCount: number;
  upcomingCount: number;
  overdueTasks: DigestTask[];
  todayTasks: DigestTask[];
  upcomingTasks: DigestTask[];
  appUrl: string;
}): string {
  const { userName, overdueCount, todayCount, upcomingCount, overdueTasks, todayTasks, upcomingTasks, appUrl } = params;

  return `<!DOCTYPE html>
<html lang="es-MX">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Resumen diario Priorify</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f4;padding:40px 0">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
          <!-- Header -->
          <tr>
            <td style="padding:32px 32px 0;text-align:center">
              <table role="presentation" cellpadding="0" cellspacing="0" align="center">
                <tr>
                  <td style="width:40px;height:40px;background:linear-gradient(135deg,#9B7EDC,#7C3AED);border-radius:50%;text-align:center;vertical-align:middle;font-size:18px;font-weight:800;color:#ffffff;line-height:40px">P</td>
                </tr>
              </table>
              <h1 style="margin:16px 0 4px;font-size:20px;font-weight:800;color:#1c1917">Buenos días, ${userName}</h1>
              <p style="margin:0 0 4px;font-size:14px;color:#71717a">Este es tu resumen diario</p>
            </td>
          </tr>

          ${buildSummarySection(overdueCount, todayCount, upcomingCount)}

          ${overdueTasks.length > 0 ? buildTaskSection("🔴 Vencidas", "#dc2626", overdueTasks) : ""}
          ${todayTasks.length > 0 ? buildTaskSection("🟡 Vencen hoy", "#d97706", todayTasks) : ""}
          ${upcomingTasks.length > 0 ? buildTaskSection("🟢 Próximas", "#16a34a", upcomingTasks) : ""}

          <!-- CTA -->
          <tr>
            <td style="padding:24px 32px 0;text-align:center">
              <a href="${appUrl}" style="display:inline-block;padding:12px 32px;background-color:#1c1917;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:12px">Abrir Priorify</a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px;text-align:center;border-top:1px solid #e7e5e4">
              <p style="margin:0;font-size:11px;color:#a1a1aa">Priorify — Open source task management</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildSummarySection(overdue: number, today: number, upcoming: number): string {
  return `
  <tr>
    <td style="padding:24px 32px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          ${summaryCard("🔴", overdue, "Vencidas")}
          ${summaryCard("🟡", today, "Hoy")}
          ${summaryCard("🟢", upcoming, "Próximas")}
        </tr>
      </table>
    </td>
  </tr>`;
}

function summaryCard(emoji: string, count: number, label: string): string {
  return `
  <td style="width:33%;padding:0 4px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fafaf9;border-radius:12px">
      <tr>
        <td style="padding:12px;text-align:center">
          <p style="margin:0;font-size:24px">${emoji}</p>
          <p style="margin:4px 0 0;font-size:18px;font-weight:800;color:#1c1917">${count}</p>
          <p style="margin:0;font-size:11px;color:#71717a">${label}</p>
        </td>
      </tr>
    </table>
  </td>`;
}

function buildTaskSection(title: string, color: string, tasks: DigestTask[]): string {
  const rows = tasks.slice(0, 10).map((t) => taskRow(t, color)).join("");

  return `
  <tr>
    <td style="padding:0 32px 16px">
      <h2 style="margin:0 0 12px;font-size:14px;font-weight:700;color:${color}">${title}</h2>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${rows}
        ${tasks.length > 10 ? `<tr><td style="padding:8px 0;font-size:12px;color:#71717a;text-align:center">... y ${tasks.length - 10} más</td></tr>` : ""}
      </table>
    </td>
  </tr>`;
}

function taskRow(task: DigestTask, color: string): string {
  const priorityLabel: Record<string, string> = {
    urgent: "Urgente",
    high: "Alta",
    medium: "Media",
    low: "Baja",
  };

  return `
  <tr>
    <td style="padding:4px 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="width:4px;height:36px;background-color:${color};border-radius:2px"></td>
          <td style="padding-left:10px">
            <p style="margin:0;font-size:13px;font-weight:600;color:#1c1917;line-height:1.3">${task.title}</p>
            <p style="margin:0;font-size:11px;color:#71717a">${task.workspaceName} · ${priorityLabel[task.priority] ?? task.priority}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}
