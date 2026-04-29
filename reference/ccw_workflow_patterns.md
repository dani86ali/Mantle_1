# CCW Workflow Patterns — Extracted from Cisco Engineer Transcripts

**Purpose:** Structured reference for building the presales AI agent. Contains the actual CCW mechanics — how engineers navigate the system, make decisions, and complete workflows. Extracted from three YouTube tutorial transcripts by Cisco engineers.

**Sources:**
- Joshua Scarborough (Cisco Security SE) — building a Firepower 2120 estimate
- CDW distribution walkthrough — registering a Meraki deal in CCW
- Insight walkthrough — creating a quick quote in CCW

**Scope:** Domain-agnostic CCW mechanics. The Firepower and Meraki examples are illustrative — the patterns apply across all Cisco product families.

---

## 1. Estimate creation workflow

This is the core workflow our agent automates. Every estimate follows these steps regardless of product domain.

### 1.1 SKU discovery

**Method 1 — Direct search:**
- Engineer types a product name or partial SKU into the CCW catalog search bar
- Example: typing "firepower 2120" returns multiple SKU variants
- Results include: standalone SKUs, bundles, HA bundles, ASA vs FTD variants
- The engineer must know which variant they need before selecting

**Method 2 — Recommended Content (highest-value tip from transcripts):**
- After adding any SKU to an estimate, clicking "Recommended Content" opens a sidebar
- Sidebar contains: ordering guides, validation requirements, additional required SKUs, design assistance links
- The ordering guide is the single source of truth for all SKUs in a product family
- This is described as the "#1 tip for using CCW effectively"

**Method 3 — Ordering guide navigation:**
- Ordering guides are organized by product family and series
- They contain every SKU, bundle option, licensing requirement, and net-mod availability
- SKUs are NOT on data sheets — they're consolidated into ordering guides
- Engineers use data sheets to pick the right product, then ordering guides to find the right SKU

**Implication for agent:** The agent's SKU suggestion logic should mirror this pattern: use Catalog API to search, then cross-reference with ordering guide data (via Recommended Content / Catalog getMappedServices) to find required accessories, licenses, and service attachments.

### 1.2 Bundle vs standalone SKU selection

This is a critical decision point the agent must handle.

**Bundles:**
- "Master bundles" include the hardware base + slots for software and licensing choices
- Bundle SKUs embed the licensing and subscription selection into one configuration flow
- HA (High Availability) bundles automatically add two devices
- Bundles are the recommended path for most configurations — they ensure completeness

**Standalone SKUs:**
- Individual hardware SKU (e.g., FPR-2120-NGFW-K9)
- Requires manual addition of licensing, services, and accessories as separate line items
- Used when the engineer needs granular control or when only specific components are needed

**Naming convention pattern:**
- SKU naming is consistent across product families
- Base hardware: `[FAMILY]-[MODEL]-[SOFTWARE_TYPE]-K9`
- ASA variant vs NGFW variant vs FTD variant — dictates which base software ships
- Bundles append `-BUN` or similar suffix

**Implication for agent:** When proposing a BoM, default to bundles where available — they reduce configuration errors. Only propose standalone SKUs when the intake specifically requires granular control or partial configurations.

### 1.3 Option selection (within a bundle or SKU)

After adding a SKU to the estimate, the engineer clicks "Select Options" or "Edit Options":

**Hardware options:**
- Power cable type (region-specific — e.g., North American power cables)
- SFP/transceiver modules
- Net-mod bays (if available for that chassis)
- Rack mount brackets / cable management
- Redundant power supplies

**Software options:**
- Base software image selection (e.g., ASA code vs FTD code)
- Software generation/version

**Subscription options:**
- Accessed via the "Subscriptions" section within the bundle
- License tiers are selectable (e.g., Threat only, Threat+Malware, Threat+Malware+URL)
- License term selection (1yr, 3yr, 5yr, 7yr)
- Each license tier has a distinct SKU

**Implication for agent:** The agent must handle option selection per SKU. For Phase 1 (Access Switching + Wireless), the typical options are: power cable region, optics/transceivers, stacking cables, license tier (Network Essentials vs Network Advantage), and support term (SmartNet). The agent should propose defaults based on intake region and requirements, flagging any that need engineer confirmation.

### 1.4 Licensing patterns

