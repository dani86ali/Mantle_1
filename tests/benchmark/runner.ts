/**
 * BOMatic Benchmark Harness
 *
 * Measures agent output against expected BoMs from shahid-ground-truth.md.
 * Target: 90% match rate.
 *
 * Run: npx tsx tests/benchmark/runner.ts
 */

import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { runValidation } from "../../src/lib/validation/engine";
import type { ValidationContext, CatalogItemForValidation } from "../../src/types/validation";
import type { BomLine } from "../../src/types/bom";

interface BenchmarkScenario {
  id: string;
  name: string;
  source: string;
  intake: {
    path: string;
    customerName: string;
    region: string;
    country: string;
    domain: string;
    requirements: Record<string, unknown>;
  };
  expectedSkus?: Array<{
    sku: string;
    quantity: number;
    required: boolean;
  }>;
  expectedValidationErrors?: Array<{
    ruleId: string;
    expectedCount: number;
  }>;
  validationChecks?: Record<string, boolean>;
}

interface BenchmarkResult {
  scenarioId: string;
  scenarioName: string;
  totalChecks: number;
  passed: number;
  failed: number;
  score: number;
  details: Array<{
    check: string;
    passed: boolean;
    message: string;
  }>;
}

// ─── Load scenarios ─────────────────────────────────────────────────────

function loadScenarios(): BenchmarkScenario[] {
  const dir = join(__dirname, "scenarios");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

  return files.map((file) => {
    const raw = readFileSync(join(dir, file), "utf-8");
    return JSON.parse(raw) as BenchmarkScenario;
  });
}

// ─── Load mock catalog data ─────────────────────────────────────────────

function loadCatalogData(): Map<string, CatalogItemForValidation> {
  const raw = readFileSync(
    join(__dirname, "..", "mocks", "catalog-responses.json"),
    "utf-8"
  );
  const data = JSON.parse(raw) as {
    items: Record<string, Record<string, unknown>>;
  };

  const map = new Map<string, CatalogItemForValidation>();

  for (const [sku, item] of Object.entries(data.items)) {
    map.set(sku, {
      sku,
      exists: true,
      eoxStatus: {
        isEox: (item.eoxInfo as Record<string, unknown>)?.isEox as boolean ?? false,
        endOfSaleDate: (item.eoxInfo as Record<string, unknown>)?.endOfSaleDate as string | undefined,
        endOfLifeDate: (item.eoxInfo as Record<string, unknown>)?.endOfLifeDate as string | undefined,
        migrationSku: (item.eoxInfo as Record<string, unknown>)?.migrationProductId as string | undefined,
      },
      regionAvailability: item.regionAvailability as string[] ?? [],
      category: item.productCategory as string ?? "other",
      productFamily: item.productFamily as string ?? "",
      poeData: (item.specs as Record<string, unknown>)?.poeBudgetWatts
        ? {
            poeBudgetWatts: (item.specs as Record<string, number>).poeBudgetWatts,
            poePortCount: (item.specs as Record<string, number>).poePortCount ?? 0,
          }
        : undefined,
      opticsData: (item.specs as Record<string, unknown>)?.sfpSlots
        ? {
            sfpSlots: (item.specs as Record<string, number>).sfpSlots ?? 0,
            qsfpSlots: (item.specs as Record<string, number>).qsfpSlots ?? 0,
            totalTransceiverSlots:
              ((item.specs as Record<string, number>).sfpSlots ?? 0) +
              ((item.specs as Record<string, number>).qsfpSlots ?? 0),
          }
        : undefined,
      psuData: (item.specs as Record<string, unknown>)?.psuSlots
        ? {
            psuSlots: (item.specs as Record<string, number>).psuSlots,
            psuWatts: (item.specs as Record<string, number>).psuWatts ?? 0,
            isPrimary: true,
            isRedundant: false,
          }
        : undefined,
      stackingData: (item.specs as Record<string, unknown>)?.stackable
        ? {
            stackable: true,
            maxStackSize: (item.specs as Record<string, number>).maxStackSize ?? 8,
            requiresStackKit: true,
            modulesPerSwitch: (item.specs as Record<string, number>).stackModulesPerSwitch ?? 2,
          }
        : undefined,
    });
  }

  return map;
}

// ─── Run a single scenario ──────────────────────────────────────────────

