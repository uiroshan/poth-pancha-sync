import type { FC, PropsWithChildren } from 'hono/jsx';
import { styles } from '../styles';
import { clientScript } from '../client';

export const Layout: FC<PropsWithChildren<{ title?: string }>> = ({ children, title }) => (
    <html lang="en">
        <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>{title || 'Pothpancha — WhatsApp Dashboard'}</title>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
            <style dangerouslySetInnerHTML={{ __html: styles }} />
        </head>
        <body>
            {children}
            <script dangerouslySetInnerHTML={{ __html: clientScript }} />
        </body>
    </html>
);
