'use client'

import Image from 'next/image'
import type { ReactNode } from 'react'
import { useDemo } from '@/lib/demoStore'

function Frame({
  title,
  subtitle,
  children,
  eyebrow,
}: {
  title: string
  subtitle: string
  children: ReactNode
  eyebrow?: string
}) {
  return (
    <div className="nats-slide dashboard-scroll">
      <div className="nats-slide-content">
        {eyebrow && <div className="eyebrow mb-4 animate-fade-in-up">{eyebrow}</div>}
        <h2 className="slide-title animate-fade-in-up">{title}</h2>
        <p className="slide-subtitle animate-fade-in-up-delay-1">{subtitle}</p>
        <div className="animate-fade-in-up-delay-2">{children}</div>
      </div>
    </div>
  )
}
function Card({
  number,
  title,
  children,
}: {
  number?: string
  title: string
  children: ReactNode
}) {
  return (
    <div className="research-card">
      {number && <span className="card-number">{number}</span>}
      <h3>{title}</h3>
      <div className="research-card-body">{children}</div>
    </div>
  )
}
function Source({ notes = false }: { notes?: boolean }) {
  return (
    <p className="paper-source">
      Source:{' '}
      <a
        href={notes ? '/api/papers/formulation' : '/api/papers/sesar'}
        target="_blank"
        rel="noreferrer"
      >
        {notes
          ? 'Baros · Operationally Cohesive QUBO Formulations, §§2–3'
          : 'Baros, Al-Hasso & Carvell · SESAR short paper'}{' '}
        ↗
      </a>
    </p>
  )
}

export function TitleSlide({ onDemo }: { onDemo: () => void }) {
  return (
    <div className="nats-title-slide">
      <div className="title-partners animate-fade-in-up">
        <Image
          src="/images/QuantumDiceLogoRGB transparent__white gradient.png"
          alt="Quantum Dice"
          width={300}
          height={100}
          className="h-16 w-auto"
          priority
        />
        <div className="partner-rule" />
        <div className="nats-wordmark">
          NATS<span>PROJECT BLUEBIRD</span>
        </div>
      </div>
      <div className="eyebrow animate-fade-in-up-delay-1">PROBABILISTIC AIR TRAFFIC MANAGEMENT</div>
      <h1 className="animate-fade-in-up-delay-1">
        Operationally smooth.
        <br />
        <span>Conflict free.</span>
      </h1>
      <p className="animate-fade-in-up-delay-2">
        Real-time en-route deconfliction through probabilistic computing.
        <br />
        Simple interventions. Predictable arrival schedules.
      </p>
      <div className="title-cta animate-fade-in-up-delay-3">
        <button className="primary-button" onClick={onDemo}>
          Explore the demonstrator ↗
        </button>
        <span>North Atlantic airspace · research demonstrator</span>
      </div>
      <div className="title-route-art" aria-hidden="true">
        <svg viewBox="0 0 1100 140">
          <path
            d="M0,105C300,105 300,15 570,15S820,105 1100,105"
            stroke="#89c2d9"
            fill="none"
            strokeOpacity=".2"
          />
          <path d="M0,65H1100" stroke="#89c2d9" strokeDasharray="5 8" strokeOpacity=".14" />
          <circle cx="570" cy="15" r="4" fill="#89c2d9" />
          <circle cx="570" cy="65" r="15" fill="none" stroke="#89c2d9" strokeOpacity=".15" />
        </svg>
      </div>
    </div>
  )
}

