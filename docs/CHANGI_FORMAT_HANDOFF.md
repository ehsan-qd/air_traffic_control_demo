# Changi presentation format handoff

## Agreed scope

The user clarified that this handoff supplies **formatting and reusable Changi presentation material**. The **`nats-gui` conversation owns the demonstrator's requirements, content, workflow and behaviour**. Apply the visual treatment to that implementation. This companion's route-search prototype, scenarios, controls, domain copy and 14-slide arrangement do not define requirements for the actual demonstrator.

Reuse the colour palette, typography, spacing, branding, backgrounds, component styling and relevant company/ORBIT material. Preserve the screens, interactions, data model and solver behaviour specified in the `nats-gui` conversation. Its requirements take precedence when adapting the presentation material.

The source reference is `/Users/ehsanmassah/Documents/changi_presentation`. That project was read and left unchanged. The companion presentation is implemented in this project's root `src/`; the live simulation under `backend/` and `web/` is separate and was not modified.

## Retained information and assets

The companion retains the original company introduction (Oxford origins, investors and industry examples), the motivation for probabilistic computing, the interactive p-bit explanation, and Lagrange-0/ORBIT hardware information and image. It uses the existing assets in `public/images/`. The Changi-specific challenge, score, stand-allocation demo, results and engagement content are replaced by NATS material grounded in the two supplied papers.

The reference companion preserves the original 14-slide progression: title → company → computing problem → p-bits → Lagrange-0 → domain challenge → objective → discussion → approach → interactive demo → results → benefits → next steps → proposal. This is available as a formatting example; the actual demonstrator should use the structure requested in the `nats-gui` conversation.

## Visual tokens

| Purpose                          | Changi value                     |
| -------------------------------- | -------------------------------- |
| Background                       | `#000000`                        |
| Main foreground                  | `#BCECEC`                        |
| Primary / accent                 | `#89C2D9`                        |
| Primary button text              | `#161616`                        |
| Cards                            | `#111111` at 20–50% opacity      |
| Muted text                       | `#8C8C8C`                        |
| Borders                          | `rgba(255, 255, 255, 0.12)`      |
| Headings, UI, numerical emphasis | Instrument Sans, weights 400/600 |
| Explanatory body copy            | Lora; Georgia fallback           |
| Structured technical data        | System monospace                 |

Use thin square borders, restrained cyan emphasis, generous whitespace, a dark particle network background and gradual fade-in content. The title uses Quantum Dice branding and a text treatment for NATS/Project Bluebird; no new official NATS logo was fabricated.

The working CSS is `src/app/globals.css`. Its first section preserves the original theme; the NATS section provides the presentation, cards and lab layouts. The retained generic slide components are under `src/components/slides/`. The NATS narrative is in `NatsSlides.tsx`. `ParticleBackground.tsx` and `SlideNavigation.tsx` provide the original visual shell.

## Integrating with the live simulation

The companion uses Next.js/React 19 like the Changi reference. The separate `web/` app uses Vite/React 18. Adapt the visual assets and styles to that app:

1. Map the colour tokens above into `web/src/theme/tokens.ts` and the live app stylesheet.
2. For an offline build, self-host Instrument Sans and Lora; the companion currently obtains them at build time through `next/font`.
3. Reuse `public/images/` assets. Components importing `next/image` need ordinary image elements or the Vite app's image wrapper.
4. Use the actual Python/WebSocket state for the Control Room, Inside ORBIT, Flight Deck and history. Preserve the backend's measured timings, verifier outcomes, real sampler progress and reduced-QUBO provenance.
5. Follow the screen structure and narrative agreed in the `nats-gui` conversation. Introduce presentation slides only if that conversation calls for them.

## Scope and data honesty

The root lab is a bounded, browser-only reference model over a small synthetic corridor. Its geometry, wind field and scenarios are intentionally simplified. It is labelled **Local reference model** and **SYNTHETIC SCENARIO**. It does not implement the full paper QUBO or connect to ORBIT. Its measured results must not be presented as p-bit or hardware measurements.

The Results slide shows the current local run separately from the paper's reported experimental setup. Paper links are allowlisted under `/api/papers/sesar` and `/api/papers/formulation`. Existing backend simulation and solver interfaces remain authoritative for the live implementation.

## Run and verify the companion

From the project root: `npm ci`, then `npm run dev` (port 3001). Presentation: `/`; full-screen lab: `/demo`. Checks: `npm test`, `npx tsc --noEmit`, and `npm run build`.

The root TypeScript project only includes `src/` and Next-generated types; it does not compile the separately developed Vite app.
