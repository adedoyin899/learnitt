import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import path from "path";

export async function createTestDatabase() {
  const db = new PGlite();

  // 1. Setup Supabase system schemas (auth & storage)
  await db.exec(`
    create schema if not exists auth;
    create table if not exists auth.users (
      id uuid primary key default gen_random_uuid(),
      instance_id uuid,
      aud varchar(255),
      role varchar(255),
      email varchar(255),
      encrypted_password varchar(255),
      email_confirmed_at timestamptz,
      raw_user_meta_data jsonb,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    create or replace function auth.uid()
    returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;

    create schema if not exists storage;
    create table if not exists storage.buckets (
      id text primary key,
      name text not null,
      owner uuid,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      public boolean default false
    );

    create table if not exists storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text references storage.buckets(id),
      name text,
      owner uuid,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      last_accessed_at timestamptz default now(),
      metadata jsonb
    );

    create or replace function storage.foldername(name text)
    returns text[] language sql immutable as $$
      select string_to_array(name, '/');
    $$;

    alter table storage.objects enable row level security;
  `);

  // 2. Read and apply all migrations in order
  const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    await db.exec(sql);
  }

  // 3. Read and apply seed.sql
  const seedPath = path.join(process.cwd(), "supabase", "seed.sql");
  if (fs.existsSync(seedPath)) {
    const seedSql = fs.readFileSync(seedPath, "utf8");
    await db.exec(seedSql);
  }

  // 4. Create authenticated and anon roles so RLS policies are enforced (not bypassed as superuser/owner)
  await db.exec(`
    do $$
    begin
      if not exists (select from pg_catalog.pg_roles where rolname = 'authenticated') then
        create role authenticated;
      end if;
      if not exists (select from pg_catalog.pg_roles where rolname = 'anon') then
        create role anon;
      end if;
    end
    $$;

    grant usage on schema public, storage, auth to authenticated, anon;
    grant all on all tables in schema public, storage, auth to authenticated, anon;
    grant all on all sequences in schema public, storage, auth to authenticated, anon;
    grant all on all routines in schema public, storage, auth to authenticated, anon;
  `);

  return {
    db,
    async asUser<T>(userId: string, fn: (client: PGlite) => Promise<T>): Promise<T> {
      await db.exec("BEGIN");
      try {
        await db.exec("SET LOCAL ROLE authenticated");
        await db.exec(`SET LOCAL request.jwt.claim.sub = '${userId}'`);
        const result = await fn(db);
        await db.exec("COMMIT");
        return result;
      } catch (err) {
        await db.exec("ROLLBACK");
        throw err;
      }
    },
    async asAnon<T>(fn: (client: PGlite) => Promise<T>): Promise<T> {
      await db.exec("BEGIN");
      try {
        await db.exec("SET LOCAL ROLE anon");
        await db.exec(`SET LOCAL request.jwt.claim.sub = ''`);
        const result = await fn(db);
        await db.exec("COMMIT");
        return result;
      } catch (err) {
        await db.exec("ROLLBACK");
        throw err;
      }
    },
    async asServiceRole<T>(fn: (client: PGlite) => Promise<T>): Promise<T> {
      // Direct access without setting unprivileged role (service role equivalent)
      await db.exec("BEGIN");
      try {
        await db.exec("RESET ROLE");
        const result = await fn(db);
        await db.exec("COMMIT");
        return result;
      } catch (err) {
        await db.exec("ROLLBACK");
        throw err;
      }
    },
  };
}