export function ChallengeSlide() {
  return (
    <Frame
      eyebrow="THE OPERATIONAL CHALLENGE"
      title="One new flight. Many downstream consequences."
      subtitle="Conflict resolution should preserve the wider operation, as well as separate aircraft."
    >
      <div className="research-grid three">
        <Card number="01" title="An always-on airspace">
          <p>
            Active flights already have agreed trajectories. Replanning the entire fleet for every
            arrival introduces unnecessary disruption.
          </p>
        </Card>
        <Card number="02" title="Simple instructions">
          <p>
            Repeated local manoeuvres can produce oscillatory routes. The model explicitly prices
            changes in lateral and vertical instructions.
          </p>
        </Card>
        <Card number="03" title="Schedule resilience">
          <p>
            Minimising total delay can concentrate disruption on individual flights. An arrival
            allowance bounds each insertion’s scheduling impact.
          </p>
        </Card>
      </div>
      <div className="wide-callout">
        <span className="eyebrow">THE INSERTION PRINCIPLE</span>
        <p>
          Hold N − 1 deconflicted flights fixed. Find the simplest feasible trajectory for the
          incoming Nth flight.
        </p>
      </div>
      <div className="constraint-strip">
        <span>Legal flight levels</span>
        <span>Spatial separation</span>
        <span>Buffered occupancy</span>
        <span>Arrival envelope</span>
        <span>Fixed endpoints</span>
      </div>
      <Source />
    </Frame>
  )
}

export function ObjectiveSlide() {
  return (
    <Frame
      eyebrow="OBJECTIVE & CONSTRAINTS"
      title="Minimise intervention. Bound the delay."
      subtitle="The primary objective is manoeuvre complexity; scheduling remains a hard feasibility condition."
    >
      <div className="formula-panel">
        <span className="eyebrow">WEIGHTED DEVIATION COMPLEXITY · p = 2</span>
        <div>
          C = Στ [<span> wθ(θτ − θτ−1)²</span> + <span>wχ(χτ − χτ−1)² </span>]
        </div>
        <p>θ = lateral deviation index · χ = flight-level deviation index</p>
      </div>
      <div className="research-grid three">
        <Card number="2" title="Lateral weight">
          <p>
            The paper’s experimental setting uses wθ = 2, reflecting a preference for level changes
            over lateral interventions.
          </p>
        </Card>
        <Card number="1" title="Vertical weight">
          <p>
            wχ = 1. A climb followed by a return to the nominal level costs 2 when each change is
            one deviation step.
          </p>
        </Card>
        <Card number="±10 min" title="Arrival allowance">
          <p>
            The experimental scheduling envelope is ±10 minutes. Early and late arrivals must remain
            inside it.
          </p>
        </Card>
      </div>
      <div className="wide-callout subtle">
        <p>
          A faster arrival does not automatically mean a better route. Compare instruction
          complexity within the permitted scheduling envelope.
        </p>
      </div>
      <Source />
    </Frame>
  )
}

export function QuestionsSlide() {
  return (
    <Frame
      title="Questions for discussion"
      subtitle="Operational decisions to agree with the NATS and Project Bluebird teams."
    >
      <div className="research-grid two">
        <Card title="Operational envelope">
          <ul>
            <li>Which airspace and traffic conditions should the pilot cover?</li>
            <li>How are permissible levels and arrival tolerances provided?</li>
            <li>When can a previously accepted trajectory be changed?</li>
          </ul>
        </Card>
        <Card title="Data & integration">
          <ul>
            <li>Which flight-plan, surveillance and weather feeds are available?</li>
            <li>What update rate and data-quality guarantees are required?</li>
            <li>Where should the insertion service sit in the planning workflow?</li>
          </ul>
        </Card>
        <Card title="Controller interaction">
          <ul>
            <li>Which manoeuvres produce useful, actionable instructions?</li>
            <li>How should infeasible corridors and alternatives be explained?</li>
            <li>What evidence should accompany a proposed resolution?</li>
          </ul>
        </Card>
        <Card title="Pilot success">
          <ul>
            <li>Which baselines and scenarios should be benchmarked?</li>
            <li>What are the runtime and validation acceptance criteria?</li>
            <li>How should software and ORBIT hardware results be compared?</li>
          </ul>
        </Card>
      </div>
    </Frame>
  )
}

