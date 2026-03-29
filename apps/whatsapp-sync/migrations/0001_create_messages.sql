-- Migration: Create messages table for WhatsApp communication storage
CREATE TABLE IF NOT EXISTS messages (
    id            TEXT PRIMARY KEY,
    order_id      INTEGER,
    phone         TEXT NOT NULL,
    direction     TEXT NOT NULL CHECK(direction IN ('outbound', 'inbound')),
    sender        TEXT NOT NULL DEFAULT 'system',
    type          TEXT NOT NULL DEFAULT 'template',
    template_name TEXT,
    content       TEXT,
    media_url     TEXT,
    status        TEXT NOT NULL DEFAULT 'queued',
    status_at     TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    customer_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_order   ON messages(order_id);
CREATE INDEX IF NOT EXISTS idx_messages_phone   ON messages(phone);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
