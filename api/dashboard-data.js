const { neon } = require("@neondatabase/serverless");

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
const NEON_AUTH_URL = process.env.NEON_AUTH_URL || "https://ep-holy-frost-b4fodald.neonauth.c-6.us-east-2.aws.neon.tech/neondb/auth";
const NEON_AUTH_JWKS_URL = NEON_AUTH_URL.replace(/\/$/, "") + "/.well-known/jwks";

let jwksPromise;
async function getJwks() {
  if (!jwksPromise) {
    jwksPromise = import("jose").then(({ createRemoteJWKSet }) => createRemoteJWKSet(new URL(NEON_AUTH_JWKS_URL)));
  }
  return jwksPromise;
}

async function authenticateRequest(req) {
  const match = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  try {
    const { jwtVerify } = await import("jose");
    const jwks = await getJwks();
    const { payload } = await jwtVerify(match[1], jwks);
    return payload?.sub ? { id: String(payload.sub), email: payload.email || null } : null;
  } catch (error) {
    console.error("Neon Auth verification error:", error);
    return null;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (!sql) {
    return res.status(503).json({ error: "Neon is not configured" });
  }

  if (req.method === "GET") {
    try {
      const rows = await sql`
        SELECT data, updated_at
        FROM public.dashboard_data
        WHERE id = 'current'
        LIMIT 1
      `;
      if (!rows.length) return res.status(200).json({ data: null, updated_at: null });
      return res.status(200).json(rows[0]);
    } catch (error) {
      console.error("Neon read error:", error);
      return res.status(500).json({ error: "Failed to read dashboard data" });
    }
  }

  if (req.method === "PUT") {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = null; }
    }
    if (!body || typeof body.data !== "object" || body.data === null) {
      return res.status(400).json({ error: "Invalid data payload" });
    }

    try {
      const rows = await sql`
        INSERT INTO public.dashboard_data (id, data, updated_at)
        VALUES ('current', ${JSON.stringify(body.data)}::jsonb, now())
        ON CONFLICT (id)
        DO UPDATE SET data = EXCLUDED.data, updated_at = now()
        RETURNING updated_at
      `;
      return res.status(200).json({ ok: true, updated_at: rows[0].updated_at });
    } catch (error) {
      console.error("Neon write error:", error);
      return res.status(500).json({ error: "Failed to save dashboard data" });
    }
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ error: "Method not allowed" });
};
