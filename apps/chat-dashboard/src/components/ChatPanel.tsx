import type { FC } from 'hono/jsx';

export const ChatPanel: FC = () => (
    <div class="chat-panel">
        <div id="chat-header" class="chat-header" style="display:none">
            <div class="chat-header-avatar" id="chat-avatar">💬</div>
            <div class="chat-header-info">
                <h2 id="chat-name">-</h2>
                <p id="chat-phone">-</p>
            </div>
        </div>

        <div class="chat-messages" id="chat-messages">
            <div class="empty-state">
                <div class="icon">💬</div>
                <p>Select a conversation to view messages</p>
            </div>
        </div>
    </div>
);
