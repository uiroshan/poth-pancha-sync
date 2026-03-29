export const styles = `
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

:root {
    --bg-primary: #0a0a0f;
    --bg-secondary: #12121a;
    --bg-tertiary: #1a1a2e;
    --bg-hover: #1e1e32;
    --bg-active: #252542;
    --border: #2a2a40;
    --text-primary: #e8e8f0;
    --text-secondary: #9090a8;
    --text-muted: #606078;
    --accent: #6c5ce7;
    --accent-glow: rgba(108, 92, 231, 0.15);
    --green: #00b894;
    --green-soft: rgba(0, 184, 148, 0.12);
    --blue: #0984e3;
    --blue-soft: rgba(9, 132, 227, 0.12);
    --orange: #e17055;
    --red: #d63031;
    --red-soft: rgba(214, 48, 49, 0.12);
    --bubble-outbound: #1a1a3e;
    --bubble-inbound: #1e2d1e;
    --radius: 12px;
    --radius-sm: 8px;
}

body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
    height: 100vh;
    overflow: hidden;
}

/* ===================== Layout ===================== */
.app { display: flex; height: 100vh; }

.sidebar {
    width: 380px;
    min-width: 320px;
    background: var(--bg-secondary);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
}

.sidebar-header {
    padding: 20px 24px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.sidebar-header h1 {
    font-size: 18px;
    font-weight: 700;
    background: linear-gradient(135deg, var(--accent), #a29bfe);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}

.btn-icon {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 18px;
    padding: 4px;
    border-radius: 6px;
    transition: background 0.15s;
}
.btn-icon:hover { background: var(--bg-hover); }

/* ===================== Stats ===================== */
.stats-bar {
    display: flex;
    gap: 12px;
    padding: 12px 24px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-tertiary);
}

.stat { display: flex; flex-direction: column; align-items: center; flex: 1; }
.stat-value { font-size: 20px; font-weight: 700; color: var(--text-primary); }
.stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); margin-top: 2px; }

/* ===================== Search ===================== */
.search-bar { padding: 12px 16px; border-bottom: 1px solid var(--border); }

.search-bar input {
    width: 100%;
    padding: 10px 14px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-size: 13px;
    font-family: inherit;
    outline: none;
    transition: border-color 0.2s;
}
.search-bar input::placeholder { color: var(--text-muted); }
.search-bar input:focus { border-color: var(--accent); }

/* ===================== Conversations ===================== */
.conversation-list { flex: 1; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--border) transparent; }

.conversation-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 20px;
    cursor: pointer;
    border-bottom: 1px solid var(--border);
    transition: background 0.15s;
}
.conversation-item:hover { background: var(--bg-hover); }
.conversation-item.active { background: var(--bg-active); border-left: 3px solid var(--accent); }

.conv-avatar {
    width: 42px; height: 42px;
    border-radius: 50%;
    background: var(--bg-tertiary);
    display: flex; align-items: center; justify-content: center;
    font-size: 16px;
    flex-shrink: 0;
    border: 1px solid var(--border);
}

.conv-info { flex: 1; min-width: 0; }
.conv-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.conv-name { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.conv-time { font-size: 11px; color: var(--text-muted); flex-shrink: 0; margin-left: 8px; }
.conv-preview { font-size: 12px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.conv-meta { display: flex; align-items: center; gap: 6px; }

.unread-badge {
    background: var(--accent);
    color: white;
    font-size: 10px;
    font-weight: 700;
    min-width: 18px; height: 18px;
    border-radius: 9px;
    display: flex; align-items: center; justify-content: center;
    padding: 0 5px;
}

.order-tag {
    display: inline-block;
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 4px;
    background: var(--accent-glow);
    color: var(--accent);
    font-weight: 600;
    margin-left: 6px;
}

/* ===================== Chat Panel ===================== */
.chat-panel { flex: 1; display: flex; flex-direction: column; background: var(--bg-primary); }

.chat-header {
    padding: 16px 24px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-secondary);
    display: flex;
    align-items: center;
    gap: 14px;
}

.chat-header-avatar {
    width: 38px; height: 38px;
    border-radius: 50%;
    background: var(--bg-tertiary);
    display: flex; align-items: center; justify-content: center;
    font-size: 15px;
    border: 1px solid var(--border);
}

.chat-header-info h2 { font-size: 15px; font-weight: 600; }
.chat-header-info p { font-size: 12px; color: var(--text-secondary); }

.chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
}

/* ===================== Messages ===================== */
.message {
    max-width: 65%;
    padding: 10px 14px;
    border-radius: var(--radius);
    font-size: 13px;
    line-height: 1.5;
    position: relative;
    animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
}

.message.outbound {
    background: var(--bubble-outbound);
    align-self: flex-end;
    border: 1px solid rgba(108, 92, 231, 0.15);
    border-bottom-right-radius: 4px;
}

.message.inbound {
    background: var(--bubble-inbound);
    align-self: flex-start;
    border: 1px solid rgba(0, 184, 148, 0.15);
    border-bottom-left-radius: 4px;
}

.message-content { word-wrap: break-word; }
.message-meta { display: flex; align-items: center; justify-content: flex-end; gap: 6px; margin-top: 4px; }
.message-time { font-size: 10px; color: var(--text-muted); }
.message-status { font-size: 11px; }

.sender-badge {
    display: inline-block;
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 2px 6px;
    border-radius: 4px;
    margin-bottom: 4px;
}

.sender-badge.system { background: var(--bg-tertiary); color: var(--text-muted); }
.sender-badge.human { background: var(--green-soft); color: var(--green); }
.sender-badge.ai { background: var(--blue-soft); color: var(--blue); }

.date-separator { text-align: center; padding: 12px 0; }
.date-separator span {
    font-size: 11px;
    color: var(--text-muted);
    background: var(--bg-tertiary);
    padding: 4px 14px;
    border-radius: 20px;
}

/* ===================== Empty / Loading ===================== */
.empty-state {
    flex: 1;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    color: var(--text-muted); gap: 12px;
}
.empty-state .icon { font-size: 48px; opacity: 0.3; }
.empty-state p { font-size: 14px; }

.loading { display: flex; align-items: center; justify-content: center; padding: 40px; color: var(--text-muted); }
.spinner {
    width: 20px; height: 20px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-right: 10px;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ===================== Responsive ===================== */
@media (max-width: 768px) {
    .sidebar { width: 100%; }
    .chat-panel { display: none; }
    .app.chat-open .sidebar { display: none; }
    .app.chat-open .chat-panel { display: flex; }
}
`;
