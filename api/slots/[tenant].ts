import type { VercelRequest, VercelResponse } from "@vercel/node";
import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

type TimeWindow = { start: string; end: string };
const pad = (n:number)=> n<10?`0${n}`:`${n}`;
const parseHM = (s:string)=>{ const [h,m]=s.split(":").map(Number); return {h,m}; };
const overlaps=(aS:number,aE:number,bS:number,bE:number)=> aS < bE && bS < aE;

export default async (req: VercelRequest, res: VercelResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    const slug = String(req.query.tenant);
    const date = String(req.query.date);

    const q = await pool.query(
      `select c.data as cfg, t.id as tenant_id
       from configs c join tenants t on t.id=c.tenant_id where t.slug=$1`,
      [slug]
    );
    if (!q.rows.length) return res.status(404).json({ error: "Unknown tenant" });
    const { cfg, tenant_id } = q.rows[0];

    const dow = new Date(`${date}T00:00:00`).getUTCDay();
    const override = (cfg.overrides||[]).find((o:any)=>o.date===date);
    const windows: TimeWindow[] = override?.timeWindows || (cfg.timeWindows?.[String(dow)] || []);
    const cap = override?.capacityPerSlot ?? cfg.capacityPerSlot;
    const slotDuration = Number(cfg.slotDurationMinutes || 30);
    const buffer = Number(cfg.bufferMinutes || 0);
    const turnover = Number(cfg.turnoverMinutes || slotDuration);
    const leadMs = Number(cfg.leadTimeMinutes||0) * 60 * 1000;
    const now = Date.now();

    const slots: string[] = [];
    for (const w of windows) {
      const {h:sh,m:sm}=parseHM(w.start);
      const {h:eh,m:em}=parseHM(w.end);
      let t = new Date(`${date}T${pad(sh)}:${pad(sm)}:00`).getTime();
      const end = new Date(`${date}T${pad(eh)}:${pad(em)}:00`).getTime();
      const step = (slotDuration + buffer) * 60 * 1000;
      while (t + slotDuration*60*1000 <= end) {
        if (t >= now + leadMs) {
          const d=new Date(t);
          slots.push(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
        }
        t += step;
      }
    }

    const remaining: Record<string, number> = {};
    if (!slots.length) return res.json({ remaining });

    const bookingQ = await pool.query(
      `select slot_start, slot_end, party_size
         from bookings where tenant_id=$1 and slot_start::date=$2::date`,
      [tenant_id, date]
    );
    const bookings = bookingQ.rows.map(r=>({
      start: new Date(r.slot_start).getTime(),
      end:   new Date(r.slot_end).getTime(),
      party: Number(r.party_size)
    }));

    for (const s of slots) {
      const [hh,mm] = s.split(":").map(Number);
      const startTs = new Date(`${date}T${pad(hh)}:${pad(mm)}:00`).getTime();
      const endTs   = startTs + turnover*60*1000;
      const booked = bookings.filter(b=>overlaps(startTs,endTs,b.start,b.end))
                             .reduce((a,b)=>a+b.party,0);
      remaining[s] = Math.max(0, (cap||0) - booked);
    }

    res.json({ remaining });
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
};
