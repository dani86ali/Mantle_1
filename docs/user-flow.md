# BOMatic — User Flows

## Flow 1: Tenant onboarding (10-state machine)

```
Sales-qualified lead → contract signed
  │
  State 1: LEAD
  │
  ├─ Tenant names their Cisco admin (Delegated Administrator or equivalent)
  │   State 2: CISCO_ADMIN_IDENTIFIED
  │
  ├─ Admin confirms CCO ID with partner-level access
  │   State 3: CCO_ID_VERIFIED
  │
  ├─ Admin grants "Commerce APIs" / "CCW Web Services" entitlement via SAMT
  │   (cdcea.cloudapps.cisco.com/SAMT)
  │   State 4: SAMT_ENTITLEMENT_GRANTED
  │
  ├─ Admin registers application at apiconsole.cisco.com
  │   (My Apps & Keys → Register a New App)
  │   State 5: APP_REGISTERED
  │
  ├─ System runs Hello API validation exercise
  │   State 6: HELLO_API_PASSED
  │
  ├─ Per-API access requests submitted
  │   (Catalog, Estimate, Customer Registry + POE variants)
  │   State 7: API_ACCESS_REQUESTED
  │
  ├─ Cisco approves all requested APIs in PROD
  │   State 8: API_ACCESS_GRANTED
  │
  ├─ CCO username, password, Client ID, Client Secret loaded into Secrets Manager
  │   (KMS-wrapped, per-tenant scoped)
  │   State 9: CREDS_LOADED
  │
  ├─ First successful production API call validated
  │   State 10: STAGING_VALIDATED
  │
  └─ LIVE — production traffic enabled

SLA tracking:
  - Each state has a target duration
  - If a state stalls beyond target (e.g., API_ACCESS_REQUESTED > 7 business days),
    alert fires to follow up with partner-integrations@cisco.com
  - System generates email templates for each Cisco interaction
  - Mock-Cisco-API mode available during onboarding wait (Phase 2)
    so engineers can see the product before credentials are live
```

### Post-onboarding configuration (optional)
```
Admin configures tenant standards (or accepts sensible defaults):
  ├─ Approved product families
  ├─ Preferred license tier (Network Essentials / Advantage, DNA level)
  ├─ Default support term (SmartNet level)
  ├─ Region restrictions
  ├─ Approved alternates for EoX/unavailable SKUs
  ├─ Engineering rules (e.g., always include redundant PSU)
  ├─ Branding: logo, primary color, subdomain
  └─ Price list: Global Price List Emerging (USD) as default
```

---

## Flow 2: Intake — Path A (BoM provided)

```
User opens intake portal → "I have a BoM"
  │
  ├─ Upload file (CSV, XLSX, PDF) or paste SKU list
  ├─ OR paste customer email → Haiku extracts fields → proposes values for confirmation
  │
  ├─ Fill / confirm required fields:
  │   ├─ Customer name (autocomplete via Customer Registry API)
  │   ├─ Region / country
  │   ├─ Domain (auto-detected from SKUs, or manual select)
  │   ├─ License tier preference (or use tenant default)
  │   ├─ Support term (or use tenant default)
  │   └─ Constraints or notes (free text)
  │
  ├─ Submit → confirmation: "Your request has been received"
  │
  └─ Behind the scenes:
      ├─ Intake record saved to database (status: PENDING)
      ├─ Uploaded file stored
      ├─ Background job queued for agent processing
      └─ No Cisco API calls yet — those happen in the agent flow
```

---

## Flow 3: Intake — Path B (requirements only)

```
User opens intake portal → "I need a configuration"
  │
  ├─ Fill structured form:
  │   ├─ Customer name
  │   ├─ Region / country
  │   ├─ Domain: Access Switching / Wireless / Both
  │   ├─ Key needs (free text)
  │   │   Example: "48-port PoE+ switches for 3 floors, 12 APs per floor,
  │   │            redundant power, stacking, DNA Advantage, 3yr SmartNet"
  │   ├─ Quantities / ports / capacity
  │   ├─ PoE requirements (yes/no, class if known)
  │   ├─ Redundancy / stacking (yes/no)
  │   ├─ License tier preference (or use tenant default)
  │   ├─ Support term (or use tenant default)
  │   └─ Constraints (approved models list, country limits)
  │
  ├─ OR paste customer email → Haiku extraction → field proposals
  │
  ├─ Submit → confirmation
  │
  └─ Same backend flow as Path A
```

---

## Flow 4: Intake — Email (Phase 2)

