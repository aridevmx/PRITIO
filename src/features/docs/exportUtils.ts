// ─── HTML → Markdown ───────────────────────────────────────

type BlockHandler = (el: Element) => string;

function inlineToMd(el: Node): string {
  if (el.nodeType === Node.TEXT_NODE) return el.textContent ?? "";
  if (el.nodeType !== Node.ELEMENT_NODE) return "";

  const element = el as Element;
  const children = Array.from(element.childNodes).map(inlineToMd).join("");

  switch (element.tagName.toLowerCase()) {
    case "strong":
    case "b":
      return children.trim() ? `**${children}**` : "";
    case "em":
    case "i":
      return children.trim() ? `*${children}*` : "";
    case "code":
      return children.trim() ? `\`${children}\`` : "";
    case "br":
      return "\n";
    case "a":
      return `[${children}](${element.getAttribute("href") ?? ""})`;
    default:
      return children;
  }
}

function listToMd(list: Element, ordered: boolean): string {
  const items = Array.from(list.children).filter((c) => c.tagName.toLowerCase() === "li");
  return items
    .map((li, i) => {
      // Listas anidadas dentro del li
      const nested = Array.from(li.children).filter((c) =>
        ["ul", "ol"].includes(c.tagName.toLowerCase()),
      );
      const cloneText = Array.from(li.childNodes)
        .filter((n) => n.nodeType !== Node.ELEMENT_NODE || !["ul", "ol"].includes((n as Element).tagName.toLowerCase()))
        .map(inlineToMd)
        .join("")
        .trim();
      const marker = ordered ? `${i + 1}.` : "-";
      const nestedMd = nested
        .map((n) =>
          listToMd(n, n.tagName.toLowerCase() === "ol")
            .split("\n")
            .map((line) => `  ${line}`)
            .join("\n"),
        )
        .join("\n");
      return [`${marker} ${cloneText}`, nestedMd].filter(Boolean).join("\n");
    })
    .join("\n");
}

const BLOCK_HANDLERS: Record<string, BlockHandler> = {
  p: (el) => inlineToMd(el).trim(),
  h1: (el) => `# ${inlineToMd(el).trim()}`,
  h2: (el) => `## ${inlineToMd(el).trim()}`,
  h3: (el) => `### ${inlineToMd(el).trim()}`,
  h4: (el) => `#### ${inlineToMd(el).trim()}`,
  ul: (el) => listToMd(el, false),
  ol: (el) => listToMd(el, true),
  pre: (el) => `\`\`\`\n${el.textContent ?? ""}\n\`\`\``,
  blockquote: (el) =>
    (el.textContent ?? "")
      .trim()
      .split("\n")
      .map((l) => `> ${l}`)
      .join("\n"),
};

export function htmlToMarkdown(html: string | null | undefined): string {
  if (!html || !html.trim()) return "";
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const body = doc.body;
  const parts: string[] = [];

  body.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent ?? "").trim();
      if (t) parts.push(t);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    // Contenedores sin semántica: procesar hijos
    if (tag === "div" || tag === "span") {
      const inner = el.innerHTML.trim();
      if (inner) parts.push(htmlToMarkdown(inner));
      return;
    }

    const handler = BLOCK_HANDLERS[tag];
    if (handler) {
      const md = handler(el);
      if (md.trim()) parts.push(md);
      return;
    }
    // Nodo en línea suelto (texto con formato fuera de <p>)
    const inline = inlineToMd(el).trim();
    if (inline) parts.push(inline);
  });

  return parts.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ─── HTML independiente para descarga/imprimir ──────────────

function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

export function buildStandaloneHtml(
  title: string,
  contentHtml: string | null | undefined,
  appName = "Pritio",
): string {
  const safeTitle = escapeHtmlAttr(title || "Sin título");
  return `<!DOCTYPE html>
<html lang="es-MX">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle}</title>
<style>
  body { margin: 0; background: #f5f5f4; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1c1917; }
  .page { max-width: 46rem; margin: 2rem auto; background: #ffffff; border-radius: 16px; padding: 48px 56px; box-shadow: 0 4px 24px rgba(0,0,0,0.06); }
  h1.doc-title { font-size: 28px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 20px; }
  .doc-content { line-height: 1.7; font-size: 15px; }
  .doc-content h2 { font-size: 20px; margin: 28px 0 8px; }
  .doc-content h3 { font-size: 16px; margin: 24px 0 6px; }
  .doc-content p { margin: 8px 0; }
  .doc-content ul, .doc-content ol { padding-left: 22px; margin: 8px 0; }
  .doc-content li { margin: 3px 0; }
  .doc-content code { background: #f4f4f5; border-radius: 4px; padding: 2px 5px; font-size: 13px; }
  .doc-content pre { background: #f4f4f5; border-radius: 8px; padding: 12px 14px; overflow-x: auto; }
  footer { max-width: 46rem; margin: 12px auto 32px; text-align: center; font-size: 11px; color: #a8a29e; }
  @media print {
    body { background: #ffffff; }
    .page { box-shadow: none; margin: 0; max-width: none; padding: 24px 8px; border-radius: 0; }
    footer { display: none; }
  }
</style>
</head>
<body>
<div class="page">
  <h1 class="doc-title">${title ? escapeHtmlAttr(title) : "Sin título"}</h1>
  <div class="doc-content">${contentHtml || "<p></p>"}</div>
</div>
<footer>Generado con ${escapeHtmlAttr(appName)}</footer>
</body>
</html>`;
}

// ─── Descargas ──────────────────────────────────────────────

export function downloadFile(fileName: string, mimeType: string, content: string | Blob): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Abre el diálogo de imprimir sobre un iframe oculto con el documento. */
export function printStandaloneHtml(html: string): void {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const win = iframe.contentWindow;
  if (!win) {
    iframe.remove();
    return;
  }
  win.focus();
  // Esperar a que carguen estilos/recursos antes de imprimir.
  win.addEventListener("load", () => {
    win.print();
    window.setTimeout(() => iframe.remove(), 1000);
  });
  // Fallback por si load ya ocurrió.
  window.setTimeout(() => {
    if (iframe.isConnected) {
      win.print();
      window.setTimeout(() => iframe.remove(), 1000);
    }
  }, 300);
}

/** Nombre de archivo seguro a partir del título del documento. */
export function safeFileName(title: string, extension: string): string {
  const base = (title || "documento")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 60);
  return `${base || "documento"}.${extension}`;
}
