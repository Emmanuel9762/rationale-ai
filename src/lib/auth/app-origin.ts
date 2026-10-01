// Never derive password-reset callbacks from an untrusted request Host header.
export function appOrigin(env: { APP_ORIGIN?: string } = { APP_ORIGIN: process.env.APP_ORIGIN }) {
  const value = env.APP_ORIGIN;
  if (!value) throw new Error("Set APP_ORIGIN to the app's public origin.");
  const url = new URL(value);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("APP_ORIGIN must be an HTTPS origin (HTTP is allowed on localhost).");
  }
  return url.origin;
}
