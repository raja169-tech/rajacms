-- =============================================================================
-- CMS PWA — Initial Database Schema
-- Migration: 001_initial_schema.sql
-- Run via: Supabase SQL Editor or supabase db push
-- =============================================================================

-- ========== ENUM TYPES ==========
create type user_role as enum ('admin', 'employee', 'client');
create type txn_type as enum ('pay_in', 'pay_out');
create type txn_status as enum ('pending', 'approved', 'rejected');


-- =============================================================================
-- USERS
-- =============================================================================
create table users (
    id                  uuid primary key default gen_random_uuid(),
    role                user_role not null,
    display_name        text not null,
    client_code         char(6) unique,               -- only for role='client'
    login_identifier    text unique not null,          -- client_code | employee username | 'admin'
    password_hash       text not null,
    fee_percentage      numeric(5,2) not null default 0.00,  -- applied only on Pay-In for clients
    account_limit       numeric(14,2),                 -- max total balance; null = no cap
    is_active           boolean not null default true,
    force_password_change boolean not null default false, -- true on first login for new accounts
    created_by          uuid references users(id),
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

create index idx_users_client_code on users(client_code);
create index idx_users_login_identifier on users(login_identifier);


-- =============================================================================
-- COMPANY BANK ACCOUNTS (collection accounts clients pay into)
-- =============================================================================
create table company_bank_accounts (
    id              uuid primary key default gen_random_uuid(),
    label           text not null,
    upi_id          text,
    account_number  text,
    ifsc            text,
    limit_amount    numeric(14,2),            -- lifetime cap; null = unlimited; admin can raise/lower manually
    is_active       boolean not null default true,  -- manual admin on/off; independent of capacity
    created_by      uuid references users(id),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);


-- =============================================================================
-- TRANSACTIONS
-- =============================================================================
create table transactions (
    id                  uuid primary key default gen_random_uuid(),
    client_id           uuid not null references users(id),
    type                txn_type not null,

    -- Financial amounts (all computed server-side using Decimal / numeric)
    gross_amount        numeric(14,2) not null check (gross_amount > 0),
    fee_percentage      numeric(5,2) not null default 0.00,  -- snapshot of fee at submission time
    fee_amount          numeric(14,2) not null default 0.00, -- round(gross * fee_pct / 100, 2) ROUND_HALF_UP
    net_amount          numeric(14,2) not null,              -- gross - fee for pay_in; same as gross for pay_out (no fee)

    status              txn_status not null default 'pending',
    proof_url           text,                 -- Supabase Storage *path*, not public URL; signed at render time
    bank_account_id     uuid references company_bank_accounts(id),
    admin_notes         text,                 -- rejection reason or approval note
    idempotency_key     text unique,          -- UUID generated client-side; prevents duplicate submissions

    -- Processing
    processed_by        uuid references users(id),
    processed_at        timestamptz,
    matures_at          timestamptz,          -- pay_in only: processed_at + interval '24 hours' (set by DB trigger or backend)

    created_at          timestamptz not null default now()
);

create index idx_txn_client on transactions(client_id);
create index idx_txn_status on transactions(status);
create index idx_txn_created on transactions(created_at desc);
create index idx_txn_bank_account on transactions(bank_account_id);
create index idx_txn_matures on transactions(matures_at) where type = 'pay_in';
create index idx_txn_pending_age on transactions(created_at) where status = 'pending'; -- for stale-pending check


-- =============================================================================
-- AUDIT LOG (append-only — no UPDATE or DELETE ever granted)
-- =============================================================================
create table audit_log (
    id           bigserial primary key,
    actor_id     uuid references users(id),
    actor_role   user_role,
    action       text not null,              -- e.g. 'approve_transaction', 'create_client', 'disable_all_accounts'
    target_table text,
    target_id    uuid,
    meta         jsonb,                      -- before/after state, affected count for bulk ops, etc.
    ip_address   text,
    created_at   timestamptz not null default now()
);

-- No UPDATE or DELETE policy — insert-only enforced at application layer.
-- Index for admin audit viewer
create index idx_audit_actor on audit_log(actor_id);
create index idx_audit_created on audit_log(created_at desc);


-- =============================================================================
-- REFRESH TOKENS (for JWT rotation and revocation)
-- =============================================================================
create table refresh_tokens (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references users(id) on delete cascade,
    token_hash  text not null unique,         -- SHA-256 of the opaque token; never store plaintext
    expires_at  timestamptz not null,
    revoked     boolean not null default false,
    created_at  timestamptz not null default now()
);

create index idx_refresh_user on refresh_tokens(user_id);
create index idx_refresh_hash on refresh_tokens(token_hash);


-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- Note: FastAPI uses the service role key, so RLS is a defense-in-depth backup.
-- =============================================================================
alter table users enable row level security;
alter table transactions enable row level security;
alter table audit_log enable row level security;
alter table company_bank_accounts enable row level security;
alter table refresh_tokens enable row level security;

-- Service role bypasses RLS automatically (Supabase behaviour) — this is correct.
-- The policies below apply only if the anon/authenticated keys are ever used directly.

-- Users: clients see only themselves; staff see all
create policy users_select on users for select using (
    (select role from users where id = auth.uid()) in ('admin', 'employee')
    or auth.uid() = id
);

-- Transactions: clients see only their own
create policy txn_select on transactions for select using (
    client_id = auth.uid()
    or (select role from users where id = auth.uid()) in ('admin', 'employee')
);

-- Audit log: admin-only read
create policy audit_select on audit_log for select using (
    (select role from users where id = auth.uid()) = 'admin'
);


-- =============================================================================
-- HELPER FUNCTION: updated_at auto-update trigger
-- =============================================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger users_updated_at before update on users
    for each row execute function set_updated_at();

create trigger bank_accounts_updated_at before update on company_bank_accounts
    for each row execute function set_updated_at();


-- =============================================================================
-- SEED DATA (development only — delete or gate behind ENV check before prod)
-- =============================================================================

-- Admin user (password: Admin@1234)
-- bcrypt hash generated with cost=12 — replace with actual hash from Python
insert into users (role, display_name, login_identifier, password_hash, is_active)
values (
    'admin',
    'System Admin',
    'admin',
    '$2b$12$pr1jW0aOSj.btNv3NOhk9ufhETdUpDfJ3gT8FBTAv6oYSRqdq4LZe',
    true
);

-- Employee user (password: Employee@1234)
insert into users (role, display_name, login_identifier, password_hash, is_active, force_password_change)
values (
    'employee',
    'Test Employee',
    'employee01',
    '$2b$12$nBR2e/U3dcf.eUYOeKGMvukDLyEWwb6tAi6BMZf6DbOH3muya3e5y',
    true,
    true
);

-- Test client 1 (client_code: 100001, password: Client@1234)
insert into users (role, display_name, client_code, login_identifier, password_hash, fee_percentage, account_limit, is_active, force_password_change)
values (
    'client',
    'Acme Traders',
    '100001',
    '100001',
    '$2b$12$R.W.lU7wE1tK5e5NqK1I6eA0pGjO0hWwJp.zEw6yT9jVz5zL4Q.C2',
    2.00,
    2000000.00,  -- ₹20,00,000 limit
    true,
    true
);

-- Test client 2 (client_code: 100002, password: Client@5678, no limit)
insert into users (role, display_name, client_code, login_identifier, password_hash, fee_percentage, account_limit, is_active, force_password_change)
values (
    'client',
    'Global Exports',
    '100002',
    '100002',
    '$2b$12$R.W.lU7wE1tK5e5NqK1I6eA0pGjO0hWwJp.zEw6yT9jVz5zL4Q.C2',
    1.50,
    null,  -- unlimited
    true,
    true
);

-- Sample bank accounts
insert into company_bank_accounts (label, upi_id, account_number, ifsc, limit_amount, is_active)
values
    ('Primary HDFC - UPI', 'cms@hdfcbank', null, null, 5000000.00, true),   -- ₹50L cap
    ('Secondary SBI', null, '1234567890', 'SBIN0001234', 2000000.00, true); -- ₹20L cap
