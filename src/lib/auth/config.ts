export function authConfig(env: NodeJS.ProcessEnv = process.env) {
  const baseUrl = env.NEON_AUTH_BASE_URL?.replace(/\/$/, "");
  const secret = env.NEON_AUTH_COOKIE_SECRET;
  if (!baseUrl || !secret || secret.length < 32) {
    throw new Error("Set NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET (32+ characters).");
  }
  const url = new URL(baseUrl);
  if (url.protocol !== "https:" && !(env.NODE_ENV === "test" && url.hostname === "127.0.0.1")) {
    throw new Error("NEON_AUTH_BASE_URL must use HTTPS.");
  }
  return { baseUrl, cookies: { secret, sessionDataTtl: 60 } };
}
