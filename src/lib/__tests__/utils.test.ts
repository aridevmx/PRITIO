import { describe, expect, it } from "vitest";
import { isNotesEmpty, stripHtml } from "@/lib/utils";
import { mapSubtask } from "@/lib/mappers";

describe("stripHtml", () => {
  it("remueve etiquetas y conserva el texto", () => {
    expect(stripHtml("<p>Hola <strong>mundo</strong></p>")).toBe("Hola mundo");
  });

  it("separa párrafos y listas con espacios", () => {
    expect(stripHtml("<p>Uno</p><p>Dos</p>")).toBe("Uno Dos");
    expect(stripHtml("<ul><li>A</li><li>B</li></ul>")).toBe("A B");
  });

  it("convierte <br> en espacio", () => {
    expect(stripHtml("linea1<br>linea2")).toBe("linea1 linea2");
  });

  it("decodifica entidades HTML esenciales", () => {
    // Tiptap solo escapa las entidades esenciales; los acentos quedan
    // como UTF-8 literal.
    expect(stripHtml("<p>&lt;nota&gt; &amp; m&aacute;s&nbsp;texto</p>")).toBe(
      "<nota> & m&aacute;s texto",
    );
  });

  it("decodifica entidades numéricas", () => {
    expect(stripHtml("&#225;rbol")).toBe("árbol");
  });

  it("maneja valores vacíos y null", () => {
    expect(stripHtml(null)).toBe("");
    expect(stripHtml(undefined)).toBe("");
    expect(stripHtml("")).toBe("");
  });

  it("colapsa espacios repetidos", () => {
    expect(stripHtml("<p>a</p>\n<p>b</p>")).toBe("a b");
  });
});

describe("isNotesEmpty", () => {
  it("detecta HTML sin contenido visible como vacío", () => {
    expect(isNotesEmpty("<p></p>")).toBe(true);
    expect(isNotesEmpty("<p><br></p>")).toBe(true);
    expect(isNotesEmpty(null)).toBe(true);
    expect(isNotesEmpty("   ")).toBe(true);
  });

  it("detecta contenido real como no vacío", () => {
    expect(isNotesEmpty("<p>hola</p>")).toBe(false);
    expect(isNotesEmpty("<ul><li>x</li></ul>")).toBe(false);
  });
});

describe("mapSubtask", () => {
  it("mapea snake_case a camelCase", () => {
    const sub = mapSubtask({
      id: "sub-1",
      task_id: "task-1",
      workspace_id: "ws-1",
      title: "Comprar pan",
      completed: true,
      position: 2,
      created_by: "user-1",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    });
    expect(sub.id).toBe("sub-1");
    expect(sub.taskId).toBe("task-1");
    expect(sub.workspaceId).toBe("ws-1");
    expect(sub.title).toBe("Comprar pan");
    expect(sub.completed).toBe(true);
    expect(sub.position).toBe(2);
    expect(sub.createdBy).toBe("user-1");
    expect(sub.createdAt).toBe("2026-01-01T00:00:00Z");
    expect(sub.updatedAt).toBe("2026-01-02T00:00:00Z");
  });

  it("aplica defaults defensivos", () => {
    const sub = mapSubtask({ id: "s", task_id: "t", workspace_id: "w" });
    expect(sub.completed).toBe(false);
    expect(sub.position).toBe(0);
    expect(sub.title).toBeUndefined();
  });
});
