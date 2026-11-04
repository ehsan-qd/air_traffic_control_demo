'use client'

import { useEffect, useRef, useState } from 'react'

function PBitNetwork() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = 500 * dpr
    canvas.height = 400 * dpr
    canvas.style.width = '500px'
    canvas.style.height = '400px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const nodes = [
      { x: 250, y: 50, activation: 0 },
      { x: 110, y: 140, activation: 0 },
      { x: 390, y: 140, activation: 0 },
      { x: 60, y: 260, activation: 0 },
      { x: 200, y: 250, activation: 0 },
      { x: 300, y: 250, activation: 0 },
      { x: 440, y: 260, activation: 0 },
      { x: 150, y: 350, activation: 0 },
      { x: 350, y: 350, activation: 0 },
    ]

    const edges: [number, number][] = [
      [0, 1],
      [0, 2],
      [1, 3],
      [1, 4],
      [2, 5],
      [2, 6],
      [3, 7],
      [4, 7],
      [4, 5],
      [5, 8],
      [6, 8],
      [0, 4],
      [0, 5],
      [1, 2],
      [3, 4],
      [5, 6],
      [7, 8],
    ]

    interface Pulse {
      from: number
      to: number
      progress: number
    }
    const pulses: Pulse[] = []
    let animationId: number

    const draw = () => {
      ctx.clearRect(0, 0, 500, 400)

      for (let n = 0; n < nodes.length; n++) {
        const node = nodes[n]
        if (Math.random() < 0.008 && node.activation < 0.1) {
          node.activation = 1
          for (const [a, b] of edges) {
            if ((a === n || b === n) && Math.random() < 0.5) {
              pulses.push({ from: n, to: a === n ? b : a, progress: 0 })
            }
          }
        }
        node.activation *= 0.97
      }

      for (const [a, b] of edges) {
        const intensity = Math.max(nodes[a].activation, nodes[b].activation)
        ctx.strokeStyle = `rgba(137, 194, 217, ${0.08 + intensity * 0.3})`
        ctx.lineWidth = 1 + intensity * 1.5
        ctx.beginPath()
        ctx.moveTo(nodes[a].x, nodes[a].y)
        ctx.lineTo(nodes[b].x, nodes[b].y)
        ctx.stroke()
      }

      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i]
        p.progress += 0.025
        if (p.progress >= 1) {
          nodes[p.to].activation = Math.min(1, nodes[p.to].activation + 0.6)
          pulses.splice(i, 1)
          continue
        }
        const fx = nodes[p.from].x,
          fy = nodes[p.from].y
        const tx = nodes[p.to].x,
          ty = nodes[p.to].y
        ctx.fillStyle = `rgba(137, 194, 217, ${0.9 - p.progress * 0.5})`
        ctx.beginPath()
        ctx.arc(fx + (tx - fx) * p.progress, fy + (ty - fy) * p.progress, 3, 0, Math.PI * 2)
        ctx.fill()
      }

      for (const node of nodes) {
        if (node.activation > 0.1) {
          const g = ctx.createRadialGradient(
            node.x,
            node.y,
            0,
            node.x,
            node.y,
            15 + node.activation * 10,
          )
          g.addColorStop(0, `rgba(137, 194, 217, ${node.activation * 0.3})`)
          g.addColorStop(1, 'rgba(137, 194, 217, 0)')
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.arc(node.x, node.y, 15 + node.activation * 10, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.fillStyle = `rgba(137, 194, 217, ${0.3 + node.activation * 0.7})`
        ctx.beginPath()
        ctx.arc(node.x, node.y, 5 + node.activation * 3, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = `rgba(188, 236, 236, ${0.4 + node.activation * 0.6})`
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(node.x, node.y, 5 + node.activation * 3, 0, Math.PI * 2)
        ctx.stroke()
      }

      animationId = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(animationId)
  }, [])

  return <canvas ref={canvasRef} style={{ width: 500, height: 400 }} />
}

// Animated bit visualization: deterministic 0 or 1
function BitViz() {
  const [value, setValue] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setValue((v) => v), 3000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-20 h-20 rounded-full border-2 border-white/30 flex items-center justify-center bg-white/5">
        <span className="text-3xl font-mono font-bold text-white/80">{value}</span>
      </div>
      <div className="text-xs text-white/40 font-sans uppercase tracking-wider">Deterministic</div>
    </div>
  )
}

