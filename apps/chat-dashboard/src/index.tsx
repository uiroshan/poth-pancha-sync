import { Hono } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import { DashboardPage } from './pages/DashboardPage';

type Bindings = {
    WHATSAPP_DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

// ==================== Pages ====================

app.get('/', (c) => {
    return c.html(<DashboardPage />);
});

// ==================== API: Stats ====================

app.get('/api/stats', async (c) => {
    const stats = await c.env.WHATSAPP_DB.prepare(`
        SELECT
            COUNT(*) AS total_messages,
            SUM(CASE WHEN direction = 'outbound' THEN 1 ELSE 0 END) AS outbound,
            SUM(CASE WHEN direction = 'inbound' THEN 1 ELSE 0 END) AS inbound,
            SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
            SUM(CASE WHEN status = 'read' THEN 1 ELSE 0 END) AS read_count,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
            COUNT(DISTINCT phone) AS unique_contacts
        FROM messages
    `).first();

    return c.json(stats);
});

// ==================== API: Conversations ====================

app.get('/api/conversations', async (c) => {
    const conversations = await c.env.WHATSAPP_DB.prepare(`
        SELECT
            m.phone,
            m.customer_name,
            m.order_id,
            m.content AS last_message,
            m.direction AS last_direction,
            m.sender AS last_sender,
            m.created_at AS last_message_at,
            (SELECT COUNT(*) FROM messages m2
             WHERE m2.phone = m.phone AND m2.direction = 'inbound' AND m2.status = 'received') AS unread_count,
            (SELECT COUNT(*) FROM messages m2
             WHERE m2.phone = m.phone) AS total_messages
        FROM messages m
        WHERE m.created_at = (
            SELECT MAX(m3.created_at) FROM messages m3 WHERE m3.phone = m.phone
        )
        GROUP BY m.phone
        ORDER BY m.created_at DESC
    `).all();

    return c.json(conversations.results);
});

// ==================== API: Messages by Phone ====================

app.get('/api/conversations/:phone', async (c) => {
    const phone = c.req.param('phone');
    const limit = parseInt(c.req.query('limit') || '100');
    const offset = parseInt(c.req.query('offset') || '0');

    const messages = await c.env.WHATSAPP_DB.prepare(`
        SELECT * FROM messages
        WHERE phone = ?
        ORDER BY created_at ASC
        LIMIT ? OFFSET ?
    `).bind(phone, limit, offset).all();

    return c.json(messages.results);
});

// ==================== API: Messages by Order ====================

app.get('/api/orders/:orderId/messages', async (c) => {
    const orderId = parseInt(c.req.param('orderId'));

    const messages = await c.env.WHATSAPP_DB.prepare(`
        SELECT * FROM messages
        WHERE order_id = ?
        ORDER BY created_at ASC
    `).bind(orderId).all();

    return c.json(messages.results);
});

export default app;
