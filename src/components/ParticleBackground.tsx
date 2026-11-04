'use client'

import { useEffect, useRef } from 'react'

interface Node {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  colorIntensity: number
}

export default function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)
  const nodesRef = useRef<Node[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = 0
    let height = 0

    const nodeCount = 180
    const connectionDistance = 130
    const nodeSpeed = 0.25
    const nodeRadius = 2

    const initNodes = () => {
      nodesRef.current = []
      for (let i = 0; i < nodeCount; i++) {
        const angle = Math.random() * Math.PI * 2
        const speed = (0.5 + Math.random() * 0.5) * nodeSpeed
        nodesRef.current.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: nodeRadius * (0.7 + Math.random() * 0.6),
          colorIntensity: 0,
        })
      }
    }

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      if (nodesRef.current.length === 0) {
        initNodes()
      } else {
        nodesRef.current.forEach((node) => {
          node.x = Math.min(node.x, width)
          node.y = Math.min(node.y, height)
        })
      }
    }
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    const draw = () => {
      const nodes = nodesRef.current
      ctx.clearRect(0, 0, width, height)

      // Update positions and color intensity
      nodes.forEach((node) => {
        node.x += node.vx
        node.y += node.vy

        if (node.x < -50) node.x = width + 50
        if (node.x > width + 50) node.x = -50
        if (node.y < -50) node.y = height + 50
        if (node.y > height + 50) node.y = -50

        if (Math.random() < 0.003) {
          node.colorIntensity = 1
        } else {
          node.colorIntensity = node.colorIntensity * 0.96
        }
      })

      // Draw connections — white lines like the website
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x
          const dy = nodes[i].y - nodes[j].y
          const distance = Math.sqrt(dx * dx + dy * dy)

          if (distance < connectionDistance) {
            const alpha = (1 - distance / connectionDistance) * 0.1
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(nodes[i].x, nodes[i].y)
            ctx.lineTo(nodes[j].x, nodes[j].y)
            ctx.stroke()
          }
        }
      }

      // Draw nodes — neutral white that spikes to cyan (#89C2D9)
      nodes.forEach((node) => {
        const intensity = node.colorIntensity
        const r = Math.round(255 + (137 - 255) * intensity)
        const g = Math.round(255 + (194 - 255) * intensity)
        const b = Math.round(255 + (217 - 255) * intensity)
        const alpha = 0.1 + intensity * 0.3

        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
        ctx.fill()
      })

      animationRef.current = requestAnimationFrame(draw)
    }

    animationRef.current = requestAnimationFrame(draw)

    return () => {
      window.removeEventListener('resize', resizeCanvas)
      cancelAnimationFrame(animationRef.current)
    }
  }, [])

  return (
    <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }} />
  )
}