Licensing varies by product family but follows consistent structural patterns:

**Smart Licensing:**
- All modern Cisco products use Smart Licensing
- Requires a Smart Account for registration
- License is tied to the device, managed via Cisco Smart Account portal

**Subscription tiers (Firepower example — pattern applies broadly):**
- Licenses are modular and combinable
- Can be sold individually or as a combined SKU (e.g., TMC = Threat + Malware + Content/URL)
- A "base" license is strongly recommended (provides day-zero protection updates)
- Additional tiers add specific capabilities (file scanning, URL categorization, etc.)
- Term-based: typically 1, 3, 5, or 7 year options

**For Access Switching (Phase 1 relevant):**
- Network Essentials vs Network Advantage tiers
- DNA Essentials vs DNA Advantage
- Term-based subscriptions

**Implication for agent:** License selection should be driven by intake requirements. Default to the base/recommended tier unless intake specifies otherwise. Always attach a license — a configuration without licensing is almost always an error.

### 1.5 Service attachment

**SmartNet / support contracts:**
- Added as line items associated with hardware
- Different service levels available (8x5xNBD, 24x7x4, etc.)
- Term aligns with licensing term in most cases

**Management appliances (where applicable):**
- Some product families require a separate management platform
- Example: Firepower Management Center (FMC) for managing multiple FTD devices
- Options: on-box management (free, ships with device), cloud-based (CDO), or dedicated hardware/virtual appliance
- Management selection depends on: number of devices, reporting depth needed, deployment model

**Implication for agent:** The Catalog API's `getMappedServices` call returns required service attachments per hardware SKU. The agent should always call this and include required services in the BoM. The agent should flag when a management platform decision is needed (especially relevant for future Security domain support).

### 1.6 Estimate validation and export

Once all items are added and options selected:

- CCW validates the configuration at the box level
- Validation checks: required options selected, compatible components, complete configuration
- Engineer can share the estimate (generates Estimate ID + access key)
- Engineer can export to CSV/Excel
- Estimate can be imported into a deal or quote later

**Implication for agent:** After assembling the BoM, the agent should call the Estimate API to create a draft in CCW. The returned Estimate ID and CCW URL are the primary deliverables to the engineer. The engineer opens the URL to verify, adjust, and proceed.

---

## 2. Data sheet → ordering guide → CCW pipeline

This is how experienced Cisco engineers work. The agent should mirror this reasoning chain.

### 2.1 Step 1 — Data sheets for product selection

- Data sheets provide performance specs: throughput, session counts, interface counts, PoE budgets, stacking capabilities
- Engineers use data sheets to match customer requirements to the right product model
- Data sheets do NOT contain SKUs — this is intentional, Cisco consolidates SKUs in ordering guides
- Finding data sheets: Google search for "[product family] data sheet" is the standard approach

### 2.2 Step 2 — Ordering guides for SKU identification

- Ordering guides are the single source of truth for all SKUs in a product family
- They contain: every hardware SKU, every bundle option, every license SKU, every accessory, net-mod options
- Accessed via: CCW "Recommended Content" panel, or direct Cisco.com search
- Organized by product series within a family

### 2.3 Step 3 — CCW for configuration and validation

- Engineer enters the identified SKU into CCW
- CCW guides through required options and subscriptions
- CCW validates the configuration
- Output: a priced estimate with all required components

### 2.4 Implication for agent

The agent's reasoning chain should follow this same pipeline:
1. **Intake → product selection:** Map requirements (throughput, ports, PoE, features) to the right product family and model using spec data from Catalog API
2. **Product → SKU identification:** Use Catalog API to find the right SKU variant (bundle preferred)
3. **SKU → configuration:** Propose options, licenses, services, accessories based on intake requirements
4. **Configuration → validation:** Run deterministic checks, then (Phase 2) call Prepare Configuration for Cisco's authoritative validation
5. **Validation → estimate:** Write to CCW via Estimate API

---

## 3. Quick quote workflow — for the quote-path advisor

This section feeds the agent's logic for detecting and routing quote scenarios. The agent does NOT automate quote creation in Phase 1 — it advises the engineer.

### 3.1 When a quick quote is needed (vs an estimate or OIP deal)

