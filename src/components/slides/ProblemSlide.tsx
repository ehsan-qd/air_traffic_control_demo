'use client'

export default function ProblemSlide() {
  return (
    <div className="flex items-center justify-center h-full px-8">
      <div className="max-w-5xl w-full">
        <h2 className="text-4xl lg:text-5xl font-sans font-semibold text-foreground mb-4 animate-fade-in-up">
          Why a new kind of compute?
        </h2>
        <p className="text-lg text-muted-foreground font-serif mb-12 animate-fade-in-up-delay-1 max-w-2xl">
          Critical operations problems are fundamentally mismatched to deterministic hardware
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="border border-border p-6 bg-card/50 backdrop-blur-sm animate-fade-in-up-delay-1">
            <div className="text-primary text-3xl font-sans font-semibold mb-3">01</div>
            <h3 className="text-xl font-sans font-semibold text-foreground mb-3">
              NP-hard problems
            </h3>
            <p className="text-muted-foreground font-serif text-sm leading-relaxed">
              Resource allocation, scheduling, and routing problems, among other combinatorial
              optimisation challenges, grow exponentially with scale. Airports, logistics hubs, and
              networks face these issues constantly.
            </p>
          </div>

          <div className="border border-border p-6 bg-card/50 backdrop-blur-sm animate-fade-in-up-delay-2">
            <div className="text-primary text-3xl font-sans font-semibold mb-3">02</div>
            <h3 className="text-xl font-sans font-semibold text-foreground mb-3">
              Limits of determinism
            </h3>
            <p className="text-muted-foreground font-serif text-sm leading-relaxed">
              While traditional optimisation algorithms that can run on general-purpose CPUs and
              GPUs can handle relatively small scale problems, they struggle as the problems scale
              and have a difficulty in dealing with uncertain conditions.
            </p>
          </div>

          <div className="border border-border p-6 bg-card/50 backdrop-blur-sm animate-fade-in-up-delay-3">
            <div className="text-primary text-3xl font-sans font-semibold mb-3">03</div>
            <h3 className="text-xl font-sans font-semibold text-foreground mb-3">
              Real-time demands
            </h3>
            <p className="text-muted-foreground font-serif text-sm leading-relaxed">
              Operational disruptions require re-optimisation in seconds, not hours or minutes.
              Classical solvers generally have to restart the optimisation each time wasting time
              and reducing flexibility.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
