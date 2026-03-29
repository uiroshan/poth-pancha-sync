import type { MessageBatch, D1Database } from '@cloudflare/workers-types';

interface Env {
    WHATSAPP_ACCESS_TOKEN: string;
    WHATSAPP_PHONE_NUMBER_ID: string;
    WHATSAPP_TEMPLATE_NAME?: string;
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: string;
    WHATSAPP_DB: D1Database;
}

// Status advancement order — only allow forward transitions
const STATUS_ORDER: Record<string, number> = {
    'queued': 0,
    'sent': 1,
    'delivered': 2,
    'read': 3,
    'failed': 99, // failed can happen at any point
};

export default {
    async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
        const url = new URL(request.url);

        if (url.pathname === '/webhook' || url.pathname === '/') {
            if (request.method === 'GET') {
                const mode = url.searchParams.get('hub.mode');
                const token = url.searchParams.get('hub.verify_token');
                const challenge = url.searchParams.get('hub.challenge');

                if (mode && token) {
                    if (mode === 'subscribe' && token === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
                        console.log('Webhook verified successfully');
                        return new Response(challenge, { status: 200 });
                    }
                    return new Response('Forbidden', { status: 403 });
                }
                return new Response('Bad Request', { status: 400 });
            }

            if (request.method === 'POST') {
                try {
                    const body = await request.json() as any;

                    if (body.object === 'whatsapp_business_account') {
                        console.log('Received WhatsApp Webhook body:', JSON.stringify(body));

                        for (const entry of body.entry || []) {
                            for (const change of entry.changes || []) {
                                const value = change.value;
                                if (!value) continue;

                                // --- Process message status updates (sent, delivered, read, failed) ---
                                if (value.statuses) {
                                    for (const statusUpdate of value.statuses) {
                                        await processStatusUpdate(env, statusUpdate);
                                    }
                                }

                                // --- Process inbound customer messages ---
                                if (value.messages) {
                                    const contact = value.contacts?.[0];
                                    for (const msg of value.messages) {
                                        await processInboundMessage(env, msg, contact);
                                    }
                                }
                            }
                        }

                        return new Response('EVENT_RECEIVED', { status: 200 });
                    }
                    return new Response('Not Found', { status: 404 });
                } catch (error) {
                    console.error('Error processing webhook event:', error);
                    return new Response('Internal Server Error', { status: 500 });
                }
            }
        }

        return new Response('Not Found', { status: 404 });
    },

    async queue(batch: MessageBatch<any>, env: Env): Promise<void> {
        console.log(`Received batch of ${batch.messages.length} messages in whatsapp-sync`);

        for (const message of batch.messages) {
            try {
                const payload = message.body;
                const action = payload.action;
                const orderId = payload.id;
                const orderData = payload.data;

                console.log(`Processing order ${action} for ID: ${orderId}`);

                // Skip if customer has not opted in to WhatsApp messages
                if (orderData?.whatsapp_opt_in !== 'yes') {
                    console.log(`Order ${orderId}: WhatsApp opt-in is '${orderData?.whatsapp_opt_in}', skipping.`);
                    message.ack();
                    continue;
                }

                const orderStatus = orderData?.status;

                // Define template names based on the order status
                const STATUS_TEMPLATES: Record<string, string> = {
                    'processing': 'order_processing_template_2',
                    'on-hold': 'order_onhold_template_2',
                    'completed': 'order_completed_template',
                    'cancelled': 'order_cancelled_template',
                    'failed': 'order_failed_template'
                };

                const templateName = orderStatus ? STATUS_TEMPLATES[orderStatus] : null;

                if (!templateName) {
                    console.log(`Skipping WhatsApp message for order ${orderId}: No template configured for status '${orderStatus}'`);
                    message.ack();
                    continue;
                }

                // --- D1-based deduplication (replaces KV) ---
                const lastSent = await env.WHATSAPP_DB.prepare(
                    `SELECT template_name FROM messages
                     WHERE order_id = ? AND direction = 'outbound' AND template_name = ?
                     ORDER BY created_at DESC LIMIT 1`
                ).bind(orderId, templateName).first<{ template_name: string }>();

                if (lastSent) {
                    console.log(`Order ${orderId}: Already sent '${templateName}', skipping duplicate.`);
                    message.ack();
                    continue;
                }

                // Prefer whatsapp_number from meta_data, fall back to billing.phone
                const rawPhone = orderData?.whatsapp_number || orderData?.billing?.phone;
                if (!rawPhone) {
                    console.log(`Order ${orderId} has no phone number available, skipping WhatsApp message.`);
                    message.ack();
                    continue;
                }

                let numericPhone = rawPhone.replace(/\D/g, '');

                // Format Sri Lankan phone numbers
                if (numericPhone.startsWith('0') && numericPhone.length === 10) {
                    numericPhone = '94' + numericPhone.substring(1);
                } else if (numericPhone.length === 9) {
                    numericPhone = '94' + numericPhone;
                }

                if (numericPhone.length < 10 || numericPhone.length > 15) {
                    console.log(`Order ${orderId} has invalid phone number format or length: '${rawPhone}' -> '${numericPhone}'`);
                    message.ack();
                    continue;
                }

                console.log(`Sending WhatsApp message to ${numericPhone} for order ${orderId}`);

                const customerName = orderData?.billing?.first_name || 'Customer';
                const orderNumber = orderData?.number ? String(orderData.number) : String(orderId);

                const wabaPayload = {
                    messaging_product: "whatsapp",
                    to: numericPhone,
                    type: "template",
                    template: {
                        name: templateName,
                        language: { code: "en_US" },
                        components: [
                            {
                                type: "body",
                                parameters: [
                                    {
                                        type: "text",
                                        parameter_name: "customer_name",
                                        text: customerName
                                    },
                                    {
                                        type: "text",
                                        parameter_name: "order_id",
                                        text: orderNumber
                                    }
                                ]
                            }
                        ]
                    }
                };

                const response = await fetch(`https://graph.facebook.com/v22.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(wabaPayload)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`WhatsApp API Error for order ${orderId}: ${response.status} ${response.statusText}`, errorText);
                    throw new Error(`WhatsApp API request failed: ${response.status}`);
                }

                // Extract the wamid from Meta's response
                const responseData = await response.json() as { messages?: Array<{ id: string }> };
                console.log(`WhatsApp API response for order ${orderId}:`, JSON.stringify(responseData));
                const wamid = responseData.messages?.[0]?.id || `local_${orderId}_${Date.now()}`;

                // Store the outbound message in D1
                await env.WHATSAPP_DB.prepare(
                    `INSERT INTO messages (id, order_id, phone, direction, sender, type, template_name, content, status, status_at, customer_name)
                     VALUES (?, ?, ?, 'outbound', 'system', 'template', ?, ?, 'sent', datetime('now'), ?)`
                ).bind(
                    wamid,
                    orderId,
                    numericPhone,
                    templateName,
                    `Template: ${templateName} (Order #${orderNumber})`,
                    customerName
                ).run();

                console.log(`WhatsApp message sent and stored for order ${orderId} (wamid: ${wamid})`);

                // Acknowledge the message so it's removed from the queue
                message.ack();
            } catch (error) {
                console.error(`Error processing order message:`, error);
                // If it fails, explicitly retry it
                message.retry();
            }
        }
    }
};