A quick quote is appropriate when:
- The opportunity involves an **RFP or RFQ** — a formal bid
- The engineer needs **special bid pricing or deep discounts** to win against a competing manufacturer
- The opportunity is a **phased rollout** where the customer won't purchase all at once but needs consistent pricing throughout
- There is **no minimum deal size** for quick quotes (unlike OIP which has minimums)

An OIP deal registration is appropriate when:
- The opportunity is NOT a formal bid
- Standard discount programs apply
- Deal size meets minimums ($5K for Meraki, $10K for other Cisco products)

**Implication for quote-path advisor:** The agent should detect these signals in the intake — mentions of RFP/RFQ, competing vendors, phased deployment, or requests for special pricing — and advise the engineer that a quick quote path is needed rather than a simple estimate.

### 3.2 Quick quote creation steps (reference for advisory logic)

1. Navigate to Deals & Quotes tab → Create Quote
2. Name the quote (identifiable name for tracking)
3. Select Cisco Channel Account Manager (CAM) from dropdown
4. Fill in Cisco Account Manager email (the AM assigned to the end customer)
5. Add end customer via "Faster Search" (name + address)
6. Verify the Cisco Account Manager matches the one working the opportunity
7. Input customer contact information (IT director, purchaser, etc.)
8. Input partner information (auto-populates from user profile)
9. Click "Create Quote"

### 3.3 About the deal section (fields the engineer must fill)

- **Description/summary** of the deal
- **Intended use:** always "Resale" for partner deals
- **Deal category:** always "Other resale/infrastructure"
- **Deal source:** "Partner sales activity"
- **Deal type:** Purchase or Lease
- **Probability percentage:** higher % gets more AM attention
- **Price list:** always "Global Price List U.S. Availability" (for US deals)
- **Expected close date**
- **Expected Cisco hardware/software amount** (list price)
- **Expected service amount** (SmartNet list price)

### 3.4 Buy method

- **Cisco Direct:** generally longer lead times but better discount
- **Distribution:** choose distributor from dropdown, check stock availability and lead times
- If distribution selected: receive DART number and approval via email after submission

### 3.5 Importing an estimate into a quote

This is the bridge between our Phase 1 output and the quote workflow:

1. In the quote's Items section → Actions dropdown → "Import a saved configuration"
2. Select "Estimate"
3. Input the Estimate ID
4. Change "Created by" dropdown to "Shared with me"
5. Click Search → select the estimate → click "Import entire estimate"

**If the estimate doesn't appear in the list:**
1. Go to Estimates tab → "Access shared estimate"
2. Input the Estimate ID and Access Key (received via email from whoever shared it)
3. Click "Get Access"
4. Return to the quote and repeat the import steps

**Implication for agent:** This is the handoff point. Our Phase 1 creates the estimate and returns the Estimate ID. The agent's quote-path advisor should explain to the engineer: "This looks like a quote scenario. I've created Estimate [ID] — here's how to import it into a quick quote in CCW." The import flow itself stays manual in Phase 1.

### 3.6 Discounts and submission

- Discounts are added by the Cisco Account Manager after submission — not by the partner
- After submitting: up to 24 hours for discounts to be applied
- Partner receives confirmation email with deal ID

**Implication for agent:** Discount strategy, pricing approvals, and AM negotiation are all out of scope for our product. The agent should never suggest specific discount levels. It can note that discounts are handled post-submission by the Cisco AM.

---

## 4. Deal registration workflow — Phase 2+ reference

Out of Phase 1 scope. Captured here for future roadmap planning.

### 4.1 OIP deal registration (Meraki example)

**Pre-requisites:**
- Minimum deal size: $5K for Meraki, $10K for other Cisco products
- Must NOT be an RFP/RFQ (that disqualifies from OIP — would need a TIV/teaming incentive instead)
- Must have had contact with the end customer (in-person or phone meeting)

**Creation flow:**
1. Deals & Quotes → Create Deal
2. Enter reseller contact information (auto-populated for direct partners, manually entered by distribution)
3. Name the deal
4. Select Channel Account Manager
5. Search and select end customer (by company name + address, or use "Faster Search")
6. If customer not found: create new customer entry
7. Enter end user contact info (name, email, phone)

### 4.2 Deal details

