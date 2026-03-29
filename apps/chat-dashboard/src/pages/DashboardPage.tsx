import type { FC } from 'hono/jsx';
import { Layout } from '../components/Layout';
import { Sidebar } from '../components/Sidebar';
import { ChatPanel } from '../components/ChatPanel';

export const DashboardPage: FC = () => (
    <Layout>
        <div class="app" id="app">
            <Sidebar />
            <ChatPanel />
        </div>
    </Layout>
);
