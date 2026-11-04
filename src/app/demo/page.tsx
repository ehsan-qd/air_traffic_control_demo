import Link from 'next/link'
import DeconflictionDemo from '@/components/DeconflictionDemo'

export default function DemoPage() {
  return (
    <main className="standalone-page">
      <header className="standalone-header">
        <Link href="/presentation">← Back to presentation</Link>
        <span>QUANTUM DICE / NATS RESEARCH DEMONSTRATOR</span>
        <a href="/api/papers/sesar" target="_blank" rel="noreferrer">
          Research paper ↗
        </a>
      </header>
      <DeconflictionDemo standalone />
    </main>
  )
}
