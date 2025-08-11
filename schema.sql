CREATE EXTENSION IF NOT EXISTS pgcrypto;

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  timezone text not null
);

create table if not exists configs (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  data jsonb not null
);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  slot_start timestamptz not null,
  slot_end   timestamptz not null,
  party_size int not null check (party_size > 0),
  name text not null,
  email text,
  phone text,
  notes text,
  status text not null default 'confirmed',
  created_at timestamptz not null default now()
);

create index if not exists bookings_tenant_start_idx on bookings(tenant_id, slot_start);