function runScenario(
  scenario: BenchmarkScenario,
  catalogData: Map<string, CatalogItemForValidation>
): BenchmarkResult {
  const details: BenchmarkResult["details"] = [];

  // Build BOM lines from expected SKUs for validation testing
  if (scenario.expectedSkus) {
    const lines: BomLine[] = scenario.expectedSkus.map((expected, i) => {
      const catalogItem = catalogData.get(expected.sku);
      return {
        id: `bench-${i}`,
        lineNumber: i + 1,
        sku: expected.sku,
        description: catalogItem ? "" : "Unknown SKU",
        quantity: expected.quantity,
        unitListPrice: 0,
        unitNetPrice: 0,
        discountPercent: 0,
        extendedNetPrice: 0,
        category: (catalogItem?.category ?? "other") as BomLine["category"],
        smartAccountMandatory: false,
        validationFlags: [],
        decision: "pending",
        catalogVerified: catalogData.has(expected.sku),
      };
    });

    // Run validation
    const context: ValidationContext = {
      lines,
      requirements: scenario.intake.requirements as never,
      region: scenario.intake.region,
      country: scenario.intake.country,
      tenantStandards: {
        requireRedundantPsu: true,
        preferredLicenseTier: "advantage",
        preferredDnaTier: "advantage",
        defaultSupportLevel: "8x5xNBD",
        approvedProductFamilies: [],
        regionRestrictions: [],
      },
      catalogData,
    };

    const results = runValidation(context);

    // Check validation results
    if (scenario.validationChecks) {
      for (const [check, expected] of Object.entries(scenario.validationChecks)) {
        let checkPassed = false;
        let message = "";

        switch (check) {
          case "psuRedundancy": {
            const psuResult = results.find((r) => r.ruleId === "psu");
            checkPassed = psuResult ? psuResult.passed === expected : !expected;
            message = psuResult?.message ?? "PSU rule not run";
            break;
          }
          case "stackingComplete": {
            const stackResult = results.find((r) => r.ruleId === "stacking");
            checkPassed = stackResult ? stackResult.passed === expected : !expected;
            message = stackResult?.message ?? "Stacking rule not run";
            break;
          }
          case "licensesAttached": {
            const licResult = results.find((r) => r.ruleId === "license");
            checkPassed = licResult ? licResult.passed === expected : !expected;
            message = licResult?.message ?? "License rule not run";
            break;
          }
          case "supportAttached": {
            const supResult = results.find((r) => r.ruleId === "support");
            checkPassed = supResult ? supResult.passed === expected : !expected;
            message = supResult?.message ?? "Support rule not run";
            break;
          }
          case "noEoxSkus": {
            const eoxResults = results.filter(
              (r) => r.ruleId === "eox" && !r.passed
            );
            checkPassed = expected ? eoxResults.length === 0 : eoxResults.length > 0;
            message = eoxResults.length > 0
              ? `${eoxResults.length} EoX SKUs found`
              : "No EoX SKUs";
            break;
          }
          case "eoxDetected": {
            const eoxErrors = results.filter(
              (r) => r.ruleId === "eox" && !r.passed
            );
            checkPassed = expected ? eoxErrors.length > 0 : eoxErrors.length === 0;
            message = `EoX errors: ${eoxErrors.length}`;
            break;
          }
          case "regionAvailable": {
            const regionResult = results.find((r) => r.ruleId === "region");
            checkPassed = regionResult ? regionResult.passed === expected : !expected;
            message = regionResult?.message ?? "Region rule not run";
            break;
          }
          case "regionBlockDetected": {
            const regionErrors = results.filter(
              (r) => r.ruleId === "region" && !r.passed
            );
            checkPassed = expected ? regionErrors.length > 0 : regionErrors.length === 0;
            message = `Region errors: ${regionErrors.length}`;
            break;
          }
          case "noFalsePositiveMissingLicense": {
            const licErrors = results.filter(
              (r) => r.ruleId === "license" && !r.passed
            );
            checkPassed = expected ? licErrors.length === 0 : licErrors.length > 0;
            message = licErrors.length > 0
              ? `False positive: ${licErrors[0].message}`
              : "No false positive on license";
            break;
          }
          case "noFalsePositiveMissingSmartNet": {
            const supErrors = results.filter(
              (r) => r.ruleId === "support" && !r.passed
            );
            checkPassed = expected ? supErrors.length === 0 : supErrors.length > 0;
            message = supErrors.length > 0
              ? `False positive: ${supErrors[0].message}`
              : "No false positive on support";
            break;
          }
          case "antennaCountCorrect": {
            // Check antenna quantity matches AP count × 4
            const apLine = lines.find((l) => l.sku === "C9120AXE-E");
            const antLine = lines.find((l) => l.sku === "AIR-ANT2524DW-RS");
            if (apLine && antLine) {
              checkPassed = antLine.quantity === apLine.quantity * 4;
              message = `Antennas: ${antLine.quantity} (expected ${apLine.quantity * 4})`;
            } else {
              checkPassed = false;
              message = "AP or antenna line not found";
            }
            break;
          }
          default:
            message = `Unknown check: ${check}`;
        }

        details.push({ check, passed: checkPassed, message });
      }
    }

    // Check required SKUs are present
    for (const expected of scenario.expectedSkus) {
      if (!expected.required) continue;

      const found = lines.find(
        (l) => l.sku === expected.sku && l.quantity >= expected.quantity
      );
      details.push({
        check: `SKU ${expected.sku} × ${expected.quantity}`,
        passed: !!found,
        message: found
          ? `Found: ${found.quantity}`
          : `Missing or insufficient quantity`,
      });
    }
  }

  // Check expected validation errors
  if (scenario.expectedValidationErrors) {
    const lines: BomLine[] = (
      (scenario.intake.requirements.uploadedBomLines as Array<{ sku: string; quantity: number }>) ?? []
    ).map((l, i) => ({
      id: `bench-err-${i}`,
      lineNumber: i + 1,
      sku: l.sku,
      description: "",
      quantity: l.quantity,
      unitListPrice: 0,
      unitNetPrice: 0,
      discountPercent: 0,
      extendedNetPrice: 0,
      category: "hardware" as const,
      smartAccountMandatory: false,
      validationFlags: [],
      decision: "pending" as const,
      catalogVerified: catalogData.has(l.sku),
    }));

    const context: ValidationContext = {
      lines,
      requirements: scenario.intake.requirements as never,
      region: scenario.intake.region,
      country: scenario.intake.country,
      tenantStandards: {
        requireRedundantPsu: false,
        preferredLicenseTier: "advantage",
        preferredDnaTier: "advantage",
        defaultSupportLevel: "8x5xNBD",
        approvedProductFamilies: [],
        regionRestrictions: [],
      },
      catalogData,
    };

    const results = runValidation(context);

    for (const expectedError of scenario.expectedValidationErrors) {
      const matchingErrors = results.filter(
        (r) => r.ruleId === expectedError.ruleId && !r.passed
      );

      details.push({
        check: `Validation error: ${expectedError.ruleId}`,
        passed: matchingErrors.length >= expectedError.expectedCount,
        message: `Expected ${expectedError.expectedCount} errors, found ${matchingErrors.length}`,
      });
    }
  }

  const passed = details.filter((d) => d.passed).length;
  const failed = details.filter((d) => !d.passed).length;

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    totalChecks: details.length,
    passed,
    failed,
    score: details.length > 0 ? passed / details.length : 1,
    details,
  };
}

