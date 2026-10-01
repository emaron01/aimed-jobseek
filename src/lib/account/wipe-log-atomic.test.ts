import { describe, expect, it } from "vitest";
import {
  readAnonymousAccountWipeLog,
  recordAnonymousAccountWipe,
  type AccountWipeReason,
} from "@/lib/account/wipe-organization";
import { hasTestDatabase } from "@/test/database";

describe.skipIf(!hasTestDatabase())(
  "anonymous wipe log atomic append",
  { timeout: 60_000 },
  () => {
    it("keeps every concurrent append and stores only the date and reason", async () => {
      const reasons: AccountWipeReason[] = ["self_serve", "admin", "automatic"];
      const base = Date.UTC(2098, 0, 1);
      const stamp = Date.now() % 1_000_000;
      const entries = await Promise.all(
        reasons.flatMap((reason, reasonIndex) =>
          [0, 1].map((copy) => {
            const at = new Date(base + stamp * 10 + reasonIndex * 2 + copy);
            return recordAnonymousAccountWipe({ reason, at });
          }),
        ),
      );
      expect(entries).toHaveLength(6);
      const log = await readAnonymousAccountWipeLog();
      for (const entry of entries) {
        const matches = log.filter(
          (row) => row.at === entry.at && row.reason === entry.reason,
        );
        expect(matches).toHaveLength(1);
        expect(Object.keys(matches[0]!).sort()).toEqual(["at", "reason"]);
      }
    });
  },
);
