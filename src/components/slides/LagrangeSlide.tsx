'use client'

import Image from 'next/image'

const specs = [
  { label: 'Logical p-bits (sparse)', value: '64,000' },
  { label: 'Flip rate', value: '2.7 Gflips/s' },
  { label: 'Form factor', value: '2U rack server' },
  { label: 'Interface', value: 'Ethernet' },
  { label: 'Temperature Requirements', value: 'Room temperature' },
  { label: 'P-bit source', value: 'Quantum photonic' },
]

export default function LagrangeSlide() {
  return (
    <div className="flex items-start justify-center h-full px-8 pt-4 overflow-y-auto dashboard-scroll">
      <div className="max-w-5xl w-full">
        <h2 className="text-4xl lg:text-5xl font-sans font-semibold text-foreground mb-4 animate-fade-in-up">
          Introducing Lagrange-0
        </h2>
        <p className="text-lg text-muted-foreground font-serif mb-10 animate-fade-in-up-delay-1 max-w-3xl">
          The first probabilistic processing unit powered by the{' '}
          <span className="orbit-trademark">ORBIT</span> architecture
        </p>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Left: system diagram */}
          <div className="lg:w-1/2 animate-fade-in-up-delay-2">
            <div className="border border-border p-6 bg-card/30 backdrop-blur-sm">
              <div className="text-xs text-muted-foreground font-sans uppercase tracking-widest mb-4">
                System architecture
              </div>
              <Image
                src="/images/orbit-dark-0030.webp"
                alt="Lagrange-0 system diagram"
                width={600}
                height={400}
                className="w-full h-auto object-contain"
              />
            </div>
          </div>

          {/* Right: specs + features */}
          <div className="lg:w-1/2 space-y-6">
            {/* Spec grid */}
            <div className="grid grid-cols-2 gap-3 animate-fade-in-up-delay-2">
              {specs.map((s) => (
                <div key={s.label} className="border border-border p-4 bg-card/30">
                  <div className="text-2xl font-sans font-semibold text-primary">{s.value}</div>
                  <div className="text-xs text-muted-foreground font-sans mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Key capabilities */}
            <div className="animate-fade-in-up-delay-3">
              <div className="text-xs text-muted-foreground font-sans uppercase tracking-widest mb-3">
                Key capabilities
              </div>
              <div className="space-y-2 text-sm font-serif text-muted-foreground">
                <div className="flex gap-2">
                  <span className="text-primary shrink-0">&#9632;</span> Fully reprogrammable
                  optoelectronic architecture
                </div>
                <div className="flex gap-2">
                  <span className="text-primary shrink-0">&#9632;</span> Patented DISC&#8482;
                  protocol for high reliability p-bits
                </div>
                <div className="flex gap-2">
                  <span className="text-primary shrink-0">&#9632;</span> No sparsification or
                  quadratisation required
                </div>
                <div className="flex gap-2">
                  <span className="text-primary shrink-0">&#9632;</span> Data-centre ready &mdash;
                  standard rack, no cryogenics
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
