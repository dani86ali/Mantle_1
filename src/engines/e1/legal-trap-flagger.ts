// All 27 patterns sourced from E1_RFP_Parser_Process_Flow.md §Step4
// and RFP_Compliance_Patterns.md §5.1–5.3

export type RiskFlag = {
  category: 'disqualification' | 'discretionary' | 'breach';
  pattern: string;
  matchedText: string;
  severity: 'critical' | 'high' | 'medium';
  source: string;
};

export type ComplianceDeadline = {
  event: string;
  deadline: string;
  source: string;
};

interface PatternDef {
  name: string;
  re: RegExp;
  category: RiskFlag['category'];
  severity: RiskFlag['severity'];
}

const PATTERNS: PatternDef[] = [
  // ── Category 1: Automatic disqualification — critical (9 patterns) ──────────
  { name: 'bid-financial-guarantee', category: 'disqualification', severity: 'critical',
    re: /\b(bid\s+bond|bank\s+guarantee|performance\s+bond)\b[\s\S]{0,200}?\b(required|mandatory|shall\s+submit)\b/gi },
  { name: 'submission-deadline', category: 'disqualification', severity: 'critical',
    re: /\b(closing\s+date|submission\s+deadline|latest\s+date\s+for\s+submission)\b/gi },
  { name: 'sealed-hardcopy-format', category: 'disqualification', severity: 'critical',
    re: /\b(sealed\s+envelope|original\s+and\s+\d+\s+copies|hardcopy\s+submission)\b/gi },
  { name: 'file-format-mandate', category: 'disqualification', severity: 'critical',
    re: /\b(naming\s+convention|file\s+format|shall\s+be\s+submitted\s+in)\b/gi },
  { name: 'prequalification-eligibility', category: 'disqualification', severity: 'critical',
    re: /\b(prequalified\s+vendors\s+only|restricted\s+to|eligible\s+bidders)\b/gi },
  { name: 'declaration-requirement', category: 'disqualification', severity: 'critical',
    re: /\b(conflict\s+of\s+interest\s+declaration|anti-bribery|non-collusion)\b/gi },
  { name: 'automatic-disqualification', category: 'disqualification', severity: 'critical',
    re: /\b(automatic(?:ally)?\s+disqualif(?:ied|ication))\b/gi },
  { name: 'cause-for-disqualification', category: 'disqualification', severity: 'critical',
    re: /\b(shall\s+(?:be\s+)?(?:cause\s+for\s+)?disqualif(?:ied|ication))\b/gi },
  { name: 'result-in-disqualification', category: 'disqualification', severity: 'critical',
    re: /\b(will\s+(?:result\s+in|be\s+cause\s+for)\s+disqualification)\b/gi },

  // ── Category 2: Discretionary rejection — high (9 patterns) ─────────────────
  { name: 'incomplete-submission', category: 'discretionary', severity: 'high',
    re: /\b(incomplete\s+submission|missing\s+document|partial\s+response)\b[\s\S]{0,200}?\b(may\s+be\s+rejected|reserves\s+the\s+right)\b/gi },
  { name: 'minimum-score-threshold', category: 'discretionary', severity: 'high',
    re: /\b(minimum\s+score|threshold|passing\s+mark)\b[\s\S]{0,200}?\b(\d+%|\d+\s+points)\b/gi },
  { name: 'experience-requirement', category: 'discretionary', severity: 'high',
    re: /\b(minimum\s+\d+\s+years?\s+experience|demonstrated\s+track\s+record|similar\s+projects)\b/gi },
  { name: 'financial-requirement', category: 'discretionary', severity: 'high',
    re: /\b(annual\s+turnover|financial\s+capability|audited\s+financial\s+statements)\b/gi },
  { name: 'shall-not-be-accepted', category: 'discretionary', severity: 'high',
    re: /\b(shall\s+not\s+be\s+(?:opened|considered|accepted))\b/gi },
  { name: 'discretionary-rejection', category: 'discretionary', severity: 'high',
    re: /\b(may\s+(?:result\s+in|cause|be\s+(?:cause|grounds)\s+for)\s+(?:disqualification|rejection))\b/gi },
  { name: 'aramco-sole-discretion-reject', category: 'discretionary', severity: 'high',
    re: /\bat\s+SAUDI\s+ARAMCO'?s?\s+sole\s+discretion[\s\S]{0,100}?(?:disqualif|reject)/gi },
  { name: 'risk-disqualification', category: 'discretionary', severity: 'high',
    re: /\b(risk\s+disqualification)\b/gi },
  { name: 'may-not-be-considered', category: 'discretionary', severity: 'high',
    re: /\b(may\s+not\s+be\s+(?:opened|considered))\b/gi },

  // ── Category 3: Contract breach / termination — medium (9 patterns) ─────────
  { name: 'liquidated-damages', category: 'breach', severity: 'medium',
    re: /\b(liquidated\s+damages|penalty\s+clause|delay\s+penalty)\b[\s\S]{0,200}?\b(\d+%|SAR|USD)\b/gi },
  { name: 'termination-convenience', category: 'breach', severity: 'medium',
    re: /\b(terminate\s+for\s+convenience|without\s+cause|at\s+any\s+time)\b/gi },
  { name: 'unlimited-liability', category: 'breach', severity: 'medium',
    re: /\b(unlimited\s+liability|no\s+cap\s+on\s+liability|full\s+liability)\b/gi },
  { name: 'ip-ownership', category: 'breach', severity: 'medium',
    re: /\b(all\s+intellectual\s+property|work\s+product\s+shall\s+belong|assigns\s+all\s+rights)\b/gi },
  { name: 'insurance-requirement', category: 'breach', severity: 'medium',
    re: /\b(professional\s+indemnity\s+insurance|public\s+liability\s+insurance)\b[\s\S]{0,200}?\b(\d[\d,.]*\s*(?:million|SAR|USD)|(?:SAR|USD)\s*\d[\d,.]*)\b/gi },
  { name: 'substantial-breach', category: 'breach', severity: 'medium',
    re: /\b(substantial\s+(?:and\s+material\s+)?breach)\b/gi },
  { name: 'material-breach', category: 'breach', severity: 'medium',
    re: /\b(material\s+breach)\b/gi },
  { name: 'right-to-terminate', category: 'breach', severity: 'medium',
    re: /\b(right\s+to\s+terminate)\b/gi },
  { name: 'terminate-for-cause', category: 'breach', severity: 'medium',
    re: /\b(terminate\s+(?:this\s+)?(?:Contract|Agreement)\s+(?:for\s+cause|immediately))\b/gi },
];

// Matches DD-Mon-YYYY [at HH:MM [TZ]], YYYY-MM-DD, or DD Month YYYY
const DATE_PATTERN =
  /\d{1,2}[-/]\w{3,9}[-/]\d{4}(?:\s+at\s+\d{2}:\d{2}(?:\s+[A-Z]{2,4})?)?|\d{4}[-/]\d{2}[-/]\d{2}(?:T\d{2}:\d{2})?|\d{1,2}\s+\w{3,9}\s+\d{4}/gi;

const DEADLINE_KEYWORDS =
  /\b(closing\s+date|submission\s+deadline|bid\s+validity|validity\s+period|clarification\s+deadline|questions\s+deadline|pre-bid\s+meeting|performance\s+bond\s+submission)\b/gi;

function clip(s: string): string {
  return s.length > 200 ? s.slice(0, 200) + '…' : s;
}

export function flagLegalTraps(text: string, source: string): RiskFlag[] {
  const flags: RiskFlag[] = [];
  for (const def of PATTERNS) {
    const re = new RegExp(def.re.source, def.re.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      flags.push({
        category: def.category,
        pattern: def.name,
        matchedText: clip(m[0]),
        severity: def.severity,
        source,
      });
    }
  }
  return flags;
}

export function extractDeadlines(text: string, source: string): ComplianceDeadline[] {
  const deadlines: ComplianceDeadline[] = [];
  const kwRe = new RegExp(DEADLINE_KEYWORDS.source, DEADLINE_KEYWORDS.flags);
  let kwMatch: RegExpExecArray | null;
  while ((kwMatch = kwRe.exec(text)) !== null) {
    const event = kwMatch[0];
    const context = text.slice(kwMatch.index, kwMatch.index + 200);
    const dateRe = new RegExp(DATE_PATTERN.source, DATE_PATTERN.flags);
    const dateMatch = dateRe.exec(context);
    if (dateMatch) {
      deadlines.push({ event, deadline: dateMatch[0], source });
    }
  }
  return deadlines;
}
