const NEON_AUTH_URL = process.env.NEON_AUTH_BASE_URL || process.env.NEON_AUTH_URL || "https://ep-weathered-smoke-b4g1qnj9.neonauth.c-6.us-east-2.aws.neon.tech/neondb/auth";

function getSetCookies(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const raw = headers.get("set-cookie");
  return raw ? [raw] : [];
}
function rewriteSetCookie(value) {
  return value.replace(/;\s*Domain=[^;]+/ig, "").replace(/;\s*SameSite=None/ig, "; SameSite=Lax");
}
module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const target = NEON_AUTH_URL.replace(/\/$/, "") + "/request-password-reset";
  const headers = {
    accept: req.headers.accept || "application/json",
    "content-type": req.headers["content-type"] || "application/json"
  };
  if (req.headers.cookie) headers.cookie = req.headers.cookie;
  if (req.headers.origin) headers.origin = req.headers.origin;
  const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
  try {
    const upstream = await fetch(target, { method: "POST", headers, body });
    const cookies = getSetCookies(upstream.headers).map(rewriteSetCookie);
    if (cookies.length) res.setHeader("Set-Cookie", cookies);
    const contentType = upstream.headers.get("content-type");
    if (contentType) res.setHeader("Content-Type", contentType);
    return res.status(upstream.status).send(await upstream.text());
  } catch (error) {
    console.error("Neon Auth password reset proxy error:", error);
    return res.status(502).json({ error: "Auth service unavailable" });
  }
};