import Anthropic from '@anthropic-ai/sdk'
import type { Job } from '../types'
import { gapsFor, type Gap, type Profile } from './requirements'

/**
 * The deeper pass, run deliberately on a handful of chosen jobs rather than on
 * the whole pool. The local axes rank the list; this writes the reasoning and
 * the letters.
 */

const MODEL = 'claude-opus-5'

const client = (apiKey: string) => new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

export type Verdict = { fit: number; verdict: string; matched: string[]; missing: string[]; unclear: string[] }

const PROFILE_BRIEF = `
Sean Joudrie — Wakefield MA. Operations, program coordination, budgets,
logistics and compliance across university, retail and B2B settings, plus a
shipped self-taught software portfolio.

Verified and resume-supported:
- Verizon Wireless, Senior Account Manager II Business, 28 months: grew
  business-segment revenue 4.5x year over year. This is the strongest single
  line available. He habitually under-narrates it as a failure; do not.
- Army National Guard, Officer Candidate. Platoon Guide — selected senior peer
  leader over a 58-soldier platoon within a 220-person company. Unit SHARP
  representative and barracks operations representative: compliance, records,
  reporting.
- BA Psychology, SNHU, 3.7 GPA, President's List 2021-2023, Order of Omega,
  Business Analytics minor. SGA Head Senator on Budget & Finance; Phi Delta
  Theta VP; Math Club VP.
- SNHU Office of Student Involvement, operations supervisor — direct higher
  education administration experience.
- Certificates: Yale (Financial Markets with Honors, Connected Leadership,
  Narrative Economics, American Contract Law, Global Financial Crisis), IBM
  (Project Management, Data Analytics), Google (Digital Marketing).
- Software, self-taught with AI-assisted tools: four shipped applications.
  Not traditional language fluency. Strongest as the most technically capable
  person in a non-technology building.

Worth surfacing, harder to evidence:
- Enters new environments and becomes useful inside a week — ten homes, three
  schools, a university, a military unit.
- Reads organisational systems quickly and works well inside them.
- De-escalation and conflict resolution; people bring him problems.
- Strong writer. Exceptional recall for detail.

Facts a letter may state:
- US citizen. No clearance yet; eligible, commissions as 2LT around August 2027
  and will hold one then. "Must be able to obtain a clearance" is ALREADY MET.
- One drill weekend a month plus annual training. Drill dates are known well in
  advance but do not fall on a fixed recurring calendar date. USERRA applies.
- Spotless driving record, reliable personal vehicle, immediately available.
- Thrives with recurring in-person contact, the same people, a defined
  schedule. Degrades in isolation. Not commission sales.
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

/**
 * What the app already knows about this job, handed to the letter.
 *
 * It used to send the raw posting and nothing else, which threw away every
 * answer the local pass had already worked out. The gaps matter most: a letter
 * that names the soft requirement and says why it is met — "or equivalent
 * experience", five years of operations — beats one that hopes nobody notices.
 */
export type LetterBrief = {
  variant: 'full' | 'stripped'
  gaps: Gap[]
  industry: string
}

export async function coverLetter(job: Job, brief: LetterBrief, apiKey: string): Promise<string> {
  const { variant } = brief
  const met = brief.gaps.filter((g) => g.verdict === 'matched')
  const soft = brief.gaps.filter((g) => g.verdict === 'soft-gap')
  const hard = brief.gaps.filter((g) => g.verdict === 'hard-gap')
  const list = (gs: Gap[]) => gs.map((g) => `- ${g.requirement.text.slice(0, 150)} (${g.why})`).join('\n')

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
   Where it is raised, frame it proactively: dates known well in advance, USERRA.
5. ${variant === 'stripped' ? 'Hourly or operations role — the stripped variant. Do NOT mention Order of Omega, the Yale certificates, or the "Senior Account Manager II" title. He is currently being rejected as overqualified by hourly employers, and those three credentials are what read as flight risk. Reframe Verizon as plain work history. Lead instead on reliability, physical capability, military service, clean record and immediate availability. Sound like someone who wants this job, not someone passing through.' : 'Professional or institutional role — the full variant. The whole background applies, credentials included.'}
6. Under 300 words. Plain sentences. No "I am writing to express my interest".
7. This is ${brief.industry} work. Sound like someone who wants to work in it,
   not like someone sending the same letter everywhere.
8. The requirement gaps below are already worked out. Address the SOFT ones
   directly and briefly — those are the doors, and reading them as walls is the
   documented habit this whole tool exists to break. Do not draw attention to a
   hard gap; do not pretend it is met either.

End with a line beginning "LEFT OUT:" naming anything true and relevant you
deliberately did not use, so it can be added by hand.`,
    messages: [
      {
        role: 'user',
        content: [
          `${job.title} at ${job.company}`,
          met.length ? `\nRequirements already met:\n${list(met)}` : '',
          soft.length ? `\nSoft requirements — address these:\n${list(soft)}` : '',
          hard.length ? `\nHard gaps — do not raise these:\n${list(hard)}` : '',
          `\nPosting:\n${(job.descText || job.preview || '').slice(0, 12000)}`,
        ].filter(Boolean).join('\n'),
      },
    ],
  })
  return res.content.map((c) => (c.type === 'text' ? c.text : '')).join('').trim()
}