/**
 * Process a message status update from the WhatsApp webhook.
 * Statuses can only advance forward: sent → delivered → read.
 * 'failed' can override any status.
 */
async function processStatusUpdate(env: Env, statusUpdate: any): Promise<void> {
    const wamid = statusUpdate.id;
    const newStatus = statusUpdate.status; // sent, delivered, read, failed
    const timestamp = statusUpdate.timestamp;

    if (!wamid || !newStatus) {
        console.log('Status update missing id or status, skipping.');
        return;
    }

    const statusAt = timestamp
        ? new Date(parseInt(timestamp) * 1000).toISOString()
        : new Date().toISOString();

    // Check current status to enforce forward-only transitions
    const existing = await env.WHATSAPP_DB.prepare(
        `SELECT status FROM messages WHERE id = ?`
    ).bind(wamid).first<{ status: string }>();

    if (!existing) {
        console.log(`Status update for unknown message ${wamid} (status: ${newStatus}), skipping.`);
        return;
    }

    const currentOrder = STATUS_ORDER[existing.status] ?? -1;
    const newOrder = STATUS_ORDER[newStatus] ?? -1;

    // Only update if the new status is ahead, or if it's 'failed'
    if (newStatus === 'failed' || newOrder > currentOrder) {
        await env.WHATSAPP_DB.prepare(
            `UPDATE messages SET status = ?, status_at = ? WHERE id = ?`
        ).bind(newStatus, statusAt, wamid).run();

        console.log(`Message ${wamid}: status updated ${existing.status} → ${newStatus}`);
    } else {
        console.log(`Message ${wamid}: ignoring status '${newStatus}' (current: '${existing.status}')`);
    }
}

/**
 * Process an inbound customer message from the WhatsApp webhook.
 * Stores the message in D1 for later viewing in the chat dashboard.
 */
async function processInboundMessage(env: Env, msg: any, contact: any): Promise<void> {
    const wamid = msg.id;
    const phone = msg.from; // sender's phone number
    const msgType = msg.type; // text, image, document, etc.
    const timestamp = msg.timestamp;

    if (!wamid || !phone) {
        console.log('Inbound message missing id or from, skipping.');
        return;
    }

    // Extract message content based on type
    let content = '';
    let mediaUrl = null;

    switch (msgType) {
        case 'text':
            content = msg.text?.body || '';
            break;
        case 'image':
            content = msg.image?.caption || '[Image]';
            mediaUrl = msg.image?.id || null; // Meta media ID — can be downloaded later
            break;
        case 'document':
            content = msg.document?.caption || `[Document: ${msg.document?.filename || 'file'}]`;
            mediaUrl = msg.document?.id || null;
            break;
        case 'audio':
            content = '[Audio message]';
            mediaUrl = msg.audio?.id || null;
            break;
        case 'video':
            content = '[Video]';
            mediaUrl = msg.video?.id || null;
            break;
        case 'sticker':
            content = '[Sticker]';
            break;
        case 'reaction':
            content = `[Reaction: ${msg.reaction?.emoji || ''}]`;
            break;
        default:
            content = `[${msgType || 'unknown'}]`;
    }

    const customerName = contact?.profile?.name || null;

    const createdAt = timestamp
        ? new Date(parseInt(timestamp) * 1000).toISOString()
        : new Date().toISOString();

    // Inbound messages don't have an order_id — only outbound template messages (from order updates) do.
    // Staff can manually link conversations to orders in the dashboard later.

    // Insert the inbound message (use INSERT OR IGNORE to handle duplicate webhooks)
    await env.WHATSAPP_DB.prepare(
        `INSERT OR IGNORE INTO messages (id, order_id, phone, direction, sender, type, content, media_url, status, status_at, created_at, customer_name)
         VALUES (?, NULL, ?, 'inbound', 'customer', ?, ?, ?, 'received', ?, ?, ?)`
    ).bind(
        wamid,
        phone,
        msgType || 'text',
        content,
        mediaUrl,
        createdAt,
        createdAt,
        customerName
    ).run();

    console.log(`Stored inbound ${msgType} message from ${phone} (wamid: ${wamid})`);
}
