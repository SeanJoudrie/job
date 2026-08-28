import type { Job } from '../types'
import { industryFor } from './industry'

/**
 * The eight kinds of job this search actually returns.
 *
 * Not a new taxonomy — a coarsening of the industry table into groups that
 * share a pitch. Two jobs belong in the same pack when the same resume and the
 * same letter would go out for both, which is a smaller question than what
 * sector they are in: a records clerk at a town hall and one at a courthouse
 * want the same letter, and a coordinator at a hospital wants a different one
 * from a coordinator at a college even though the duties look alike.
 *
 * Every industry id in the table maps to exactly one pack, and anything the
 * table could not classify falls to `office`, which is the generic
 * administrative pitch — the right default, because that is what an
 * unclassified coordinator role almost always is.
 */

export type PackId = 'education' | 'health' | 'office' | 'public' | 'creative' | 'technical' | 'mission' | 'operations'

export type Pack = {
  id: PackId
  name: string
  /** One line, shown next to the documents so it is obvious which pitch this is. */
  blurb: string
  /**
   * Which resume goes out. Only `operations` is stripped: the overqualification
   * rejections on record came from hourly employers, and a hospital coordinator
   * or a town clerk is not one of those.
   */
  variant: 'full' | 'stripped'
  industries: string[]
}

export const PACKS: Pack[] = [
  {
    id: 'education',
    name: 'Higher education & schools',
    blurb: 'Colleges, universities, K-12 districts. Student affairs, admissions, department administration.',
    variant: 'full',
    industries: ['higher_education_admin', 'k12_school_district_nonteaching', 'academic_teaching'],
  },
  {
    id: 'health',
    name: 'Healthcare administration',
    blurb: 'Hospital systems. Patient access, scheduling, medical records, department coordination. Not clinical.',
    variant: 'full',
    industries: ['hospitals_health_admin'],
  },
  {
    id: 'office',
    name: 'Office & operations',
    blurb: 'The generic administrative pitch. Coordinators, executive assistants, HR and legal support, anywhere.',
    variant: 'full',
    industries: ['unclassified', 'hr_recruiting_coordination', 'legal_assistant_paralegal', 'hospitality_hotel_ops'],
  },
  {
    id: 'public',
    name: 'Public institutions & records',
    blurb: 'Town and state government, courts, libraries, museums, archives. Records, compliance, the public counter.',
    variant: 'full',
    industries: [
      'municipal_town_government', 'state_agency', 'federal_agency', 'courts_judicial_admin',
      'public_library', 'museums_cultural_institutions', 'archives_records_management',
    ],
  },
  {
    id: 'creative',
    name: 'Creative & communications',
    blurb: 'Media, publishing, editorial, design, video, events and AV, marketing operations. The writing pitch.',
    variant: 'full',
    industries: [
      'media_creative_production', 'publishing_editorial', 'graphic_design',
      'video_content_production', 'event_production_av', 'marketing_operations_nonsales',
    ],
  },
  {
    id: 'technical',
    name: 'IT, data & technical support',
    blurb: 'Helpdesk, service desk, QA, junior analysis. Strongest at a non-technology employer.',
    variant: 'full',
    industries: ['it_helpdesk_support', 'qa_testing', 'data_analysis', 'software_development'],
  },
  {
    id: 'mission',
    name: 'Mission & nonprofit',
    blurb: 'Nonprofits, faith-based organisations, social services, conservation, veterans services.',
    variant: 'full',
    industries: ['faith_based_nonprofits', 'social_services_case_mgmt', 'conservation_land_trusts', 'veterans_services', 'state_parks_dcr', 'environmental_field_work'],
  },
  {
    id: 'operations',
    name: 'Facilities, warehouse & logistics',
    blurb: 'Custodial, facilities, warehouse, receiving, grounds, delivery. The stripped resume goes with these.',
    variant: 'stripped',
    industries: ['facilities_maintenance', 'custodial', 'warehouse_distribution', 'postal_service', 'moving_delivery', 'groundskeeping_landscaping'],
  },
]

const BY_INDUSTRY = new Map<string, Pack>()
for (const p of PACKS) for (const i of p.industries) BY_INDUSTRY.set(i, p)

export const packById = (id: string): Pack | undefined => PACKS.find((p) => p.id === id)

/** The fallback. An unclassified role is an administrative one far more often than not. */
export const DEFAULT_PACK = PACKS.find((p) => p.id === 'office')!

export function packFor(job: Job, now: Date = new Date()): Pack {
  return BY_INDUSTRY.get(industryFor(job, now).id) ?? DEFAULT_PACK
}
