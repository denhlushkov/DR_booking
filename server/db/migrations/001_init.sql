-- Початкова схема БД системи бронювання (PostgreSQL 15+).
-- Виконується автоматично контейнером postgres через /docker-entrypoint-initdb.d.

-- Потрібне для exclusion constraint на (resource_id, часовий інтервал).
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE user_role       AS ENUM ('EMPLOYEE', 'ADMIN');
CREATE TYPE resource_type   AS ENUM ('DESK', 'MEETING_ROOM');
CREATE TYPE resource_status AS ENUM ('AVAILABLE', 'MAINTENANCE', 'BLOCKED');
CREATE TYPE booking_status  AS ENUM ('CONFIRMED', 'CANCELLED', 'COMPLETED');

CREATE TABLE users (
    id            UUID PRIMARY KEY,
    full_name     TEXT        NOT NULL,
    email         TEXT        NOT NULL UNIQUE,
    password_hash TEXT        NOT NULL,              -- bcrypt (NFR-04)
    role          user_role   NOT NULL DEFAULT 'EMPLOYEE',
    department    TEXT        NOT NULL,
    position      TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE resources (
    id         UUID PRIMARY KEY,
    name       TEXT            NOT NULL,
    type       resource_type   NOT NULL,
    floor      INTEGER         NOT NULL,
    status     resource_status NOT NULL DEFAULT 'AVAILABLE',
    attributes JSONB           NOT NULL DEFAULT '{}'::jsonb   -- zone, capacity, equipment
);

CREATE TABLE bookings (
    id          UUID PRIMARY KEY,
    user_id     UUID           NOT NULL REFERENCES users (id),
    resource_id UUID           NOT NULL REFERENCES resources (id),
    start_time  TIMESTAMPTZ    NOT NULL,
    end_time    TIMESTAMPTZ    NOT NULL,
    status      booking_status NOT NULL DEFAULT 'CONFIRMED',
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT now(),
    CONSTRAINT bookings_valid_interval CHECK (end_time > start_time),
    -- FR-04: БД гарантує відсутність перетинів активних бронювань одного ресурсу,
    -- навіть якщо прикладна перевірка буде обійдена.
    CONSTRAINT bookings_no_overlap EXCLUDE USING gist (
        resource_id WITH =,
        tstzrange(start_time, end_time, '[)') WITH &&
    ) WHERE (status = 'CONFIRMED')
);

-- NFR-01: індекси для пошуку перетинів і особистого кабінету.
CREATE INDEX idx_bookings_resource_time ON bookings (resource_id, start_time, end_time);
CREATE INDEX idx_bookings_user          ON bookings (user_id, start_time DESC);
CREATE INDEX idx_resources_type_floor   ON resources (type, floor);
