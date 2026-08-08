import { describe, expect, it } from "vitest";
import { mapWorkspace, toSnakeCase, toCamelCase } from "@/lib/mappers";
import type { WorkspaceRow } from "@/types";

const row: WorkspaceRow = {
  id: "ws-1",
  name: "Casa",
  type: "family",
  plan: "free",
  is_frozen: false,
  blocked_days_require_approval: true,
  auto_promote_due_to_do: true,
  grace_until: null,
  created_at: "2026-01-01T00:00:00Z",
};

describe("mapWorkspace", () => {
  it("mapea snake_case a camelCase incluyendo el plan", () => {
    const ws = mapWorkspace(row);
    expect(ws.id).toBe("ws-1");
    expect(ws.type).toBe("family");
    expect(ws.plan).toBe("free");
    expect(ws.isFrozen).toBe(false);
    expect(ws.blockedDaysRequireApproval).toBe(true);
    expect(ws.autoPromoteDueToDo).toBe(true);
    expect(ws.graceUntil).toBeNull();
    expect(ws.createdAt).toBe("2026-01-01T00:00:00Z");
  });

  it("propaga el plan pro y grace_until cuando existen", () => {
    const ws = mapWorkspace({ ...row, plan: "pro", grace_until: "2026-12-31T00:00:00Z" });
    expect(ws.plan).toBe("pro");
    expect(ws.graceUntil).toBe("2026-12-31T00:00:00Z");
  });

  it("normaliza planes legacy a free", () => {
    const legacy = mapWorkspace({ ...row, plan: "personal_free" as never });
    expect(legacy.plan).toBe("free");
    const enterprise = mapWorkspace({ ...row, plan: "enterprise" as never });
    expect(enterprise.plan).toBe("free");
  });
});

describe("toSnakeCase", () => {
  it("convierte claves camelCase a snake_case", () => {
    expect(toSnakeCase({ autoPromoteDueToDo: true, avatarUrl: "x" })).toEqual({
      auto_promote_due_to_do: true,
      avatar_url: "x",
    });
  });
});

describe("toCamelCase", () => {
  it("convierte claves snake_case a camelCase", () => {
    expect(toCamelCase({ auto_promote_due_to_do: true, avatar_url: "x" })).toEqual({
      autoPromoteDueToDo: true,
      avatarUrl: "x",
    });
  });
});
