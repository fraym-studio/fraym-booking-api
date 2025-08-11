import type { VercelRequest, VercelResponse } from "@vercel/node";
import pg from "pg";
const { Pool } = pg;
import crypto from "crypto";
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const pad=(n:number)=> n<10?`0${n}`:`${n}`;

export default async (req: VercelRequest, res: VercelResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "POST") return res.status(405).end();

  const { tenant, date, time, party, name, email, phone, notes } = req.body || {};
  if (!tenant || !date || !time || !party || !name) return res.status(400).json({ error: "Missing fields" });
  try {
    const q = await pool.query(
      `select t.id, c.data as cfg
         from tenants t join configs c on c.tenant_id=t.id where t.slug=$1`,
      [tenant]
    );
    if (!q.rows.length) return res.status(404).json({ error: "Unknown tenant" });
    const { id: tenant_id, cfg } = q.rows[0];

    const slotDuration = Number(cfg.slotDurationMinutes || 30);
    const turnover = Number(cfg.turnoverMinutes || slotDuration);
    const [hh,mm] = String(time).split(":").map(Number);
    const slotStart = new Date(`${date}T${pad(hh)}:${pad(mm)}:00`);
    const slotEnd   = new Date(slotStart.getTime() + turnover*60*1000);
    const cap = (cfg.overrides||[]).find((o:any)=>o.date===date)?.capacityPerSlot ?? cfg.capacityPerSlot;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "select pg_advisory_xact_lock( ('x'||substr(md5($1),1,16))::bit(64)::bigint )",
        [ `${tenant}:${date}:${time}` ]
      );

      const ov = await client.query(
        `select coalesce(sum(party_size),0) as booked
           from bookings
          where tenant_id=$1
            and tstzrange(slot_start, slot_end, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)')`,
        [tenant_id, slotStart.toISOString(), slotEnd.toISOString()]
      );
      const booked = Number(ov.rows[0].booked);
      if (booked + Number(party) > cap) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Slot full" });
      }

      const ins = await client.query(
        `insert into bookings (tenant_id, slot_start, slot_end, party_size, name, email, phone, notes)
         values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
        [tenant_id, slotStart.toISOString(), slotEnd.toISOString(), party, name, email||null, phone||null, notes||null]
      );
      await client.query("COMMIT");

      const id = ins.rows[0].id as string;
      const reference = crypto.randomBytes(4).toString("hex");
      const icsUrl = `${process.env.PUBLIC_BASE_URL}/api/ics/${id}`;

      // Email (Resend) non bloquant
      (async () => {
        try {
          const notifyTo: string[] = (cfg.notifications?.to || []).filter(Boolean);
          const apiKey = process.env.RESEND_API_KEY;
          if (!notifyTo.length || !apiKey) return;
          const from = cfg.notifications?.from || process.env.RESEND_FROM || "onboarding@resend.dev";
          const subject = (cfg.notifications?.subjectPrefix || "Nouvelle réservation • ")
            + `${cfg.name} — ${date} ${time}`;
          const html = `
            <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5">
              <h2 style="margin:0 0 8px">Nouvelle réservation</h2>
              <p style="margin:0 0 12px"><strong>${cfg.name}</strong></p>
              <table style="border-collapse:collapse">
                <tr><td style="padding:4px 8px">Date</td><td style="padding:4px 8px"><strong>${date}</strong></td></tr>
                <tr><td style="padding:4px 8px">Heure</td><td style="padding:4px 8px"><strong>${time}</strong></td></tr>
                <tr><td style="padding:4px 8px">Couverts</td><td style="padding:4px 8px"><strong>${party}</strong></td></tr>
                <tr><td style="padding:4px 8px">Nom</td><td style="padding:4px 8px">${name}</td></tr>
                ${email ? `<tr><td style="padding:4px 8px">Email</td><td style="padding:4px 8px">${email}</td></tr>` : ""}
                ${phone ? `<tr><td style="padding:4px 8px">Téléphone</td><td style="padding:4px 8px">${phone}</td></tr>` : ""}
                ${notes ? `<tr><td style="padding:4px 8px">Notes</td><td style="padding:4px 8px">${notes}</td></tr>` : ""}
              </table>
              <p style="margin:12px 0">
                📅 Ajouter au calendrier : <a href="${icsUrl}">fichier .ics</a>
              </p>
            </div>`;
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ from, to: notifyTo, subject, html })
          });
        } catch (e) { console.error("Email notify error:", e); }
      })();

      res.json({ ok: true, id, reference, icsUrl });
    } finally { client.release(); }
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
};
