WITH t AS (
  INSERT INTO tenants (slug, name, timezone)
  VALUES ('chez-amelie','Chez Amélie','Europe/Paris')
  ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name
  RETURNING id
)
INSERT INTO configs (tenant_id, data)
VALUES (
  (SELECT id FROM t),
  '{
    "tenant":"chez-amelie",
    "name":"Chez Amélie",
    "timezone":"Europe/Paris",
    "openDays":[1,2,3,4,5,6],
    "timeWindows":{
      "1":[{"start":"12:00","end":"14:30"},{"start":"19:00","end":"22:30"}],
      "2":[{"start":"12:00","end":"14:30"},{"start":"19:00","end":"22:30"}],
      "3":[{"start":"12:00","end":"14:30"},{"start":"19:00","end":"22:30"}],
      "4":[{"start":"12:00","end":"14:30"},{"start":"19:00","end":"22:30"}],
      "5":[{"start":"12:00","end":"14:30"},{"start":"19:00","end":"23:00"}],
      "6":[{"start":"12:00","end":"15:00"},{"start":"19:00","end":"23:00"}]
    },
    "slotDurationMinutes":30,
    "turnoverMinutes":90,
    "bufferMinutes":0,
    "leadTimeMinutes":120,
    "maxPartySize":8,
    "capacityPerSlot":30,
    "blackoutDates":[
      "2025-01-01","2025-04-21","2025-05-01","2025-05-08","2025-05-29","2025-06-09",
      "2025-07-14","2025-08-15","2025-11-01","2025-11-11","2025-12-25"
    ],
    "notifications": {
      "to": ["reservations@chezamelie.fr"],
      "from": "onboarding@resend.dev",
      "subjectPrefix": "Nouvelle réservation • "
    }
  }'::jsonb
)
ON CONFLICT (tenant_id) DO UPDATE SET data = EXCLUDED.data;
