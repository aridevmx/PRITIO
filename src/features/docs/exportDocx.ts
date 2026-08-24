import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

interface InlineRun {
  text: string;
  bold: boolean;
  italic: boolean;
  code: boolean;
}

function inlineToRuns(node: Node, inherited: Partial<InlineRun> = {}): InlineRun[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    return text ? [{ text, bold: false, italic: false, code: false, ...inherited }] : [];
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return [];

  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  const style: Partial<InlineRun> = { ...inherited };
  if (tag === "strong" || tag === "b") style.bold = true;
  if (tag === "em" || tag === "i") style.italic = true;
  if (tag === "code") style.code = true;

  const runs: InlineRun[] = [];
  el.childNodes.forEach((child) => runs.push(...inlineToRuns(child, style)));
  return runs;
}

function runsToTextRuns(runs: InlineRun[]): TextRun[] {
  return runs.map(
    (r) =>
      new TextRun({
        text: r.text,
        bold: r.bold || undefined,
        italics: r.italic || undefined,
        font: r.code ? "Consolas" : undefined,
      }),
  );
}

type ListItem =
  | { kind: "paragraph"; runs: InlineRun[] }
  | { kind: "heading"; level: (typeof HeadingLevel)["HEADING_1"] | (typeof HeadingLevel)["HEADING_2"]; runs: InlineRun[] }
  | { kind: "bullet"; runs: InlineRun[] }
  | { kind: "ordered"; index: number; runs: InlineRun[] };

function collectListItems(el: Element, ordered: boolean, out: ListItem[], depth = 0): void {
  let index = 1;
  Array.from(el.children).forEach((li) => {
    if (li.tagName.toLowerCase() !== "li") return;
    const nested = Array.from(li.children).filter((c) => ["ul", "ol"].includes(c.tagName.toLowerCase()));
    const directNodes = Array.from(li.childNodes).filter(
      (n) => n.nodeType !== Node.ELEMENT_NODE || !["ul", "ol"].includes((n as Element).tagName.toLowerCase()),
    );
    const runs = directNodes.flatMap((n) => inlineToRuns(n));
    if (depth === 0) {
      out.push(ordered ? { kind: "ordered", index, runs } : { kind: "bullet", runs });
    } else {
      // Anidadas: sangría con viñetas simples
      out.push({ kind: "bullet", runs });
    }
    index++;
    for (const n of nested) {
      collectListItems(n, n.tagName.toLowerCase() === "ol", out, depth + 1);
    }
  });
}

function htmlToDocxChildren(html: string | null | undefined): Paragraph[] {
  if (!html || !html.trim()) return [new Paragraph({ children: [] })];
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const items: ListItem[] = [];

  doc.body.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent ?? "").trim();
      if (t) items.push({ kind: "paragraph", runs: [{ text: t, bold: false, italic: false, code: false }] });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    switch (el.tagName.toLowerCase()) {
      case "p":
        items.push({ kind: "paragraph", runs: el.childNodes.length ? Array.from(el.childNodes).flatMap((n) => inlineToRuns(n)) : [] });
        break;
      case "h2":
        items.push({ kind: "heading", level: HeadingLevel.HEADING_1, runs: Array.from(el.childNodes).flatMap((n) => inlineToRuns(n)) });
        break;
      case "h3":
        items.push({ kind: "heading", level: HeadingLevel.HEADING_2, runs: Array.from(el.childNodes).flatMap((n) => inlineToRuns(n)) });
        break;
      case "ul":
        collectListItems(el, false, items);
        break;
      case "ol":
        collectListItems(el, true, items);
        break;
      case "pre":
        items.push({
          kind: "paragraph",
          runs: [{ text: el.textContent ?? "", bold: false, italic: false, code: true }],
        });
        break;
      default: {
        const runs = Array.from(el.childNodes).flatMap((n) => inlineToRuns(n));
        if (runs.length) items.push({ kind: "paragraph", runs });
      }
    }
  });

  return items.map((item) => {
    switch (item.kind) {
      case "heading":
        return new Paragraph({ heading: item.level, children: runsToTextRuns(item.runs) });
      case "bullet":
        return new Paragraph({ bullet: { level: 0 }, children: runsToTextRuns(item.runs) });
      case "ordered":
        return new Paragraph({ children: [...runsToTextRuns([{ text: `${item.index}. `, bold: false, italic: false, code: false }]), ...runsToTextRuns(item.runs)] });
      default:
        return new Paragraph({ children: item.runs.length ? runsToTextRuns(item.runs) : [] });
    }
  });
}

/** Genera un .docx real a partir de HTML de Tiptap y dispara la descarga. */
export async function exportDocx(
  title: string,
  contentHtml: string | null | undefined,
  fileName: string,
): Promise<void> {
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 24 },
        },
      },
    },
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            spacing: { after: 240 },
            children: [new TextRun({ text: title || "Sin título", bold: true, size: 40 })],
          }),
          ...htmlToDocxChildren(contentHtml),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.endsWith(".docx") ? fileName : `${fileName}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
