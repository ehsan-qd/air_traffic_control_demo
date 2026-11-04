'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import ParticleBackground from '@/components/ParticleBackground'
import SlideNavigation from '@/components/SlideNavigation'
import CompanySlide from '@/components/slides/CompanySlide'
import ProblemSlide from '@/components/slides/ProblemSlide'
import PBitNetworkSlide from '@/components/slides/PBitNetworkSlide'
import LagrangeSlide from '@/components/slides/LagrangeSlide'
import DeconflictionDemo from '@/components/DeconflictionDemo'
import {
  TitleSlide,
  ChallengeSlide,
  ObjectiveSlide,
  QuestionsSlide,
  ApproachSlide,
  ResultsSlide,
  BenefitsSlide,
  ImprovementsSlide,
  ProposalSlide,
} from '@/components/slides/NatsSlides'

const labels = [
  'Title',
  'Quantum Dice',
  'The Problem',
  'Probabilistic Computing',
  'Lagrange-0',
  'The Challenge',
  'Objective',
  'Questions',
  'ORBIT Approach',
  'Demo',
  'Results',
  'Why This Model',
  'Next Steps',
  'Proposal',
]
const DEMO = 9

export default function Presentation() {
  const [slide, setSlide] = useState(0)
  const subStep = useRef<((direction: 'next' | 'prev') => boolean) | null>(null)
  const navigate = useCallback((index: number) => {
    if (index >= 0 && index < labels.length) {
      subStep.current = null
      setSlide(index)
      window.history.replaceState(null, '', `#slide-${index + 1}`)
    }
  }, [])
  const next = useCallback(() => {
    if (!subStep.current?.('next')) navigate(slide + 1)
  }, [slide, navigate])
  const prev = useCallback(() => {
    if (!subStep.current?.('prev')) navigate(slide - 1)
  }, [slide, navigate])
  const register = useCallback((handler: (direction: 'next' | 'prev') => boolean) => {
    subStep.current = handler
  }, [])
  useEffect(() => {
    const restore = () => {
      const n = Number(window.location.hash.replace('#slide-', ''))
      if (Number.isInteger(n) && n > 0 && n <= labels.length) navigate(n - 1)
    }
    restore()
    window.addEventListener('hashchange', restore)
    return () => window.removeEventListener('hashchange', restore)
  }, [navigate])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        target.closest('input, select, textarea, button, a, [contenteditable="true"], [role="tab"]')
      )
        return
      if (['ArrowRight', 'ArrowDown', ' '].includes(event.key)) {
        event.preventDefault()
        next()
      } else if (['ArrowLeft', 'ArrowUp'].includes(event.key)) {
        event.preventDefault()
        prev()
      } else if (event.key === 'Home') {
        event.preventDefault()
        navigate(0)
      } else if (event.key === 'End') {
        event.preventDefault()
        navigate(labels.length - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev, navigate])
  const content = [
    <TitleSlide key="title" onDemo={() => navigate(DEMO)} />,
    <CompanySlide key="company" />,
    <ProblemSlide key="problem" />,
    <PBitNetworkSlide key="pbit" onSubStep={register} />,
    <LagrangeSlide key="lagrange" />,
    <ChallengeSlide key="challenge" />,
    <ObjectiveSlide key="objective" />,
    <QuestionsSlide key="questions" />,
    <ApproachSlide key="approach" />,
    <DeconflictionDemo key="demo" />,
    <ResultsSlide key="results" />,
    <BenefitsSlide key="benefits" />,
    <ImprovementsSlide key="improvements" />,
    <ProposalSlide key="proposal" />,
  ][slide]
  return (
    <div className="presentation-shell">
      <ParticleBackground />
      <SlideNavigation
        currentSlide={slide}
        totalSlides={labels.length}
        onNavigate={navigate}
        slideLabels={labels}
      />
      <main
        className={`presentation-content ${slide === DEMO ? 'demo-slide-content' : ''}`}
        key={slide}
      >
        {content}
      </main>
      <footer className="presentation-footer">
        <span>
          {slide < 5
            ? '01 / PROBABILISTIC COMPUTING'
            : slide < 9
              ? '02 / EN-ROUTE DECONFLICTION'
              : slide < 11
                ? '03 / DEMONSTRATOR & RESULTS'
                : '04 / NEXT STEPS'}
        </span>
        <nav aria-label="Slide navigation">
          <button onClick={prev} disabled={slide === 0}>
            ← Prev
          </button>
          <span>{labels[slide]}</span>
          <button onClick={next} disabled={slide === labels.length - 1}>
            Next →
          </button>
        </nav>
        <span><a href="/demonstrator">Walkthrough ↗</a> · <a href="/loop_demo">TV loop ↗</a> · <a href="/demo">Open lab ↗</a></span>
      </footer>
    </div>
  )
}
