import type { FC } from 'hono/jsx';

export const Sidebar: FC = () => (
    <div class="sidebar">
        <div class="sidebar-header">
            <h1>💬 Pothpancha</h1>
            <button class="btn-icon" onclick="loadConversations()" title="Refresh">🔄</button>
        </div>

        <StatsBar />

        <div class="search-bar">
            <input
                type="text"
                id="search-input"
                placeholder="Search by name, phone or order..."
                oninput="filterConversations(this.value)"
            />
        </div>

        <div class="conversation-list" id="conversation-list">
            <div class="loading">
                <div class="spinner"></div> Loading...
            </div>
        </div>
    </div>
);

const StatsBar: FC = () => (
    <div class="stats-bar" id="stats-bar">
        <div class="stat">
            <span class="stat-value" id="stat-total">-</span>
            <span class="stat-label">Messages</span>
        </div>
        <div class="stat">
            <span class="stat-value" id="stat-contacts">-</span>
            <span class="stat-label">Contacts</span>
        </div>
        <div class="stat">
            <span class="stat-value" id="stat-delivered">-</span>
            <span class="stat-label">Delivered</span>
        </div>
        <div class="stat">
            <span class="stat-value" id="stat-read">-</span>
            <span class="stat-label">Read</span>
        </div>
    </div>
);
