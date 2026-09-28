const { neon } = require("@neondatabase/serverless");

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
const SUPABASE_URL = process.env.SUPABASE_URL || "https://yayfspvqwuefbtiyttnr.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_iOxhPw26ASUO9WaNcc7HfA_dR1XjyKp";

async function authenticateRequest(req) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const token = match[1];
  const response = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: "Bearer " + token
    }
  });

  if (!response.ok) return null;
  return response.json();
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