export function ApproachSlide() {
  return (
    <Frame
      title="From flight plan to feasible insertion"
      subtitle="A trajectory-local formulation keeps the decision focused on the incoming flight."
    >
      <div className="research-grid four">
        <Card number="01" title="Build the corridor">
          <p>
            Enumerate lateral and vertical alternatives around the nominal waypoints. Preserve the
            requested entry and exit.
          </p>
        </Card>
        <Card number="02" title="Construct the model">
          <p>
            Precompute edge travel times and spatial conflicts. Encode path continuity, legal
            levels, arrival and separation constraints.
          </p>
        </Card>
        <Card number="03" title="Search for a route">
          <p>
            The paper solves a QUBO on ORBIT. This demonstrator uses a browser reference search over
            the bounded corridor.
          </p>
        </Card>
        <Card number="04" title="Validate & explain">
          <p>
            Check the selected route against fixed traffic. Report complexity, arrival deviation and
            waypoint instructions.
          </p>
        </Card>
      </div>
      <div className="formula-panel compact">
        <span className="eyebrow">THE PAPER’S QUBO DECOMPOSITION</span>
        <div>QN = QP + λHQH + λTQT + λOQO + λEQE + λMQM</div>
        <div className="constraint-strip">
          <span>Primary cost</span>
          <span>Legal levels</span>
          <span>Scheduling</span>
          <span>One-hot</span>
          <span>Edge continuity</span>
          <span>Deconfliction</span>
        </div>
      </div>
      <Source />
    </Frame>
  )
}

