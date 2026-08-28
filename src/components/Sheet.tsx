import { letterFor, resumeFor, type Contact, type Dates } from '../lib/documents'
import type { Pack } from '../lib/packs'

/**
 * A document laid out for paper.
 *
 * Deliberately not generated per job. Eight packs, eight resumes, eight
 * letters, written once — so that on a laptop the sequence is click the job,
 * click the menu, print, save, apply, with nothing to wait for and no API key
 * in the way.
 */

const Blank = ({ children }: { children: string }) => <span className="blank">{children}</span>

/** Marks the «…» blanks so they are impossible to send by accident. */
function withBlanks(text: string) {
  return text.split(/(«[^»]*»)/g).map((part, i) => (part.startsWith('«') ? <Blank key={i}>{part}</Blank> : part))
}

const Head = ({ contact }: { contact: Contact }) => (
  <>
    <h1>{contact.name || 'Your name — set it in Settings'}</h1>
    <p className="contact">
      {[contact.city, contact.phone, contact.email, contact.links].filter(Boolean).join(' · ') ||
        'City · phone · email — set these in Settings'}
    </p>
  </>
)

export function ResumeSheet({ pack, contact, dates }: { pack: Pack; contact: Contact; dates: Dates }) {
  const resume = resumeFor(pack, dates)
  return (
    <article className="sheet">
      <Head contact={contact} />
      <p style={{ marginTop: 10 }}>{resume.summary}</p>
      <h2>Experience</h2>
      {resume.roles.map((r) => (
        <div key={`${r.org}-${r.title}`}>
          <h3>{r.title}</h3>
          <p className="where">
            {withBlanks(r.org)} · {r.dates}
          </p>
          <ul>{r.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
        </div>
      ))}
      {resume.sections.map((s) => (
        <div key={s.heading}>
          <h2>{s.heading}</h2>
          {s.lines.map((l, i) => <p key={i} style={{ marginBottom: 3 }}>{l}</p>)}
        </div>
      ))}
    </article>
  )
}

export function LetterSheet({ pack, contact }: { pack: Pack; contact: Contact }) {
  return (
    <article className="sheet">
      <Head contact={contact} />
      <p style={{ marginTop: 22 }}>Dear Hiring Committee,</p>
      {letterFor(pack).split('\n\n').map((para, i) => <p key={i}>{withBlanks(para)}</p>)}
      <p style={{ marginTop: 14 }}>{contact.name || 'Your name'}</p>
    </article>
  )
}
