import type { VercelRequest, VercelResponse } from "@vercel/node";
import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const dt = (s:string)=> s.replace(/[-:]/g,"").replace(/\.\d+Z$/, "Z");

export default async (req: VercelRequest, res: VercelResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    const id = String(req.query.id);
    const { rows } = await pool.query(
      `select b.slot_start, b.slot_end, t.name
         from bookings b join tenants t on t.id=b.tenant_id
        where b.id=$1`,
      [id]
    );
    if (!rows.length) return res.status(404).end();

    const { slot_start, slot_end, name } = rows[0];
    const body = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Fraym//Booking//EN
BEGIN:VEVENT
UID:${id}@fraym-booking
DTSTAMP:${dt(new Date().toISOString())}
DTSTART:${dt(new Date(slot_start).toISOString())}
DTEND:${dt(new Date(slot_end).toISOString())}
SUMMARY:Reservation — ${name}
END:VEVENT
END:VCALENDAR`;

    res.setHeader("Content-Type","text/calendar; charset=utf-8");
    res.send(body);
  } catch (e:any) {
    res.status(500).send(e.message);
  }
};
