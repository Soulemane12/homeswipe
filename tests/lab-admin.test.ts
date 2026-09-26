import { describe, expect, it } from "vitest";
import { checkLabAdmin, labAdminToken } from "@/lib/auth/lab-admin-token";

describe("lab admin gate", () => {
  it("disables destructive actions when no secret is configured", () => {
    expect(checkLabAdmin({ configuredSecret: undefined, bearer: "anything" })).toMatchObject({ ok: false, status: 403 });
    expect(checkLabAdmin({ configuredSecret: "   ", cookieToken: labAdminToken("   ") })).toMatchObject({ ok: false, status: 403 });
  });

  it("rejects missing or wrong credentials", () => {
    expect(checkLabAdmin({ configuredSecret: "s3cret" })).toMatchObject({ ok: false, status: 401 });
    expect(checkLabAdmin({ configuredSecret: "s3cret", bearer: "wrong" })).toMatchObject({ ok: false, status: 401 });
    expect(checkLabAdmin({ configuredSecret: "s3cret", cookieToken: labAdminToken("other") })).toMatchObject({ ok: false, status: 401 });
    // The raw secret is not a valid cookie value — only the derived token is.
    expect(checkLabAdmin({ configuredSecret: "s3cret", cookieToken: "s3cret" })).toMatchObject({ ok: false, status: 401 });
  });

  it("accepts the bearer secret or the derived cookie token", () => {
    expect(checkLabAdmin({ configuredSecret: "s3cret", bearer: "s3cret" })).toEqual({ ok: true });
    expect(checkLabAdmin({ configuredSecret: "s3cret", cookieToken: labAdminToken("s3cret") })).toEqual({ ok: true });
  });

  it("derives a token that does not contain the secret", () => {
    const token = labAdminToken("s3cret-value");
    expect(token).not.toContain("s3cret");
    expect(token).toMatch(/^[a-f0-9]{64}$/);
  });
});
