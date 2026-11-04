'use client'

import Image from 'next/image'

const investors = [
  { name: 'Elaia Partners', src: '/images/elaia.png' },
  { name: 'IP Group', src: '/images/ip_group.png' },
  { name: 'Future Planet Capital', src: '/images/future_planet.png' },
]

export default function CompanySlide() {
  return (
    <div className="flex items-start justify-center h-full px-8 pt-4 overflow-y-auto dashboard-scroll">
      <div className="max-w-6xl w-full">
        <div className="flex items-center justify-center gap-4 mb-8 animate-fade-in-up">
          <Image
            src="/images/QuantumDiceLogoRGB transparent__white gradient.png"
            alt="Quantum Dice"
            width={200}
            height={60}
            className="h-14 w-auto object-contain"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Frame 1: Oxford Spinout */}
          <div className="border border-border bg-card/30 backdrop-blur-sm animate-fade-in-up-delay-1 flex flex-col">
            <div className="p-5 flex-1">
              <div className="text-xs text-primary font-sans uppercase tracking-widest mb-2">
                Origin
              </div>
              <h3 className="text-lg font-sans font-semibold text-foreground mb-2">
                University of Oxford Spinout
              </h3>
              <p className="text-sm text-muted-foreground font-serif leading-relaxed mb-4">
                Founded on world-leading photonics IP from the University of Oxford Department of
                Physics. Building the first scalable probabilistic computing hardware.
              </p>
              <div className="flex justify-center">
                <Image
                  src="/images/rad_cam_dark_mode.png"
                  alt="Radcliffe Camera, Oxford"
                  width={160}
                  height={160}
                  className="w-32 h-auto object-contain opacity-70"
                />
              </div>
            </div>
          </div>

          {/* Frame 2: VC Backing */}
          <div className="border border-border bg-card/30 backdrop-blur-sm animate-fade-in-up-delay-2 flex flex-col">
            <div className="p-5 flex-1">
              <div className="text-xs text-primary font-sans uppercase tracking-widest mb-2">
                Investors
              </div>
              <h3 className="text-lg font-sans font-semibold text-foreground mb-2">
                Venture Capital Backed
              </h3>
              <p className="text-sm text-muted-foreground font-serif leading-relaxed mb-4">
                Backed by leading deep-tech investors who share our vision of transforming computing
                through probabilistic hardware.
              </p>
              <div className="space-y-3">
                {investors.map((inv) => (
                  <div
                    key={inv.name}
                    className="flex items-center justify-center p-3 border border-border/30 bg-white/5 rounded"
                  >
                    <Image
                      src={inv.src}
                      alt={inv.name}
                      width={120}
                      height={40}
                      className="h-8 w-auto object-contain brightness-0 invert opacity-70"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Frame 3: Customers */}
          <div className="border border-border bg-card/30 backdrop-blur-sm animate-fade-in-up-delay-3 flex flex-col">
            <div className="p-5 flex-1">
              <div className="text-xs text-primary font-sans uppercase tracking-widest mb-2">
                Customers
              </div>
              <h3 className="text-lg font-sans font-semibold text-foreground mb-2">
                Trusted by Industry Leaders
              </h3>
              <p className="text-sm text-muted-foreground font-serif leading-relaxed mb-4">
                Working with global enterprises across telecommunications, aerospace, and
                government.
              </p>
              <div className="space-y-3">
                <div className="flex items-center justify-center p-3 border border-border/30 bg-white/5 rounded">
                  <Image
                    src="/images/AT&T_logo_2016.svg"
                    alt="AT&T"
                    width={120}
                    height={40}
                    className="h-8 w-auto object-contain brightness-0 invert opacity-70"
                  />
                </div>
                <div className="flex items-center justify-center p-3 border border-border/30 bg-white/5 rounded">
                  <Image
                    src="/images/Airbus_Logo_2017.svg.png"
                    alt="Airbus"
                    width={120}
                    height={40}
                    className="h-8 w-auto object-contain brightness-0 invert opacity-70"
                  />
                </div>
                <div className="flex items-center justify-center p-3 border border-border/30 bg-white/5 rounded">
                  <Image
                    src="/images/HM_Government_logo.svg_.png"
                    alt="UK Government"
                    width={120}
                    height={40}
                    className="h-8 w-auto object-contain brightness-0 invert opacity-70"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