- **Intended use:** Resale (or Internal Business Use for NFR)
- **Deal category:** Other resale/infrastructure (or Managed Service)
- **Price list:** Global Price List U.S. Availability (critical: NOT "Global Price List US Dollars")
- **Expected closing date**
- **Expected list amount:** the MSRP value of the deal

### 4.3 Incentives tab

- **OIP (Opportunity Incentive Program):** the standard discount program — select for most deals
- **TIV (Teaming Incentive Program):** used when teaming with a Cisco rep, or for formal bids
- **E-Rate:** for education/library customers
- **NFR Certified Partners:** for internal/demo use

### 4.4 Questionnaire (critical for approval)

Answers must be specific or the deal gets kicked back:

1. **Is this an RFP/RFQ/RFI?** Must be "No" for OIP eligibility
2. **Have you completed an in-person/phone meeting with the customer?** Should be "Yes"
3. **Detailed description of the equipment and its use** — more detail = faster approval
4. **Network design created?** — indicates engineering work has been done
5. **Sites associated with the opportunity** — physical deployment locations
6. **Cisco AM working the deal** — name and CCO ID of the Cisco/Meraki rep
7. **Partner engineer CCO ID** — the SE who created the BoM
8. **Cisco campaign involvement?** — No if organically sourced
9. **K-12/public library compliance statement** — fair bidding attestation

### 4.5 Technology mix

- Select which Cisco technologies are in the deal (Meraki, Catalyst, UCS, Collaboration, etc.)
- Allocate percentage per technology
- Can add multiple technology lines

### 4.6 Buy method

- Must select the distribution partner for the deal to route correctly
- Affects ordering process downstream

### 4.7 BoM upload

- Enter SKUs and quantities directly in the quote tab
- Or import a saved configuration (estimate ID or config set ID)
- Config set tool is being deprecated — estimates are the current standard

### 4.8 Review and submit

- Review page shows: deal summary, list price, participants, customer info, parts, trade-ins
- Comments field: add context to speed approval (e.g., "recreated from legacy portal")
- Try-and-buy tab: available for some products (not Meraki currently)
- Submit for approval → confirmation page with deal ID → email notification sent

**Implication for Phase 2+:** Deal registration automation would require the agent to handle the questionnaire logic (answer generation from intake data), technology mix calculation, and the customer/AM relationship mapping. It's significantly more complex than estimate creation because it involves Cisco's approval workflow, not just configuration.

---

## 5. End customer setup patterns

Relevant to Phase 1 because our Customer Registry API integration handles this.

### 5.1 Customer search in CCW

**Method 1 — Standard search:**
- Enter company name + country
- Optionally add city for narrower results
- Returns list of matching customer records with addresses

**Method 2 — "Faster Search" (preferred by engineers):**
- Enter partial company name + partial address
- Example: "data" + "5350" finds "Tech Data" at 5350 Tech Data Drive
- More flexible, faster results

**Method 3 — Create new customer:**
- If no results found, manually enter company name and full address
- Creates a new customer record in Cisco's registry

### 5.2 Customer contact information

Required fields:
- Contact name (IT director, purchaser, or primary POC)
- Email address
- Phone number
- Company website (must match the customer — approvers verify this)

**Gotcha from transcript:** Deals get kicked back if the company website doesn't match the customer name. The approvers in the backend actually check this.

### 5.3 Implication for agent

The agent should use the Customer Registry API's `searchCustomer` to validate/resolve customer names early in the intake process. This catches mismatches before they become downstream errors. The "Faster Search" pattern (partial name + partial address) maps directly to the API's search capabilities. If the customer isn't found, the agent should flag this for the engineer rather than auto-creating (creation has implications for Cisco's customer registry that require human judgment).

---

## 6. CCW navigation patterns (general)

### 6.1 Main CCW tabs

- **Catalog:** SKU search and product browsing
- **Estimates:** Create and manage estimates / configurations
- **Deals & Quotes:** Create deals (OIP) and quotes (quick quote)
- **Orders:** View and manage orders (partner access may vary)
- **CSCC:** Smart Net / service contract management (not relevant for Meraki)
- **Services & Subscriptions:** Cisco One, Smart Account management

### 6.2 Estimate vs Config

- Cisco fully transitioned from "Configsets" to "Estimates" as of May 2016
- Legacy Configsets are no longer accessible
- "Next Generation Configuration Tool" is being deprecated
- Estimates are the current standard for all new work
- Config set IDs still exist in legacy systems but shouldn't be used for new configurations

