/**
 * /api/chat — must not embed hardcoded Cisco/CCO credential strings.
 * Guards against re-introducing the mock credentials block.
 */

import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import { join } from "path";

const ROUTE_PATH = join(
  process.cwd(),
  "src",
  "app",
  "api",
  "chat",
  "route.ts",
);

describe("chat route — no hardcoded credentials", () => {
  it("does not contain a hardcoded mock credential block", async () => {
    const source = await readFile(ROUTE_PATH, "utf8");
    // None of the fields should be set to a hardcoded "mock" string.
    expect(source).not.toMatch(/clientId:\s*"mock"/);
    expect(source).not.toMatch(/clientSecret:\s*"mock"/);
    expect(source).not.toMatch(/username:\s*"mock"/);
    expect(source).not.toMatch(/password:\s*"mock"/);
  });

  it("references the tenantCredentials table for credential lookup", async () => {
    const source = await readFile(ROUTE_PATH, "utf8");
    expect(source).toMatch(/tenantCredentials/);
  });

  it("returns a clear configuration-required message when credentials are missing", async () => {
    const source = await readFile(ROUTE_PATH, "utf8");
    expect(source).toMatch(/configure them in Settings > Integrations/);
  });
});