```
Customer or account manager sends email to tenant's monitored mailbox
  (e.g., presales-bot@company.com)
  │
  ├─ Email Intake Service receives notification
  │   (Microsoft Graph webhook for M365, IMAP IDLE for Google Workspace)
  │
  ├─ Service fetches email body + attachments
  │   ├─ Body parsed (email-reply-parser strips quoted history)
  │   ├─ Attachments extracted (pdf-parse, sheetjs, mammoth)
  │   └─ Raw email + attachments archived to S3
  │
  ├─ Haiku called to populate intake fields from unstructured email body
  │
  ├─ Sender cross-referenced against tenant's known customer list
  │   ├─ Known sender → auto-populate customer name
  │   └─ Unknown sender → flag for engineer triage before processing
  │
  ├─ Intake record created (identical shape to UI form submission)
  │
  └─ Edge cases:
      ├─ Email too vague → flag "insufficient information", notify engineer
      ├─ Attached BoM is corrupt → proceed with email body only, notify engineer
      └─ Non-Cisco content → flag for manual review
```

---

## Flow 5: Agent processing (autonomous, no human in the loop)

```
Agent picks up job from queue
  │
  ├─ Step A: Parse intake
  │   ├─ If BoM uploaded: Haiku extracts SKU rows into structured JSON
  │   ├─ If email pasted: Haiku extracts fields (same as email intake)
  │   ├─ Normalize free-text fields via Haiku
  │   ├─ Validate customer name via Customer Registry API searchCustomer
  │   └─ If customer not found: flag for engineer (do NOT auto-create)
  │
  ├─ Step B: SKU suggestions
  │   ├─ If Path A (BoM provided):
  │   │   ├─ Haiku normalizes uploaded SKUs, reconciles against intake requirements
  │   │   ├─ Look up each SKU via Catalog API getItem (price, EoX, region, specs)
  │   │   ├─ Find required service attachments via getMappedServices
  │   │   └─ Flag gaps (missing licenses, missing services, EoX items)
  │   │
  │   └─ If Path B (requirements only):
  │       ├─ (Phase 2) RAG retrieval over CVDs filtered by domain × scale × constraints
  │       ├─ Sonnet designs candidate BoM from requirements + Catalog data
  │       │   (product selection → SKU identification → options → licenses → services)
  │       ├─ Look up each proposed SKU via Catalog API getItem
  │       ├─ Find required service attachments via getMappedServices
  │       └─ Prefer bundles over standalone SKUs
  │
  ├─ Step C: Validation
  │   ├─ Run all 9 deterministic rules against candidate BoM
  │   ├─ (Phase 2) Call Prepare Configuration validateConfig for authoritative Cisco validation
  │   ├─ If errors found:
  │   │   ├─ Look up substitution candidates via Catalog API
  │   │   ├─ Sonnet proposes fixes grounded in validation errors
  │   │   ├─ Re-run validation (max 3 fix iterations)
  │   │   └─ If still failing after 3 iterations: flag for engineer with explanation
  │   └─ Produce validation report: per-rule pass/fail/warning
  │
  ├─ Step D: Estimate creation
  │   ├─ Call Estimate API createEstimate with validated BoM
  │   ├─ Receive Estimate ID + CCW URL
  │   ├─ (Phase 2) Call Quote API acquireQuote if deal-based pricing detected
  │   └─ Store in database
  │
  ├─ Step E: Summary generation
  │   ├─ Sonnet generates engineer-facing summary:
  │   │   ├─ Assumptions made
  │   │   ├─ Items excluded and why
  │   │   ├─ Open questions for the customer
  │   │   └─ Validation warnings (if any passed with warnings)
  │   └─ Status: READY_FOR_REVIEW
  │
  ├─ Step F: Quote-path detection
  │   ├─ Scan intake for signals: RFP, RFQ, competing vendor, phased rollout, special pricing
  │   ├─ If detected: attach quote-path advisory to the review
  │   └─ Advisory: why this is a quote scenario + step-by-step CCW quick quote instructions
  │
  └─ Notify engineer: new BoM ready for review (SSE push in Phase 2)
```

---

## Flow 6: Engineer review

