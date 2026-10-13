CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TYPE "Role" AS ENUM ('host', 'booker', 'guest');
CREATE TYPE "Rail" AS ENUM ('vouch', 'public');
CREATE TYPE "BookingSource" AS ENUM ('direct', 'invite');
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), display_name text NOT NULL,
  role "Role" NOT NULL DEFAULT 'guest',
  invite_generation integer NOT NULL DEFAULT 0, first_inviter_id uuid REFERENCES users(id),
  first_invite_id uuid, feature_variant text NOT NULL DEFAULT 'treatment', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), host_id uuid NOT NULL REFERENCES users(id), title text NOT NULL,
  description text NOT NULL, starts_at timestamptz NOT NULL, price_cents integer NOT NULL CHECK(price_cents >= 0),
  capacity integer NOT NULL CHECK(capacity > 0), invite_feature_enabled boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE plans (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), activity_id uuid NOT NULL REFERENCES activities(id), owner_id uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(activity_id, owner_id));
CREATE TABLE invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE NOT NULL, activity_id uuid NOT NULL REFERENCES activities(id), plan_id uuid NOT NULL REFERENCES plans(id),
  inviter_id uuid NOT NULL REFERENCES users(id), rail "Rail" NOT NULL, contact_name text,
  expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE users ADD CONSTRAINT users_first_invite_fk FOREIGN KEY(first_invite_id) REFERENCES invites(id);
CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), activity_id uuid NOT NULL REFERENCES activities(id), plan_id uuid NOT NULL REFERENCES plans(id),
  user_id uuid NOT NULL REFERENCES users(id), source "BookingSource" NOT NULL, invite_id uuid REFERENCES invites(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(activity_id,user_id)
);
CREATE TABLE invite_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invite_id uuid NOT NULL REFERENCES invites(id), guest_id uuid NOT NULL REFERENCES users(id), booking_id uuid NOT NULL REFERENCES bookings(id),
  rail "Rail" NOT NULL, generation integer NOT NULL, claimed_at timestamptz NOT NULL DEFAULT now(), UNIQUE(invite_id, guest_id)
);
-- Attribution is evidence, not mutable profile data. Corrections are new events,
-- never rewrites of the original claim.
CREATE FUNCTION prevent_invite_claim_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'invite_claims are immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER invite_claims_immutable
  BEFORE UPDATE OR DELETE ON invite_claims
  FOR EACH ROW EXECUTE FUNCTION prevent_invite_claim_mutation();
CREATE TABLE analytics_events (id bigserial PRIMARY KEY, event_name text NOT NULL, user_id uuid REFERENCES users(id), activity_id uuid REFERENCES activities(id), invite_id uuid REFERENCES invites(id), rail "Rail", payload jsonb NOT NULL DEFAULT '{}', occurred_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE availability_receipts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), activity_id uuid NOT NULL REFERENCES activities(id), client_id text NOT NULL, published_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), platform text NOT NULL);
CREATE INDEX bookings_activity_idx ON bookings(activity_id); CREATE INDEX events_name_time_idx ON analytics_events(event_name, occurred_at);
CREATE INDEX availability_receipts_activity_idx ON availability_receipts(activity_id, received_at);
