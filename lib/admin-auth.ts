import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "company-group-buy-admin";

function getSecret() {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) throw new Error("Missing ADMIN_PASSWORD environment variable.");
  return secret;
}

export function createAdminToken() {
  const payload = `admin:${Date.now()}`;
  const signature = createHmac("sha256", getSecret()).update(payload).digest("hex");
  return `${Buffer.from(payload).toString("base64url")}.${signature}`;
}

export function isValidAdminToken(token: string | undefined) {
  if (!token) return false;
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return false;

  try {
    const payload = Buffer.from(encodedPayload, "base64url").toString("utf8");
    if (!payload.startsWith("admin:")) return false;
    const expected = createHmac("sha256", getSecret()).update(payload).digest("hex");
    const a = Buffer.from(signature, "utf8");
    const b = Buffer.from(expected, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export const adminCookieName = COOKIE_NAME;
