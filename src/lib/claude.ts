import Anthropic from '@anthropic-ai/sdk'
import type { Job } from '../types'
import { gapsFor, type Profile } from './requirements'

/**
 * The deeper pass, run deliberately on a handful of chosen jobs rather than on
 * the whole pool. The local axes rank the list; this writes the reasoning and
 * the letters.
 */

const MODEL = 'claude-opus-5'

const client = (apiKey: string) => new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

export type Verdict = { fit: number; verdict: string; matched: string[]; missing: string[]; unclear: string[] }

const PROFILE_BRIEF = `
Sean Joudrie — Wakefield MA. Five years of operations, program coordination,
budgets, logistics and compliance across university, retail and B2B settings,
plus a shipped self-taught software portfolio.

- Verizon Wireless, Senior Account Manager II Business, 28 months: rebuilt an
  underperforming location's pipeline and grew business-segment revenue 4.5x.
  This is the strongest line available and is habitually undersold.
- Army National Guard, Officer Candidate School pipeline through ~Aug 2027.
  Platoon Guide (selected peer leader, 58 soldiers) and unit SHARP
  representative — accountability, coordination, compliance, records, mediation.
- BA Psychology, GPA 3.7. Yale/IBM/Google certificates.
- Software: Skein (link analysis, timeline, schematic map), Palisade (10k-row
  enterprise data grid), Globalio, GPU rendering, Flexyn.
- US citizen. No clearance yet; eligible for Secret/TS and expected to hold one
  in roughly a year. "Must be able to obtain a clearance" is ALREADY MET.
- Thrives with recurring in-person contact, the same people, a defined schedule.
  Degrades in isolation. Not commission sales.
`.trim()

export async function scoreJob(job: Job, profile: Profile, apiKey: string): Promise<Verdict> {
  const gaps = gapsFor(job.requirements, profile)
    .map((g) => `- [${g.verdict}] ${g.requirement.text.slice(0, 160)} (${g.why})`)
    .join('\n')

  const res = await client(apiKey).messages.create({
    model: MODEL,
    max_tokens: 1200,
    system: `You assess job fit for one specific person. Be concrete and honest.
A low score is useful; an inflated one wastes an application. Never invent
experience the profile does not support. Treat "must be able to obtain a
clearance" as a requirement already met.

${PROFILE_BRIEF}`,
    tools: [
      {
        name: 'verdict',
        description: 'Report the fit assessment.',
        input_schema: {
          type: 'object',
          properties: {
            fit: { type: 'integer', minimum: 1, maximum: 10 },
            verdict: { type: 'string', description: 'One line. Why this score.' },
            matched: { type: 'array', items: { type: 'string' }, description: 'Specific things that line up.' },
            missing: { type: 'array', items: { type: 'string' }, description: 'Specific gaps, e.g. "wants 5 years, has 2".' },
            unclear: { type: 'array', items: { type: 'string' }, description: 'What the posting does not say.' },
          },
          required: ['fit', 'verdict', 'matched', 'missing', 'unclear'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'verdict' },
    messages: [
      {
        role: 'user',
        content: `${job.title} at ${job.company}\nLocation: ${job.locations.map((l) => l.raw).join('; ')}\n\nRequirement gaps already computed:\n${gaps || '(none extracted)'}\n\nPosting:\n${(job.descText || job.preview || '').slice(0, 14000)}`,
      },
    ],
  })

  const block = res.content.find((c) => c.type === 'tool_use')
  if (!block || block.type !== 'tool_use') throw new Error('no verdict returned')
  return block.input as Verdict
}

export async function coverLetter(job: Job, variant: 'full' | 'stripped', apiKey: string): Promise<string> {
  const res = await client(apiKey).messages.create({
    model: MODEL,
    max_tokens: 1400,
    system: `Write a cover letter for this person for this specific job.

${PROFILE_BRIEF}

Rules, in order of importance:
1. Never claim anything the profile does not support. A letter that invents
   experience is worse than no letter.
2. Lead with the Verizon result — 28 months, business-segment revenue 4.5x —
   unless this posting makes it genuinely irrelevant.
3. A clearance in progress is an asset arriving, never a gap. Say eligible and
   pending with a rough date.
4. State Guard obligations plainly and early ONLY for veteran-friendly or
   defence-adjacent employers, where it is a positive. Do not raise it elsewhere.
5. ${variant === 'stripped' ? 'This is an hourly or operations role. Do NOT mention the honour society, the certificates, or the "Senior Account Manager II" title — they read as flight risk. Sound like someone who wants this job, not someone passing through.' : 'This is a professional role. The full background applies.'}
6. Under 300 words. Plain sentences. No "I am writing to express my interest".

End with a line beginning "LEFT OUT:" naming anything true and relevant you
deliberately did not use, so it can be added by hand.`,
    messages: [
      {
        role: 'user',
        content: `${job.title} at ${job.company}\n\n${(job.descText || job.preview || '').slice(0, 12000)}`,
      },
    ],
  })
  return res.content.map((c) => (c.type === 'text' ? c.text : '')).join('').trim()
}
