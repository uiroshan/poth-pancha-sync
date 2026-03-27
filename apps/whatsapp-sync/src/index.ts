import type { MessageBatch } from '@cloudflare/workers-types';

interface Env {
    WHATSAPP_ACCESS_TOKEN: string;
    WHATSAPP_PHONE_NUMBER_ID: string;
    WHATSAPP_TEMPLATE_NAME?: string;
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: string;
}

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
                                if (change.value && change.value.messages) {
                                    for (const msg of change.value.messages) {
                                        console.log('Received user reply:', JSON.stringify(msg));
                                        // Process incoming message
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

                // Prefer whatsapp_number from meta_data, fall back to billing.phone
                const rawPhone = orderData?.whatsapp_number || orderData?.billing?.phone;
                if (rawPhone) {
                    let numericPhone = rawPhone.replace(/\\D/g, '');

                    // Format Sri Lankan phone numbers
                    if (numericPhone.startsWith('0') && numericPhone.length === 10) {
                        numericPhone = '94' + numericPhone.substring(1);
                    } else if (numericPhone.length === 9) {
                        numericPhone = '94' + numericPhone;
                    }

                    if (numericPhone.length >= 10 && numericPhone.length <= 15) {
                        console.log(`Sending WhatsApp message to ${numericPhone} for order ${orderId}`);

                        const orderStatus = orderData?.status;

                        // Define your template names here based on the status
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
                                                text: orderData?.billing?.first_name || "Customer"
                                            },
                                            {
                                                type: "text",
                                                parameter_name: "order_id",
                                                text: (orderData?.number ? String(orderData.number) : String(orderId))
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

                        console.log(`WhatsApp message sent successfully for order ${orderId}`);
                    } else {
                        console.log(`Order ${orderId} has invalid phone number format or length: '${rawPhone}' -> '${numericPhone}'`);
                    }
                } else {
                    console.log(`Order ${orderId} has no phone number available, skipping WhatsApp message.`);
                }

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
