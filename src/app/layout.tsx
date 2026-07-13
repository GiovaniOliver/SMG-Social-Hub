import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SMG Social Hub',
  description: 'Multi-brand social media management for SMG Business',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-900 text-white min-h-screen antialiased">
        {children}
      </body>
    </html>
  )
}