```
Engineer opens review console → sees queue of completed BoMs
  │
  ├─ Click a BoM → review view opens
  │
  ├─ Top section:
  │   ├─ Customer name, region, intake summary
  │   ├─ Agent summary (assumptions, exclusions, open questions)
  │   ├─ Quote-path advisory (if applicable)
  │   └─ Overall validation status (pass / warnings / errors)
  │
  ├─ Main section: line-by-line BoM table
  │   ├─ Each line: SKU, description, qty, unit price, validation status
  │   ├─ If Path A: diff column showing original BoM vs proposed
  │   ├─ Validation flags per line (hover/click for details)
  │   ├─ Per-line actions: Accept ✓ | Edit ✎ | Reject ✗
  │   └─ Per-line comment field
  │
  ├─ Engineer actions:
  │   │
  │   ├─ Edit a line → triggers partial re-run:
  │   │   ├─ New/changed SKUs looked up via Catalog API
  │   │   ├─ Validation re-runs on edited BoM
  │   │   ├─ Estimate updated in CCW via updateEstimate
  │   │   └─ Updated view shown to engineer
  │   │
  │   ├─ Accept all → BoM approved
  │   │   ├─ Final Estimate ID + CCW URL displayed prominently
  │   │   ├─ "Open in CCW" button
  │   │   ├─ "Download CSV" button
  │   │   ├─ (Phase 3) "Push to CRM" button
  │   │   ├─ (Phase 2) "Send to Customer" button
  │   │   └─ Status: APPROVED
  │   │
  │   ├─ Save for later → review state persisted, return anytime
  │   │
  │   └─ Reject → request clarification from customer
  │       ├─ Engineer writes clarification note
  │       └─ Status: NEEDS_CLARIFICATION
  │
  └─ Version history: every edit creates a version, compare previous versions
```

---

## Flow 7: Send to customer (Phase 2)

```
Engineer clicks "Send to Customer"
  │
  ├─ System drafts email via Haiku:
  │   ├─ Uses tenant-configured email template
  │   ├─ Body generated from agent summary
  │   ├─ BoM attached as PDF (server-side rendered) + CSV
  │   ├─ CCW URL embedded in body
  │   └─ Recipient pre-filled from intake customer contact
  │
  ├─ Engineer reviews and edits the draft
  │
  ├─ Engineer clicks "Send"
  │   ├─ Email sent via tenant's own SMTP (Microsoft Graph or Gmail API)
  │   ├─ Customer sees email from SI's domain, not ours
  │   └─ Audit log: send event with timestamp, recipient, content hash
  │
  └─ Fallback: if tenant SMTP unavailable → mailto: link with pre-filled body
```

---

## Flow 8: Export

```
Engineer clicks "Approve" or "Export"
  │
  ├─ CCW Estimate (already created in agent Step D)
  │   ├─ Estimate ID displayed
  │   ├─ CCW URL displayed (clickable, opens in new tab)
  │   └─ Engineer verifies in CCW
  │
  ├─ CSV download
  │   ├─ Matches Price Estimate template format:
  │   │   Header: customer name, address, date, Estimate ID, Deal ID, Price List
  │   │   Lines: Part Number, Smart Account Mandatory, Description,
  │   │          Service Duration, Lead Time, Unit List Price, Pricing Term,
  │   │          Qty, Unit Net Price, Disc%, Extended Net Price
  │   │   Footer: Product Total, Service Total, Subscription Total, Total Price
  │   └─ Validation summary + agent assumptions included
  │
  ├─ (Phase 3) CRM/CPQ write-back
  │   ├─ Push BoM to ConnectWise / Salesforce / QuoteWerks via per-tenant integration
  │   └─ Triggered by explicit engineer click — never auto-pushed
  │
  └─ Audit log entry: export event with timestamp, engineer ID, BoM snapshot
```

---

## Error and edge case handling

| Scenario | Behavior |
|---|---|
| Cisco API transient error | Retry with exponential backoff (max 3 attempts, initial 1s). If still failing, mark AGENT_ERROR with details. |
| Cisco API outage (full) | Agent creates draft BoM from cached Catalog data where available. Flags BoM as "unvalidated — Cisco APIs unavailable." Engineer sees warning. Estimate write-back queued for retry when APIs recover. |
| Uploaded BoM unparseable | Haiku attempts extraction. If fails, mark PARSE_ERROR, show engineer raw content. |
| SKU not found in Catalog | Flag per-line. If >50% not found, flag entire BoM for manual review. |
| All SKUs are EoX | Flag every line. Agent attempts substitution suggestions. Engineer decides. |
| Customer not found in registry | Flag for engineer. Do NOT auto-create customers. |
| Cisco credentials expired/invalid | Tenant-level error. Admin notified to update credentials. All pending jobs paused. |
| Agent fix loop exhausted (3 iterations) | Pass to engineer with partial validation. Show what passed, what failed, why. |
| Intake too vague for BoM | Flag "insufficient information." Engineer notified with original intake for triage. |
| Quote-path signals detected | Agent still creates the estimate. Advisory attached to review. |
| Anthropic API outage | Steps A–D degrade: cached Catalog + deterministic validation continue. Summary (Step E) queues for retry. Engineer notified of LLM dependency. |
