import type { Metadata } from 'next';
import { ToastProvider } from '@/../components/ui/toast';
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
      <body className="min-h-screen">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
