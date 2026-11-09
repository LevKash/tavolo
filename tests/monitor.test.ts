import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tg", () => ({ notifyOperator: vi.fn() }));

import { notifyOperator } from "@/lib/tg";

describe("error reporting", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(notifyOperator).mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("reports an error once, then stays quiet for the same error", async () => {
    const { reportError } = await import("@/lib/monitor");
    expect(await reportError("/api/order", new Error("boom"))).toBe(true);
    expect(await reportError("/api/order", new Error("boom"))).toBe(false);
    expect(notifyOperator).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notifyOperator).mock.calls[0][0]).toContain("/api/order");
  });

  it("reports a different error or place separately", async () => {
    const { reportError } = await import("@/lib/monitor");
    await reportError("/api/order", new Error("a"));
    await reportError("/api/order", new Error("b"));
    await reportError("/api/pay/session", new Error("a"));
    expect(notifyOperator).toHaveBeenCalledTimes(3);
  });

  it("caps the number of messages per hour during an outage", async () => {
    const { reportError } = await import("@/lib/monitor");
    for (let i = 0; i < 30; i++) await reportError("/x", new Error(`e${i}`));
    expect(notifyOperator).toHaveBeenCalledTimes(8);
  });

  it("drops database query parameters from the message", async () => {
    const { reportError } = await import("@/lib/monitor");
    await reportError("/login", new Error('Failed query: select * from users where email = $1\nparams: someone@example.com'));
    const text = vi.mocked(notifyOperator).mock.calls[0][0];
    expect(text).toContain("Failed query");
    expect(text).not.toContain("someone@example.com");
  });

  it("never includes anything beyond route, method and message", async () => {
    const { reportError } = await import("@/lib/monitor");
    await reportError("/api/bar/orders", new Error("fail"), { method: "GET", digest: "123" });
    const text = vi.mocked(notifyOperator).mock.calls[0][0];
    expect(text).toContain("GET /api/bar/orders");
    expect(text).toContain("digest 123");
    expect(text).not.toMatch(/pin|cookie|authorization/i);
  });
});
