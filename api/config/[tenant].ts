import type { VercelRequest, VercelResponse } from "@vercel/node";
import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async (req: VercelRequest, res: VercelResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    const slug = String(req.query.tenant);
    const { rows } = await pool.query(
      `select c.data
         from configs c
         join tenants t on t.id = c.tenant_id
        where t.slug = $1
        limit 1`,
      [slug]
    );
    if (!rows.length) return res.status(404).json({ error: "Unknown tenant" });
    res.json(rows[0].data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};