### 6.3 Sharing and access

- Estimates can be shared via Estimate ID + Access Key
- Shared estimates appear under "Shared with me" filter
- Must "Access shared estimate" first before it appears in import lists
- Email notification sent when estimates are shared

### 6.4 Session behavior

- CCW times out after ~30 minutes of inactivity (5-minute warning)
- Best practice: log out at end of session to avoid cookie/cache conflicts
- CCW loading times are notably slow (mentioned in multiple transcripts)

**Implication for agent:** The agent doesn't interact with the CCW UI — it uses APIs. But the session timeout and loading slowness are part of the pain our product solves. Worth mentioning in sales conversations: "Your engineers currently wait for CCW to load. Our agent runs the API calls in seconds."

---

## 7. Key rules and gotchas from transcripts

These are the practical details engineers learn through experience. Valuable for the agent's advisory logic.

### 7.1 Price list selection

- **Always use "Global Price List U.S. Availability"** (for US deals)
- Common mistake: selecting "Global Price List US Dollars" — this is wrong and will cause incorrect incentive calculation
- The correct price list is what populates incentives on the next page

### 7.2 Deal minimums

- OIP minimum: $10K list price for most Cisco products
- OIP minimum: $5K list price for Meraki specifically
- Quick quotes: NO minimum deal size

### 7.3 RFP/RFQ disqualification

- If the opportunity is a formal RFP/RFQ/RFI, it does NOT qualify for OIP
- Must use quick quote or TIV (Teaming Incentive Program) instead
- Answering "Yes" to the RFP question on the OIP questionnaire will disqualify the deal from OIP pricing

### 7.4 Customer website verification

- CCW approvers check that the customer website matches the customer name
- Mismatches cause deal kickbacks

### 7.5 Distribution vs direct

- Cisco Direct: better discount, longer lead times
- Distribution: faster fulfillment, check stock availability per distributor
- Distribution selection must match the buy method for the order to route correctly

### 7.6 Estimate import into quotes

- Estimate must be "accessed" (via Estimate ID + Access Key) before it appears in the import list
- Common error: searching for an estimate that hasn't been accessed yet — it won't show up
- Change "Created by" dropdown to "Shared with me" when searching for imported estimates

### 7.7 Bundle vs standalone decision

- Bundles include licensing and subscription configuration built in
- HA bundles automatically add two devices
- Standalone SKUs require manual license/service attachment
- For most standard deployments, bundles are the faster and safer path

### 7.8 Management platform decision

- Not all product families require a separate management platform
- When needed, options are: on-box (free), cloud (CDO), or dedicated appliance (FMC/hardware)
- The choice depends on: device count, reporting needs, and deployment model
- The agent should flag when this decision is needed rather than assuming

---

## 8. Mapping transcript patterns to agent capabilities

| CCW pattern | Agent capability | Phase |
|---|---|---|
| SKU search via catalog | Catalog API `getItem` | Phase 1 |
| Recommended Content / ordering guide | Catalog API `getMappedServices` | Phase 1 |
| Bundle vs standalone selection | Agent reasoning + tenant standards defaults | Phase 1 |
| Option selection (power, optics, etc.) | Agent reasoning based on intake region/requirements | Phase 1 |
| License tier selection | Agent reasoning based on intake + tenant defaults | Phase 1 |
| Service attachment (SmartNet) | Catalog API `getMappedServices` + deterministic rules | Phase 1 |
| Estimate creation | Estimate API `createEstimate` | Phase 1 |
| Estimate sharing | Estimate API share operations | Phase 1 |
| Customer search/validation | Customer Registry API `searchCustomer` | Phase 1 |
| Quick quote creation | Out of scope — quote-path advisor only | Phase 1 (advisory) |
| Estimate import into quote | Out of scope — engineer does manually; agent provides ID | Phase 1 (handoff) |
| Deal registration / OIP | Out of scope | Phase 2+ |
| Discount negotiation | Out of scope — handled by Cisco AM post-submission | Never (by design) |
| Management platform selection | Flag for engineer decision | Phase 1 (flag only) |
| Price list selection | Automated based on intake region | Phase 1 |
| Buy method selection | Out of scope — engineer/commercial decision | Phase 2+ |

---

*End of document.*
