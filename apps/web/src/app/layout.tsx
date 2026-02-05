import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hour Tracker',
  description: 'Multitenant time tracking for modern teams.'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
