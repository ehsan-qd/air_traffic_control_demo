import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const papers: Record<string, string> = {
  sesar: 'SESAR_Short_paper-3 1.pdf',
  formulation:
    'Operationally_Cohesive_QUBO_Formulations_for_Real_Time_Air_Traffic_Deconfliction_Using_Probabilistic_Computing-3.pdf',
}
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const file = Object.hasOwn(papers, id) ? papers[id] : null
  if (!file) return new Response('Paper not found', { status: 404 })
  try {
    const bytes = await readFile(join(process.cwd(), 'docs', file))
    return new Response(bytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${id}.pdf"`,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch {
    return new Response('Reference paper unavailable in the local docs folder.', { status: 404 })
  }
}
