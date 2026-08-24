// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { htmlToMarkdown, safeFileName } from "@/features/docs/exportUtils";

describe("htmlToMarkdown", () => {
  it("convierte párrafos simples", () => {
    expect(htmlToMarkdown("<p>Hola mundo</p>")).toBe("Hola mundo");
  });

  it("separa bloques con línea en blanco", () => {
    expect(htmlToMarkdown("<p>Uno</p><p>Dos</p>")).toBe("Uno\n\nDos");
  });

  it("convierte encabezados h2 y h3", () => {
    expect(htmlToMarkdown("<h2>Título</h2>")).toBe("## Título");
    expect(htmlToMarkdown("<h3>Sub</h3>")).toBe("### Sub");
  });

  it("convierte negritas, cursivas y código en línea", () => {
    expect(htmlToMarkdown("<p><strong>a</strong> y <em>b</em> y <code>c</code></p>")).toBe(
      "**a** y *b* y `c`",
    );
  });

  it("omite negritas vacías", () => {
    expect(htmlToMarkdown("<p>x<strong></strong>y</p>")).toBe("xy");
  });

  it("convierte listas con viñetas", () => {
    expect(htmlToMarkdown("<ul><li>A</li><li>B</li></ul>")).toBe("- A\n- B");
  });

  it("convierte listas numeradas", () => {
    expect(htmlToMarkdown("<ol><li>A</li><li>B</li></ol>")).toBe("1. A\n2. B");
  });

  it("anida listas con sangría", () => {
    const md = htmlToMarkdown("<ul><li>A<ul><li>A1</li></ul></li><li>B</li></ul>");
    expect(md).toBe("- A\n  - A1\n- B");
  });

  it("convielte <br> en salto de línea", () => {
    expect(htmlToMarkdown("<p>linea1<br>linea2</p>")).toBe("linea1\nlinea2");
  });

  it("maneja null/vacío", () => {
    expect(htmlToMarkdown(null)).toBe("");
    expect(htmlToMarkdown("")).toBe("");
    expect(htmlToMarkdown("<p></p>")).toBe("");
  });

  it("procesa divs contenedores", () => {
    expect(htmlToMarkdown("<div><p>Hola</p></div>")).toBe("Hola");
  });
});

describe("safeFileName", () => {
  it("normaliza acentos y espacios", () => {
    expect(safeFileName("Minuta de Reunión Ágil", "md")).toBe("minuta-de-reunion-agil.md");
  });

  it("remueve caracteres especiales", () => {
    // ñ se descompone a n + tilde combinante; la tilde se elimina, la n queda.
    expect(safeFileName("Nota: diseño/final v2!", "html")).toBe("nota-disenofinal-v2.html");
  });

  it("usa fallback para título vacío", () => {
    expect(safeFileName("", "docx")).toBe("documento.docx");
  });
});
