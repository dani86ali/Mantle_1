/**
 * E4 — Discovery Engine type definitions.
 * Mirrors Playbook §2 (requirements gathering) and Runtime Architecture §4.4.
 */

export type ProjectType =
  | 'campus_refresh'
  | 'greenfield_campus'
  | 'sd_wan'
  | 'dc_modernization'
  | 'wireless_deployment'
  | 'security_upgrade'
  | 'branch_rollout'
  | 'cloud_connectivity'
  | 'ot_network'
  | 'general';

export type EmphasisLevel = 'high' | 'medium' | 'low' | 'skip';

export type QuestionPriority = 'required' | 'recommended' | 'optional';

export type QuestionResponseType =
  | 'text'
  | 'number'
  | 'select'
  | 'multiselect'
  | 'table'
  | 'file';

export interface Question {
  id: string;
  text: string;
  section: string;
  priority: QuestionPriority;
  responseType: QuestionResponseType;
  options?: string[];
  helpText?: string;
}

export interface QuestionnaireSection {
  id: string;
  title: string;
  description: string;
  questions: Question[];
}

export type ResponseSource = 'structured' | 'free_text' | 'ai_interpreted';

export interface ClientResponse {
  questionId: string;
  answer: string | string[] | number | null;
  confidence?: number;
  source: ResponseSource;
}

export type BaselinePriority = 'critical' | 'high' | 'medium' | 'low';

export interface BaselineEntry {
  id: string;
  text: string;
  source: string;
  priority: BaselinePriority;
  validated: boolean;
}

/** Five-category requirements baseline per Playbook §2.3. */
export interface RequirementsBaseline {
  business: BaselineEntry[];
  functional: BaselineEntry[];
  nonFunctional: BaselineEntry[];
  constraints: BaselineEntry[];
  assumptions: BaselineEntry[];
}

export interface VagueAnswer {
  questionId: string;
  answer: string;
  reason: string;
}

export interface GapAnalysis {
  completeQuestions: string[];
  incompleteQuestions: string[];
  vagueAnswers: VagueAnswer[];
  missingCategories: string[];
}

export interface E4Config {
  projectType?: ProjectType;
  clientName: string;
  country: string;
  sector?: string;
  existingVendors?: string[];
}

/**
 * The six top-level sections from Playbook §2.4. Questions are populated
 * elsewhere — this constant fixes only the section identity and ordering.
 */
export const QUESTIONNAIRE_SECTIONS: QuestionnaireSection[] = [
  {
    id: 'A',
    title: 'Business Context',
    description:
      'Industry, scope, drivers, budget envelope, timelines, decision-makers.',
    questions: [],
  },
  {
    id: 'B',
    title: 'Current-State Network',
    description:
      'WAN, LAN, data center, wireless, security stack, management tools, pain points.',
    questions: [],
  },
  {
    id: 'C',
    title: 'Applications & Traffic',
    description:
      'Business-critical apps, SaaS adoption, voice/video, east-west DC traffic.',
    questions: [],
  },
  {
    id: 'D',
    title: 'Future-State Requirements',
    description:
      'Growth, cloud strategy, zero-trust/SASE roadmap, SLA targets.',
    questions: [],
  },
  {
    id: 'E',
    title: 'Compliance & Regulatory (MENA)',
    description:
      'Data residency (NCA ECC, PDPL, SAMA, NESA, ADHICS), sector overlays, localization, bilingual, sovereign-cloud mandates.',
    questions: [],
  },
  {
    id: 'F',
    title: 'Commercial & Delivery',
    description:
      'Preferred/excluded vendors, support contracts, payment terms, acceptance, warranty, training.',
    questions: [],
  },
];