// Animated p-bit: fluctuates between 0 and 1
function PBitViz() {
  const [value, setValue] = useState(0)
  useEffect(() => {
    const id = setInterval(() => {
      setValue(Math.random() < 0.5 ? 0 : 1)
    }, 300)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className={`w-20 h-20 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
          value === 1 ? 'border-primary bg-primary/20' : 'border-primary/40 bg-primary/5'
        }`}
      >
        <span
          className={`text-3xl font-mono font-bold transition-all duration-200 ${
            value === 1 ? 'text-primary' : 'text-primary/60'
          }`}
        >
          {value}
        </span>
      </div>
      <div className="text-xs text-primary/60 font-sans uppercase tracking-wider">Fluctuating</div>
    </div>
  )
}

// Animated qubit: Bloch sphere visualization
function QubitViz() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const size = 100
    const brandFont = getComputedStyle(canvas).getPropertyValue('--font-instrument-sans') || 'sans-serif'
    canvas.width = size * dpr
    canvas.height = size * dpr
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const cx = size / 2,
      cy = size / 2,
      r = 38
    let theta = 0.8 // polar angle (from |0⟩ axis)
    let phi = 0 // azimuthal angle
    let animationId: number

    const project = (x3: number, y3: number, z3: number) => {
      // Simple oblique projection for 3D effect
      const px = cx + x3 * 0.9 + z3 * 0.3
      const py = cy - y3 * 0.9 + z3 * 0.15
      return [px, py] as const
    }

    const draw = () => {
      ctx.clearRect(0, 0, size, size)

      // Outer sphere circle
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.45)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.stroke()

      // Equator ellipse (tilted to show 3D)
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.35)'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.ellipse(cx, cy, r, r * 0.3, 0, 0, Math.PI * 2)
      ctx.stroke()

      // Second cross-ellipse (rotated 90deg) for more sphere definition
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.25)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.ellipse(cx, cy, r * 0.3, r, 0, 0, Math.PI * 2)
      ctx.stroke()

      // Vertical axis (|0⟩ to |1⟩)
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.4)'
      ctx.lineWidth = 1.2
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(cx, cy - r)
      ctx.lineTo(cx, cy + r)
      ctx.stroke()
      ctx.setLineDash([])

      // Animate state vector precessing around the sphere
      phi += 0.025
      theta += Math.sin(phi * 0.3) * 0.003

      // 3D position on sphere
      const sx = r * Math.sin(theta) * Math.cos(phi)
      const sy = r * Math.cos(theta) // y is up
      const sz = r * Math.sin(theta) * Math.sin(phi)
      const [px, py] = project(sx, sy, sz)

      // State vector line from center
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.6)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(px, py)
      ctx.stroke()

      // Projection dashed line down to equator
      const [eqx, eqy] = project(sx, 0, sz)
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.3)'
      ctx.lineWidth = 1
      ctx.setLineDash([2, 2])
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(eqx, eqy)
      ctx.stroke()
      ctx.setLineDash([])

      // Endpoint glow
      const g = ctx.createRadialGradient(px, py, 0, px, py, 10)
      g.addColorStop(0, 'rgba(168, 85, 247, 0.5)')
      g.addColorStop(1, 'rgba(168, 85, 247, 0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(px, py, 10, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = 'rgba(168, 85, 247, 0.9)'
      ctx.beginPath()
      ctx.arc(px, py, 3, 0, Math.PI * 2)
      ctx.fill()

      // Pole labels
      ctx.fillStyle = 'rgba(212, 177, 255, 0.95)'
      ctx.font = `14px ${brandFont}`
      ctx.textAlign = 'center'
      ctx.fillText('|0⟩', cx, cy - r + 2)
      ctx.fillText('|1⟩', cx, cy + r + 8)

      animationId = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(animationId)
  }, [])

  return (
    <div className="flex flex-col items-center gap-4">
      <canvas ref={canvasRef} style={{ width: 100, height: 100 }} />
      <div className="text-xs text-purple-400/60 font-sans uppercase tracking-wider">
        Superposition
      </div>
    </div>
  )
}