export function ResultsSlide() {
  const { result, scenario, settings } = useDemo()
  return (
    <Frame
      title="Results & evidence"
      subtitle={
        result
          ? `Local reference run · ${scenario.name}`
          : 'Run the demonstrator to populate measured local results.'
      }
    >
      {result ? (
        <>
          <div className="results-status">
            <span className={`status-dot ${result.solution ? 'success' : 'warning'}`} />
            <strong>
              {result.solution
                ? 'A feasible route was found and checked in the local model.'
                : 'No feasible route exists in the searched finite corridor.'}
            </strong>
            <span>{result.elapsedMs.toFixed(1)} ms measured</span>
          </div>
          <div className="table-scroll">
            <table className="nats-table results-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Nominal route</th>
                  <th>Reference resolution</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Conflicting active flights</td>
                  <td>{result.conflicts.length}</td>
                  <td>{result.solution ? result.remaining.length : 'No resolution'}</td>
                </tr>
                <tr>
                  <td>Weighted intervention complexity</td>
                  <td>0</td>
                  <td>{result.solution?.cost ?? '—'}</td>
                </tr>
                <tr>
                  <td>Arrival deviation</td>
                  <td>0 min</td>
                  <td>
                    {result.solution
                      ? `${result.solution.deviation.toFixed(2)} min (±${settings.schedule} allowed)`
                      : '—'}
                  </td>
                </tr>
                <tr>
                  <td>Active trajectories changed</td>
                  <td>0</td>
                  <td>0</td>
                </tr>
                <tr>
                  <td>Partial paths examined</td>
                  <td>—</td>
                  <td>{result.explored.toLocaleString()}</td>
                </tr>
                <tr>
                  <td>Time to first feasible route</td>
                  <td>—</td>
                  <td>
                    {result.firstFeasibleMs !== null
                      ? `${result.firstFeasibleMs.toFixed(1)} ms`
                      : 'Not reached'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="empty-results">
          <span className="eyebrow">YOUR MEASURED RUN</span>
          <h3>No local result yet</h3>
          <p>
            Open the Demo slide or the full-screen lab, choose a scenario, and find a resolution.
          </p>
          <a className="quiet-button" href="/demo">
            Open the lab ↗
          </a>
        </div>
      )}
      <div className="paper-results">
        <span className="eyebrow">REPORTED RESEARCH SETUP · SEPARATE FROM THIS LOCAL RUN</span>
        <div className="research-grid four">
          <Card number="63" title="Synthetic instances">
            <p>North Atlantic insertion cases in the paper’s test set.</p>
          </Card>
          <Card number="30" title="Flights per instance">
            <p>Eastbound flights with a conflicting incoming trajectory.</p>
          </Card>
          <Card number="10" title="Attempts per case">
            <p>Repeated runs to characterise stochastic solution discovery.</p>
          </Card>
          <Card number="4" title="Infeasible cases">
            <p>Exit constraints left no solution within the restricted action space.</p>
          </Card>
        </div>
        <Source />
      </div>
    </Frame>
  )
}

export function BenefitsSlide() {
  return (
    <Frame
      title="Why this formulation matters"
      subtitle="The operational model is as important as the choice of solver."
    >
      <div className="research-grid two">
        <Card number="01" title="Protect the accepted flow">
          <p>
            Sequential insertion respects first-filed, first-served operation. Existing trajectories
            remain stable while a new flight is accommodated.
          </p>
        </Card>
        <Card number="02" title="Price complexity explicitly">
          <p>
            The objective penalises changes between instructions, including oscillations. A small
            arrival delay alone does not guarantee a simple manoeuvre.
          </p>
        </Card>
        <Card number="03" title="A clear stopping condition">
          <p>
            A feasible route within the arrival envelope can be operationally useful before the best
            objective value is reached.
          </p>
        </Card>
        <Card number="04" title="A path to probabilistic hardware">
          <p>
            The QUBO representation maps decisions and paired constraints to an energy landscape,
            making the problem suitable for p-bit optimisation.
          </p>
        </Card>
      </div>
      <Source />
    </Frame>
  )
}

export function ImprovementsSlide() {
  return (
    <Frame
      title="From demonstrator to operational evidence"
      subtitle="Three extensions build on the insertion framework without hiding the current model’s limits."
    >
      <div className="research-grid three">
        <Card number="01" title="Connect the data">
          <p>
            Replace synthetic traffic and winds with agreed flight plans, forecast weather and
            aircraft performance inputs. Validate trajectory timing before comparing solvers.
          </p>
        </Card>
        <Card number="02" title="Connect ORBIT">
          <p>
            Implement the full edge-selection QUBO and solver adapter. Measure feasibility, solution
            quality, repeatability and end-to-end runtime on the same instances.
          </p>
        </Card>
        <Card number="03" title="Adapt the envelope">
          <p>
            Explore selective changes to a small number of active flights, and dynamic or asymmetric
            arrival allowances, as proposed in the paper’s future work.
          </p>
        </Card>
      </div>
      <div className="wide-callout">
        <span className="eyebrow">REVIEWABLE AT EACH STEP</span>
        <p>
          Preserve the original scenario, solver settings, selected route and validation results for
          every run.
        </p>
      </div>
      <Source />
    </Frame>
  )
}

export function ProposalSlide() {
  return (
    <Frame
      title="A staged proof of concept"
      subtitle="Proposed work packages to agree with NATS. Timing and acceptance criteria remain to be defined."
    >
      <div className="research-grid three">
        <Card number="01" title="Operational alignment">
          <p>
            Agree the insertion workflow, scenario set, permitted manoeuvres and validation
            requirements. Establish data access and representative controller cases.
          </p>
        </Card>
        <Card number="02" title="Benchmark & integrate">
          <p>
            Connect the full QUBO pipeline and ORBIT adapter. Compare measured runtimes and route
            quality against agreed reference methods on shared data.
          </p>
        </Card>
        <Card number="03" title="Evaluate in shadow mode">
          <p>
            Review recommendations alongside the existing workflow. Assess instruction usefulness,
            infeasibility handling and downstream scheduling effects.
          </p>
        </Card>
      </div>
      <div className="closing-panel">
        <Image
          src="/images/QuantumDiceLogoRGB transparent__white gradient.png"
          alt="Quantum Dice"
          width={160}
          height={50}
          className="h-10 w-auto"
        />
        <p>
          A focused insertion decision.
          <br />
          <span>A smoother air traffic network.</span>
        </p>
      </div>
      <div className="paper-links">
        <a href="/api/papers/sesar" target="_blank" rel="noreferrer">
          SESAR short paper ↗
        </a>
        <a href="/api/papers/formulation" target="_blank" rel="noreferrer">
          Formulation notes ↗
        </a>
      </div>
    </Frame>
  )
}
