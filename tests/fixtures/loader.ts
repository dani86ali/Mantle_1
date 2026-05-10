import { readFileSync } from "fs";
import { join } from "path";
import { z } from "zod";
import type { TestFixture } from "./types";

const EngineExpectationsSchema = z.object({
  requirementCount: z.number().optional(),
  lineItemCount: z.number().optional(),
  totalSellRange: z.tuple([z.number(), z.number()]).optional(),
});

const TestFixtureSchema = z.object({
  opportunityId: z.string(),
  projectType: z.string(),
  mode: z.string(),
  sector: z.string(),
  country: z.string(),
  expectedOutputs: z
    .object({
      e1: EngineExpectationsSchema.optional(),
      e2: EngineExpectationsSchema.optional(),
      e3: EngineExpectationsSchema.optional(),
      e4: EngineExpectationsSchema.optional(),
      e5: EngineExpectationsSchema.optional(),
    })
    .optional(),
});

const FIXTURES_DIR = join(process.cwd(), "tests", "fixtures");

export function loadFixture(name: string): TestFixture {
  const fixturePath = join(FIXTURES_DIR, name, "fixture.json");
  const raw = readFileSync(fixturePath, "utf-8");
  return TestFixtureSchema.parse(JSON.parse(raw));
}
