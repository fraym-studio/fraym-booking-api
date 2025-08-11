import type { VercelRequest, VercelResponse } from "@vercel/node";
export default async (_: VercelRequest, res: VercelResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json({ ok: true, env: ["DATABASE_URL","PUBLIC_BASE_URL"].every(k => !!process.env[k]) });
};
