-- Rate-limit state, owned by rate-limiter-flexible (D12).
--
-- Created by a migration rather than by the library at runtime: a DDL statement
-- on the first request is a deploy smell, and the store rejects `consume()`
-- until its own asynchronous create has resolved — a race the first responder
-- would lose. The shape matches the store's own CREATE TABLE statement exactly.
CREATE TABLE IF NOT EXISTS "rate_limits" (
	"key" varchar(255) PRIMARY KEY,
	"points" integer NOT NULL DEFAULT 0,
	"expire" bigint
);
