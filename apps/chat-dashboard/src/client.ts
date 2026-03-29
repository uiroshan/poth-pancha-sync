export const clientScript = `
let allConversations = [];
let activePhone = null;

document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    loadConversations();
});

// ==================== Stats ====================
async function loadStats() {
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        setText('stat-total', formatNum(data.total_messages || 0));
        setText('stat-contacts', formatNum(data.unique_contacts || 0));
        setText('stat-delivered', formatNum(data.delivered || 0));
        setText('stat-read', formatNum(data.read_count || 0));
    } catch (e) {
        console.error('Failed to load stats:', e);
    }
}

// ==================== Conversations ====================
async function loadConversations() {
    const list = document.getElementById('conversation-list');
    list.innerHTML = '<div class="loading"><div class="spinner"></div> Loading...</div>';

    try {
        const res = await fetch('/api/conversations');
        allConversations = await res.json();
        renderConversations(allConversations);
    } catch (e) {
        list.innerHTML = '<div class="loading" style="color:var(--red)">Failed to load</div>';
    }
}

function renderConversations(conversations) {
    const list = document.getElementById('conversation-list');

    if (!conversations.length) {
        list.innerHTML = '<div class="loading">No conversations yet</div>';
        return;
    }

    list.innerHTML = conversations.map(c => {
        const name = c.customer_name || 'Unknown';
        const initial = name.charAt(0).toUpperCase();
        const time = formatTime(c.last_message_at);
        const preview = truncate(c.last_message || '', 45);
        const isActive = c.phone === activePhone;
        const dirIcon = c.last_direction === 'inbound' ? '\\u2190' : '\\u2192';
        const unread = c.unread_count > 0 ? '<span class="unread-badge">' + c.unread_count + '</span>' : '';
        const orderTag = c.order_id ? '<span class="order-tag">#' + c.order_id + '</span>' : '';

        return '<div class="conversation-item' + (isActive ? ' active' : '') + '" onclick="openChat(\\'' + c.phone + '\\')">'
            + '<div class="conv-avatar">' + initial + '</div>'
            + '<div class="conv-info">'
            + '<div class="conv-top"><span class="conv-name">' + esc(name) + orderTag + '</span>'
            + '<span class="conv-time">' + time + '</span></div>'
            + '<div class="conv-meta"><span class="conv-preview">' + dirIcon + ' ' + esc(preview) + '</span>' + unread + '</div>'
            + '</div></div>';
    }).join('');
}

function filterConversations(query) {
    const q = query.toLowerCase();
    const filtered = allConversations.filter(c =>
        (c.customer_name || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (String(c.order_id || '')).includes(q)
    );
    renderConversations(filtered);
}

// ==================== Chat ====================
async function openChat(phone) {
    activePhone = phone;
    document.getElementById('app').classList.add('chat-open');

    // Highlight active
    document.querySelectorAll('.conversation-item').forEach(el => el.classList.remove('active'));
    if (event && event.currentTarget) event.currentTarget.classList.add('active');

    // Header
    const header = document.getElementById('chat-header');
    header.style.display = 'flex';

    const conv = allConversations.find(c => c.phone === phone);
    const name = conv?.customer_name || 'Unknown';
    setText('chat-name', name);
    setText('chat-phone', '+' + phone);
    setText('chat-avatar', name.charAt(0).toUpperCase());

    // Messages
    const container = document.getElementById('chat-messages');
    container.innerHTML = '<div class="loading"><div class="spinner"></div> Loading messages...</div>';

    try {
        const res = await fetch('/api/conversations/' + phone);
        const messages = await res.json();
        renderMessages(messages);
    } catch (e) {
        container.innerHTML = '<div class="loading" style="color:var(--red)">Failed to load messages</div>';
    }
}

function renderMessages(messages) {
    const container = document.getElementById('chat-messages');

    if (!messages.length) {
        container.innerHTML = '<div class="empty-state"><p>No messages</p></div>';
        return;
    }

    let html = '';
    let lastDate = '';

    for (const msg of messages) {
        const msgDate = formatDate(msg.created_at);
        if (msgDate !== lastDate) {
            html += '<div class="date-separator"><span>' + msgDate + '</span></div>';
            lastDate = msgDate;
        }

        const isOutbound = msg.direction === 'outbound';
        const dirClass = isOutbound ? 'outbound' : 'inbound';
        const time = formatTime(msg.created_at);
        const statusIcon = getStatusIcon(msg.status);

        let senderBadge = '';
        if (msg.sender && msg.sender !== 'customer') {
            senderBadge = '<span class="sender-badge ' + msg.sender + '">' + getSenderLabel(msg.sender) + '</span>';
        }

        let orderTag = '';
        if (msg.order_id) {
            orderTag = '<span class="order-tag">Order #' + msg.order_id + '</span>';
        }

        const content = msg.template_name
            ? '\\u{1F4CB} ' + esc(msg.template_name.replace(/_/g, ' '))
            : esc(msg.content || '');

        html += '<div class="message ' + dirClass + '">'
            + senderBadge + orderTag
            + '<div class="message-content">' + content + '</div>'
            + '<div class="message-meta">'
            + '<span class="message-time">' + time + '</span>'
            + (isOutbound ? '<span class="message-status">' + statusIcon + '</span>' : '')
            + '</div></div>';
    }

    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
}

// ==================== Helpers ====================
function getStatusIcon(status) {
    switch (status) {
        case 'queued': return '\\u{1F550}';
        case 'sent': return '\\u2713';
        case 'delivered': return '\\u2713\\u2713';
        case 'read': return '<span style="color:#0984e3">\\u2713\\u2713</span>';
        case 'failed': return '<span style="color:#d63031">\\u2715</span>';
        default: return '\\u00B7';
    }
}

function getSenderLabel(sender) {
    switch (sender) {
        case 'system': return '\\u{1F916} Bot';
        case 'human': return '\\u{1F464} Staff';
        case 'ai': return '\\u{1F9E0} AI';
        default: return sender;
    }
}

function formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now - d) / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now - d) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatNum(n) { return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n); }
function truncate(str, len) { return str.length > len ? str.substring(0, len) + '\\u2026' : str; }
function esc(str) { const el = document.createElement('span'); el.textContent = str; return el.innerHTML; }
function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
`;
