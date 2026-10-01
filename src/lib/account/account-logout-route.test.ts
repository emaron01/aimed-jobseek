/**
 * Account-menu Log Out posts outside the app layout (B4 finish).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const logoutAction = vi.fn(async () => undefined);

vi.mock("@/app/actions/account", () => ({
  logoutAction: () => logoutAction(),
}));

describe("POST /api/account/logout", () => {
  beforeEach(() => {
    logoutAction.mockClear();
  });

  it("signs out on a same-origin post and does not run the layout gate", async () => {
    const { POST } = await import("@/app/api/account/logout/route");
    const response = await POST(
      new Request("http://localhost:3000/api/account/logout", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          host: "localhost:3000",
        },
      }),
    );
    expect(logoutAction).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("refuses a cross-site post without signing out", async () => {
    const { POST } = await import("@/app/api/account/logout/route");
    const response = await POST(
      new Request("http://localhost:3000/api/account/logout", {
        method: "POST",
        headers: {
          origin: "https://evil.example",
          host: "localhost:3000",
        },
      }),
    );
    expect(response.status).toBe(403);
    expect(logoutAction).not.toHaveBeenCalled();
  });
});
