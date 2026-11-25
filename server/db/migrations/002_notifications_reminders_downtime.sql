-- ЛР №5: сповіщення (FR-11), нагадування, історія недоступності ресурсів (FR-07).

-- Нагадування перед початком бронювання: позначка, щоб не надсилати двічі.
ALTER TABLE bookings ADD COLUMN reminder_sent_at TIMESTAMPTZ;

CREATE INDEX idx_bookings_due_reminders ON bookings (start_time)
    WHERE status = 'CONFIRMED' AND reminder_sent_at IS NULL;
CREATE INDEX idx_bookings_active_end ON bookings (end_time)
    WHERE status = 'CONFIRMED';

-- Періоди, коли ресурс був на обслуговуванні або заблокований.
-- Не враховуються в доступності при розрахунку завантаженості (FR-07).
CREATE TABLE resource_status_history (
    id          UUID PRIMARY KEY,
    resource_id UUID            NOT NULL REFERENCES resources (id),
    status      resource_status NOT NULL CHECK (status <> 'AVAILABLE'),
    started_at  TIMESTAMPTZ     NOT NULL,
    ended_at    TIMESTAMPTZ,
    CONSTRAINT status_history_valid_interval CHECK (ended_at IS NULL OR ended_at >= started_at)
);

-- Для ресурсу може бути лише один відкритий період простою.
CREATE UNIQUE INDEX uq_status_history_open ON resource_status_history (resource_id) WHERE ended_at IS NULL;
CREATE INDEX idx_status_history_period ON resource_status_history (started_at, ended_at);

CREATE TYPE notification_type AS ENUM (
    'BOOKING_CREATED',
    'BOOKING_UPDATED',
    'BOOKING_CANCELLED',
    'BOOKING_CANCELLED_BY_ADMIN',
    'BOOKING_REMINDER'
);

CREATE TABLE notifications (
    id         UUID PRIMARY KEY,
    user_id    UUID              NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    type       notification_type NOT NULL,
    title      TEXT              NOT NULL,
    message    TEXT              NOT NULL,
    booking_id UUID              REFERENCES bookings (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ       NOT NULL DEFAULT now(),
    read_at    TIMESTAMPTZ
);

CREATE INDEX idx_notifications_user ON notifications (user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications (user_id) WHERE read_at IS NULL;
