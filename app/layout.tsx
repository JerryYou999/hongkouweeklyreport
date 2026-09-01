import type { Metadata } from 'next';
import { Noto_Sans_SC, Noto_Serif_SC } from 'next/font/google';
import './globals.css';

const sans = Noto_Sans_SC({
  variable: '--font-sans-cn',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const serif = Noto_Serif_SC({
  variable: '--font-serif-cn',
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_BASE_URL || 'http://localhost:3001'),
  title: '虹口区区域深耕周报',
  description: '上传、归档和检索虹口区区域深耕周报。',
  robots: { index: false, follow: false },
  openGraph: {
    title: '虹口区区域深耕周报',
    description: '安全归档 · 全文检索 · 版本留存',
    images: [{ url: '/og.png', width: 1729, height: 910, alt: '虹口区区域深耕周报' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '虹口区区域深耕周报',
    description: '安全归档 · 全文检索 · 版本留存',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={`${sans.variable} ${serif.variable} antialiased`}>{children}</body>
    </html>
  );
}