// Front face: bit vs p-bit vs qubit comparison
function ComparisonFace() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-10">
      <h2 className="text-3xl lg:text-4xl font-sans font-semibold text-foreground animate-fade-in-up">
        Three types of computing bit
      </h2>

      <div className="flex items-start gap-8 lg:gap-16 animate-fade-in-up-delay-1">
        {/* Classical bit */}
        <div className="flex flex-col items-center gap-5 p-8 border border-white/10 bg-white/[0.02] min-w-[180px]">
          <h3 className="text-lg font-sans font-semibold text-white/70">Bit</h3>
          <BitViz />
          <p className="text-sm text-white/40 font-serif text-center max-w-[160px]">
            Always exactly 0 or 1
          </p>
        </div>

        {/* P-bit */}
        <div className="flex flex-col items-center gap-5 p-8 border border-primary/30 bg-primary/[0.03] min-w-[180px]">
          <h3 className="text-lg font-sans font-semibold text-primary">p-bit</h3>
          <PBitViz />
          <p className="text-sm text-primary/50 font-serif text-center max-w-[160px]">
            Fluctuates between 0 and 1
          </p>
        </div>

        {/* Qubit */}
        <div className="flex flex-col items-center gap-5 p-8 border border-purple-500/20 bg-purple-500/[0.03] min-w-[180px]">
          <h3 className="text-lg font-sans font-semibold text-purple-400">Qubit</h3>
          <QubitViz />
          <p className="text-sm text-purple-400/50 font-serif text-center max-w-[160px]">
            Superposition of 0 and 1
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 animate-fade-in-up-delay-2">
        <p className="text-sm text-white/30 font-serif">
          Press{' '}
          <kbd className="px-2 py-0.5 bg-white/10 text-white/50 text-xs font-mono rounded">→</kbd>{' '}
          to see how p-bits form a network
        </p>
      </div>
    </div>
  )
}

// Back face: p-bit network with explanation
function NetworkFace() {
  return (
    <div className="flex items-center justify-center h-full px-8">
      <div className="max-w-5xl w-full flex flex-col lg:flex-row items-center gap-12">
        <div className="lg:w-1/2">
          <h2 className="text-4xl lg:text-5xl font-sans font-semibold text-foreground mb-6 animate-fade-in-up">
            Probabilistic computing
          </h2>
          <div className="space-y-4 animate-fade-in-up-delay-1">
            <p className="text-lg text-muted-foreground font-serif leading-relaxed">
              A <strong className="text-foreground">probabilistic bit</strong> (p-bit) is a bit that
              naturally fluctuates between 0 and 1 — the fundamental unit of probabilistic
              computing.
            </p>
            <p className="text-lg text-muted-foreground font-serif leading-relaxed">
              Networks of coupled p-bits explore solution spaces in parallel, settling into{' '}
              <strong className="text-foreground">low-energy configurations</strong> that represent
              optimal or near-optimal solutions.
            </p>
            <p className="text-lg text-muted-foreground font-serif leading-relaxed">
              Unlike qubits, our p-bits operate at{' '}
              <strong className="text-foreground">room temperature</strong> with no error correction
              required.
            </p>
          </div>
          <div className="mt-6 flex gap-6 animate-fade-in-up-delay-2">
            <div className="flex gap-3 items-start">
              <div className="text-primary font-sans font-semibold">1.</div>
              <div className="text-sm text-muted-foreground font-serif">
                Encode problem as energy function
              </div>
            </div>
            <div className="flex gap-3 items-start">
              <div className="text-primary font-sans font-semibold">2.</div>
              <div className="text-sm text-muted-foreground font-serif">
                P-bits fluctuate and interact
              </div>
            </div>
            <div className="flex gap-3 items-start">
              <div className="text-primary font-sans font-semibold">3.</div>
              <div className="text-sm text-muted-foreground font-serif">
                Network settles on solution
              </div>
            </div>
          </div>
        </div>

        <div className="lg:w-1/2 flex justify-center animate-fade-in-up-delay-2">
          <div className="border border-border p-6 bg-card/30 backdrop-blur-sm">
            <div className="text-xs text-muted-foreground font-sans uppercase tracking-widest mb-4">
              p-bit network — energy propagation
            </div>
            <PBitNetwork />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PBitNetworkSlide({
  onSubStep,
}: {
  onSubStep?: (handler: (dir: 'next' | 'prev') => boolean) => void
}) {
  const [flipped, setFlipped] = useState(false)
  const flippedRef = useRef(flipped)
  useEffect(() => {
    flippedRef.current = flipped
  }, [flipped])

  useEffect(() => {
    onSubStep?.((dir: 'next' | 'prev') => {
      if (dir === 'next' && !flippedRef.current) {
        setFlipped(true)
        return true
      }
      if (dir === 'prev' && flippedRef.current) {
        setFlipped(false)
        return true
      }
      return false
    })
  }, [onSubStep])

  return (
    <div className="h-full" style={{ perspective: '2000px' }}>
      <div
        className="relative w-full h-full transition-transform duration-700"
        style={{
          transformStyle: 'preserve-3d',
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* Front */}
        <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
          <ComparisonFace />
        </div>

        {/* Back */}
        <div
          className="absolute inset-0"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <NetworkFace />
        </div>
      </div>
    </div>
  )
}
