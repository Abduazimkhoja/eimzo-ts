import type { ReactNode } from 'react';
import './globals.css';

export const metadata = { title: 'eimzo-ts — Next.js' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
