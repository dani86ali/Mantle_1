import { z } from "zod";
import { normalizeModel } from "@/lib/utils/normalize-model";

export interface LicenseLine {
  sku: string;
  description: string;
  qty: number;
  category: "network_license" | "dna_subscription" | "addon" | "software";
}

const ConfigSchema = z.object({
  dnaTier: z.enum(["essentials", "advantage", "premier", "optout"]),
  networkTier: z.enum(["essentials", "advantage"]),
  term: z.union([z.literal(3), z.literal(5), z.literal(7)]),
  includeThousandEyes: z.boolean().optional(),
  includeDnaSpaces: z.boolean().optional(),
});

export type LicenseConfig = z.infer<typeof ConfigSchema>;

const InputSchema = z.object({
  model: z.string().min(1),
  qty: z.number().int().positive(),
});

const NW: Record<"essentials" | "advantage", string> = { essentials: "E", advantage: "A" };
const DNA_SFX: Record<"essentials" | "advantage" | "premier", string> = {
  essentials: "E",
  advantage: "A",
  premier: "P",
};

function isAP(model: string): boolean {
  return /^C9\d+AX/.test(model);
}

function isFortinet(model: string): boolean {
  return model.startsWith("FG-");
}

// FG-601F → F601F  (matches Fortinet FC-10-{code}-{svc}-02 model encoding)
function encodeForFortinet(model: string): string {
  const suffix = model.split("-").slice(1).join("");
  return "F" + suffix;
}

const FORTIGUARD_BUNDLES: Record<"essentials" | "advantage" | "premier", { code: string; name: string }> = {
  essentials: { code: "928", name: "ATP" },
  advantage:  { code: "950", name: "UTP" },
  premier:    { code: "811", name: "Enterprise Protection" },
};

function switchPrefix(model: string): string {
  if (/^C9300L/.test(model)) return "C9300L";
  if (/^C9300/.test(model)) return "C9300";
  throw new Error(`Unsupported switch family: ${model}`);
}

function portCount(model: string): 24 | 48 {
  const m = model.match(/-(24|48)/);
  if (!m) throw new Error(`Cannot parse port count from: ${model}`);
  return parseInt(m[1], 10) as 24 | 48;
}

function ln(
  sku: string,
  description: string,
  qty: number,
  category: LicenseLine["category"]
): LicenseLine {
  return { sku, description, qty, category };
}

export function calculateLicenses(
  rawModel: string,
  qty: number,
  config: LicenseConfig
): LicenseLine[] {
  InputSchema.parse({ model: rawModel, qty });
  ConfigSchema.parse(config);

  const model = normalizeModel(rawModel);

  const {
    dnaTier,
    networkTier,
    term,
    includeThousandEyes = false,
    includeDnaSpaces = false,
  } = config;

  if (isFortinet(model)) {
    const lines: LicenseLine[] = [
      ln(`${model}-FW`, `${model} FortiOS firmware`, qty, "software"),
    ];
    if (dnaTier !== "optout") {
      const bundle = FORTIGUARD_BUNDLES[dnaTier];
      const code = encodeForFortinet(model);
      lines.push(
        ln(
          `FC-10-${code}-${bundle.code}-02`,
          `FortiGuard ${bundle.name} bundle ${term}Y`,
          qty,
          "dna_subscription"
        )
      );
    }
    return lines;
  }

  if (isAP(model)) {
    const lines: LicenseLine[] = [
      ln("SW9120AX-CAPWAP-K9", "CAPWAP software", qty, "software"),
    ];
    if (dnaTier === "optout") {
      lines.push(ln("C9120AX-DNA-OPTOUT", "DNA subscription opted out", qty, "dna_subscription"));
    }
    lines.push(ln("NETWORK-PNP-LIC", "Plug-and-Play license", qty, "software"));
    return lines;
  }

  const prefix = switchPrefix(model);
  const ports = portCount(model);
  const lines: LicenseLine[] = [];

  lines.push(
    ln(`${prefix}-NW-${NW[networkTier]}-${ports}`, `Network ${networkTier} ${ports}-port license`, qty, "network_license")
  );

  // Switch + dnaTier:'optout' → network license only, no DNA parent/child
  if (dnaTier !== "optout") {
    const ds = DNA_SFX[dnaTier as "essentials" | "advantage" | "premier"];
    lines.push(
      ln(`${prefix}-DNA-${ds}-${ports}`, `DNA ${dnaTier} ${ports}-port (parent)`, qty, "dna_subscription"),
      ln(`${prefix}-DNA-${ds}-${ports}-${term}Y`, `DNA ${dnaTier} ${ports}-port ${term}Y`, qty, "dna_subscription")
    );
  }

  if (includeThousandEyes) {
    lines.push(
      ln("TE-EMBEDDED-T", "ThousandEyes embedded (parent)", qty, "addon"),
      ln(`TE-EMBEDDED-T-${term}Y`, `ThousandEyes embedded ${term}Y`, qty, "addon"),
      ln("TE-C9K-SW", "ThousandEyes Catalyst 9K agent", qty, "addon")
    );
  }

  if (includeDnaSpaces) {
    lines.push(
      ln("D-DNAS-EXT-S-T", "DNA Spaces Extend (parent)", qty, "addon"),
      ln(`D-DNAS-EXT-S-${term}Y`, `DNA Spaces Extend ${term}Y`, qty, "addon")
    );
  }

  lines.push(
    ln("S9300LUK9-179", "IOS XE 17.9 Universal software image", qty, "software"),
    ln("NETWORK-PNP-LIC", "Plug-and-Play license", qty, "software")
  );

  return lines;
}
