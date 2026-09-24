/**
 * Delete actions must redirect() in the same response as the mutation so Next
 * does not re-render the deleted record URL (404) after revalidatePath.
 *
 * Named lifecycle titles for campaign/list live in crud-delete.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

function redirectThrow(url: string): never {
  const err = new Error(`NEXT_REDIRECT:${url}`);
  (err as Error & { digest?: string }).digest = "NEXT_REDIRECT";
  throw err;
}

describe("crud delete actions redirect after mutation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("deleteProductAction redirects to /products", async () => {
    const redirect = vi.fn(redirectThrow);
    const deleteProduct = vi.fn(async () => ({
      message: "Product deleted.",
      mode: "delete" as const,
    }));

    vi.doMock("next/navigation", () => ({ redirect }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    vi.doMock("next/headers", () => ({
      cookies: async () => ({ set: vi.fn() }),
    }));
    vi.doMock("@/lib/tenant/data", async () => ({
      ...(await vi.importActual("@/lib/tenant/data")),
      deleteProduct,
    }));
    vi.doMock("@/lib/auth/authz", async () => ({
      ...(await vi.importActual("@/lib/auth/authz")),
      requireSetupDeletePermission: vi.fn(async () => undefined),
    }));

    const { deleteProductAction } = await import("@/app/actions");
    const formData = new FormData();
    formData.set("id", "prod_1");
    formData.set("confirm", "1");

    await expect(deleteProductAction(null, formData)).rejects.toThrow(
      "NEXT_REDIRECT:/products",
    );
    expect(redirect).toHaveBeenCalledWith("/products");
  }, 20_000);

  it("deleteContactListAction redirects to redirectTo (or /lists)", async () => {
    const redirect = vi.fn(redirectThrow);
    const deleteOrArchiveContactList = vi.fn(async () => ({
      message: "List deleted.",
      mode: "delete" as const,
    }));

    vi.doMock("next/navigation", () => ({ redirect }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    vi.doMock("next/headers", () => ({
      cookies: async () => ({ set: vi.fn() }),
    }));
    vi.doMock("@/lib/tenant/list-delete", () => ({
      deleteOrArchiveContactList,
    }));
    vi.doMock("@/lib/auth/authz", async () => ({
      ...(await vi.importActual("@/lib/auth/authz")),
      requireSetupDeletePermission: vi.fn(async () => undefined),
    }));
    vi.doMock("@/lib/product-config/feature-access", () => ({
      assertGatedAction: vi.fn(),
    }));

    const { deleteContactListAction } = await import("@/app/actions");
    const formData = new FormData();
    formData.set("id", "list_1");
    formData.set("confirm", "1");
    formData.set("redirectTo", "/lists?campaign=camp_1");

    await expect(deleteContactListAction(null, formData)).rejects.toThrow(
      "NEXT_REDIRECT:/lists?campaign=camp_1",
    );
    expect(redirect).toHaveBeenCalledWith("/lists?campaign=camp_1");
  }, 20_000);

  it("deleteContactListAction rejects unsafe redirectTo", async () => {
    const redirect = vi.fn(redirectThrow);
    vi.doMock("next/navigation", () => ({ redirect }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    vi.doMock("next/headers", () => ({
      cookies: async () => ({ set: vi.fn() }),
    }));
    vi.doMock("@/lib/tenant/list-delete", () => ({
      deleteOrArchiveContactList: vi.fn(async () => ({
        message: "List deleted.",
        mode: "delete" as const,
      })),
    }));
    vi.doMock("@/lib/auth/authz", async () => ({
      ...(await vi.importActual("@/lib/auth/authz")),
      requireSetupDeletePermission: vi.fn(async () => undefined),
    }));
    vi.doMock("@/lib/product-config/feature-access", () => ({
      assertGatedAction: vi.fn(),
    }));

    const { deleteContactListAction } = await import("@/app/actions");
    const formData = new FormData();
    formData.set("id", "list_1");
    formData.set("confirm", "1");
    formData.set("redirectTo", "https://evil.example/");

    await expect(deleteContactListAction(null, formData)).rejects.toThrow(
      "NEXT_REDIRECT:/lists",
    );
  }, 20_000);
});
