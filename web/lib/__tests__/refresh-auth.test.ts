import { describe, expect, it } from "vitest";

import { checkRefreshAuth } from "../refresh-auth";

const SECRET = "s3cret-token_ABC";

describe("checkRefreshAuth", () => {
  it("accepts the right bearer token", () => {
    expect(checkRefreshAuth(`Bearer ${SECRET}`, SECRET)).toBe("ok");
  });

  it("refuses a wrong token, including one of a different length", () => {
    expect(checkRefreshAuth("Bearer s3cret-token_ABD", SECRET)).toBe("unauthorized");
    expect(checkRefreshAuth("Bearer short", SECRET)).toBe("unauthorized");
    expect(checkRefreshAuth(`Bearer ${SECRET}${SECRET}`, SECRET)).toBe("unauthorized");
  });

  it("refuses a missing or empty header", () => {
    expect(checkRefreshAuth(null, SECRET)).toBe("unauthorized");
    expect(checkRefreshAuth("", SECRET)).toBe("unauthorized");
    expect(checkRefreshAuth("Bearer ", SECRET)).toBe("unauthorized");
  });

  it("refuses other schemes and malformed headers", () => {
    expect(checkRefreshAuth(`Basic ${SECRET}`, SECRET)).toBe("unauthorized");
    expect(checkRefreshAuth(`bearer ${SECRET}`, SECRET)).toBe("unauthorized");
    expect(checkRefreshAuth(SECRET, SECRET)).toBe("unauthorized");
    expect(checkRefreshAuth(`Bearer  ${SECRET}`, SECRET)).toBe("unauthorized");
    expect(checkRefreshAuth(`Bearer ${SECRET} extra`, SECRET)).toBe("unauthorized");
  });

  it("is unconfigured, refusing everyone, when the server has no secret", () => {
    for (const secret of [undefined, "", "   "]) {
      expect(checkRefreshAuth(`Bearer ${SECRET}`, secret)).toBe("unconfigured");
      expect(checkRefreshAuth("Bearer ", secret)).toBe("unconfigured");
      expect(checkRefreshAuth(null, secret)).toBe("unconfigured");
    }
  });
});
