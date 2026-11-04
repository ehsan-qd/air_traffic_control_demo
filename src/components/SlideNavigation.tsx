'use client'

import Image from 'next/image'

interface SlideNavigationProps {
  currentSlide: number
  totalSlides: number
  onNavigate: (slide: number) => void
  slideLabels: string[]
}

export default function SlideNavigation({
  currentSlide,
  totalSlides,
  onNavigate,
  slideLabels,
}: SlideNavigationProps) {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 sm:px-8 h-16 bg-black/90 backdrop-blur-lg border-b border-white/10">
      {/* Logo */}
      <div className="flex items-center gap-4">
        <Image
          src="/images/QuantumDiceLogoRGB transparent__white gradient.png"
          alt="Quantum Dice"
          width={100}
          height={33}
          className="h-6 sm:h-8 w-auto"
          priority
        />
      </div>

      {/* Slide indicators */}
      <div
        className="flex items-center gap-0 sm:gap-1"
        role="navigation"
        aria-label="Presentation slides"
      >
        {Array.from({ length: totalSlides }).map((_, i) => (
          <button
            key={i}
            onClick={() => onNavigate(i)}
            className="group relative px-1 py-3"
            title={slideLabels[i]}
            aria-label={`Slide ${i + 1}: ${slideLabels[i]}`}
            aria-current={i === currentSlide ? 'step' : undefined}
          >
            <div
              className={`h-1 transition-all duration-300 rounded-full ${
                i === currentSlide
                  ? 'w-4 sm:w-8 bg-primary'
                  : i < currentSlide
                    ? 'w-1 sm:w-4 bg-primary/40'
                    : 'w-1 sm:w-4 bg-white/20'
              }`}
            />
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              {slideLabels[i]}
            </div>
          </button>
        ))}
      </div>

      {/* Slide counter */}
      <div className="text-sm text-muted-foreground font-sans">
        <span className="text-primary">{String(currentSlide + 1).padStart(2, '0')}</span>
        <span className="mx-1">/</span>
        <span>{String(totalSlides).padStart(2, '0')}</span>
      </div>
    </div>
  )
}
