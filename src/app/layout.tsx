import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'

const instrumentSans = localFont({
  src: '../../public/fonts/instrument-sans-latin.woff2',
  variable: '--font-instrument-sans',
  weight: '400 700',
  display: 'swap',
})

const lora = localFont({
  src: '../../public/fonts/lora-latin.woff2',
  variable: '--font-lora',
  weight: '400 700',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Quantum Dice | En-route Deconfliction',
  description:
    'Interactive air-traffic deconfliction demonstrator based on the NATS and Quantum Dice research papers.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${instrumentSans.variable} ${lora.variable} antialiased`}>{children}</body>
    </html>
  )
}