// ─── Main ───────────────────────────────────────────────────────────────

function main() {
  console.log("=".repeat(80));
  console.log("BOMatic Benchmark Harness");
  console.log("Target: 90% match rate");
  console.log("=".repeat(80));
  console.log("");

  const scenarios = loadScenarios();
  const catalogData = loadCatalogData();

  console.log(`Loaded ${scenarios.length} scenarios`);
  console.log(`Loaded ${catalogData.size} catalog items`);
  console.log("");

  const results: BenchmarkResult[] = [];

  for (const scenario of scenarios) {
    console.log(`--- ${scenario.name} ---`);
    const result = runScenario(scenario, catalogData);
    results.push(result);

    for (const detail of result.details) {
      const icon = detail.passed ? "PASS" : "FAIL";
      console.log(`  [${icon}] ${detail.check}: ${detail.message}`);
    }

    console.log(
      `  Score: ${(result.score * 100).toFixed(1)}% (${result.passed}/${result.totalChecks})`
    );
    console.log("");
  }

  // Summary
  const totalChecks = results.reduce((s, r) => s + r.totalChecks, 0);
  const totalPassed = results.reduce((s, r) => s + r.passed, 0);
  const overallScore = totalChecks > 0 ? totalPassed / totalChecks : 0;

  console.log("=".repeat(80));
  console.log("BENCHMARK SUMMARY");
  console.log("=".repeat(80));
  console.log(`Scenarios:    ${results.length}`);
  console.log(`Total checks: ${totalChecks}`);
  console.log(`Passed:       ${totalPassed}`);
  console.log(`Failed:       ${totalChecks - totalPassed}`);
  console.log(`Overall:      ${(overallScore * 100).toFixed(1)}%`);
  console.log(
    `Target:       90%  ${overallScore >= 0.9 ? "-- ACHIEVED" : "-- NOT MET"}`
  );
  console.log("=".repeat(80));

  process.exit(overallScore >= 0.9 ? 0 : 1);
}

main();
