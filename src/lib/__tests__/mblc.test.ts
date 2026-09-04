import { describe, expect, it } from 'vitest'
import { mblcDate, mblcPlace, mblcSalary, mblcSector, parseMblcRows } from '../../../scripts/sources'

/** A row as the board actually serves it, two hidden columns and all. */
const ROW = `
<tr style="vertical-align: top;">
	<td data-title="Job ID">24568</td>
	<td data-title="Title"><a class="joblink" href="/jobs/find_jobs/display_jobs.php?job_id=24568">Young Adult Librarian</a></td>
	<td data-title="City/Town">Narragansett, RI</td>
	<td data-title="Region">Out-of-State</td>
	<td data-title="Institution">Maury Loontjens Memorial Library</td>
	<td data-title="Library Type">Public</td>
	<td style="white-space: nowrap;" data-title="Date Posted">09/04/26</td>
	<td data-title="Job Type">Full Time</td>
	<td data-title="Education">MLS/Masters</td>
</tr>`

describe('reading the board’s table', () => {
  it('pulls every column off its own name', () => {
    const [row] = parseMblcRows(ROW)
    expect(row).toEqual({
      id: '24568',
      title: 'Young Adult Librarian',
      town: 'Narragansett, RI',
      institution: 'Maury Loontjens Memorial Library',
      libraryType: 'Public',
      posted: '09/04/26',
      jobType: 'Full Time',
      education: 'MLS/Masters',
    })
  })

  it('reads by name, not by position, so a hidden column cannot shift the fields', () => {
    // Region and Job ID are marked `never` on the real board. Drop them and the
    // rest must still land in the right places.
    const trimmed = ROW.replace(/<td data-title="Region">[^<]*<\/td>/, '').replace(/<td data-title="Job ID">[^<]*<\/td>/, '')
    const [row] = parseMblcRows(trimmed)
    expect(row.town).toBe('Narragansett, RI')
    expect(row.education).toBe('MLS/Masters')
  })

  it('strips the stray punctuation a hand-typed title arrives with', () => {
    const [row] = parseMblcRows(ROW.replace('>Young Adult Librarian<', '>: Archives and Records Management Assistant<'))
    expect(row.title).toBe('Archives and Records Management Assistant')
  })

  it('skips the header row rather than emitting a blank job', () => {
    expect(parseMblcRows('<tr><th>Title</th><th>City/Town</th></tr>')).toEqual([])
  })

  it('decodes the entities a library name is full of', () => {
    const [row] = parseMblcRows(ROW.replace('Maury Loontjens Memorial Library', 'Jones &amp; Sons Library'))
    expect(row.institution).toBe('Jones & Sons Library')
  })
})

/**
 * The town column has no state on it, because the board is the Massachusetts
 * one. A gazetteer does not know that, and the scan drops what it cannot place
 * — so without this every one of these was fetched, parsed and thrown away.
 */
describe('placing a bare town', () => {
  it('adds the state the board leaves unsaid', () => {
    expect(mblcPlace('Northbridge')).toBe('Northbridge, MA')
    expect(mblcPlace('  Webster ')).toBe('Webster, MA')
  })

  it('leaves an out-of-state posting exactly as written', () => {
    expect(mblcPlace('Narragansett, RI')).toBe('Narragansett, RI')
    expect(mblcPlace('Manchester, NH')).toBe('Manchester, NH')
  })

  it('does not invent a place out of nothing', () => {
    expect(mblcPlace('')).toBe('')
    expect(mblcPlace('   ')).toBe('')
  })
})

describe('what kind of employer a library is', () => {
  it('never calls one federal, which would hand it veterans’ preference it has not earned', () => {
    for (const t of ['Public', 'School', 'public library']) expect(mblcSector(t)).toBe('municipal')
  })

  it('reads an academic library as the university it belongs to', () => {
    expect(mblcSector('Academic')).toBe('university')
  })

  it('reads a special library as a nonprofit', () => {
    expect(mblcSector('Special')).toBe('nonprofit')
  })
})

describe('the salary, which this board states outright', () => {
  const page = (salary: string) =>
    `<h4>Education</h4><p>MLS/Masters</p><h4>Salary</h4> ${salary} </p><h4>Closing Date</h4><p>September 27, 2026</p>`

  it('takes it from under its own heading, unit and all', () => {
    expect(mblcSalary(page('$21.00 &nbsp;/ hour'))).toMatch(/\$21\.00\s*\/?\s*hour/)
  })

  it('stops at the next heading rather than swallowing the closing date', () => {
    expect(mblcSalary(page('$21.00 / hour'))).not.toMatch(/September/)
  })

  it('says nothing when the board says nothing', () => {
    expect(mblcSalary('<h4>Education</h4><p>NA</p>')).toBe('')
  })
})

describe('the posted date', () => {
  it('reads the board’s two-digit year as this century', () => {
    expect(mblcDate('09/04/26')).toBe('2026-09-04')
  })

  it('returns null on anything else rather than a wrong date', () => {
    expect(mblcDate('September 4')).toBeNull()
    expect(mblcDate('')).toBeNull()
  })
})
