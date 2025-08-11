import type { VercelRequest, VercelResponse } from "@vercel/node";
import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

export default async (_: VercelRequest, res: VercelResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    const r = await pool.query("select now()");
    res.json({ ok: true, now: r.rows[0].now });
  } catch (e:any) {
    res.status(500).json({ ok:false, error: e.message });
  }
};
