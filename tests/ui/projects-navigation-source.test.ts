import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

describe("Project-centered navigation source", () => {
  const sidebarPath = join(process.cwd(), "src/components/shared/AppSidebar.tsx");
  const commandPath = join(process.cwd(), "src/components/shared/CommandPalette.tsx");
  const shortcutsPath = join(
    process.cwd(),
    "src/components/shared/KeyboardShortcuts.tsx"
  );
  const layoutPath = join(process.cwd(), "src/app/layout.tsx");
  const testPath = join(process.cwd(), "tests/ui/projects-navigation-source.test.ts");

  const sidebar = readFileSync(sidebarPath, "utf8");
  const commandPalette = readFileSync(commandPath, "utf8");
  const shortcuts = readFileSync(shortcutsPath, "utf8");
  const layout = readFileSync(layoutPath, "utf8");

  it("labels the canonical list as Projects while keeping Catalog visible", () => {
    expect(sidebar).toMatch(/label:\s*"Projects"/);
    expect(sidebar).toMatch(/label:\s*"Catalog"/);
    expect(sidebar).toContain('href: "/projects"');
    expect(sidebar).toContain('href: "/projects/quick-bom/new"');
    expect(sidebar).not.toMatch(/label:\s*"Estimates"/);
  });

  it("points command palette and keyboard shortcuts at Projects, not Estimates", () => {
    expect(commandPalette).toContain("Projects");
    expect(commandPalette).toContain("New Quick BoM");
    expect(commandPalette).toContain('router.push("/projects")');
    expect(commandPalette).toContain('router.push("/projects/quick-bom/new")');
    expect(commandPalette).not.toMatch(/\bEstimates\b/);
    expect(commandPalette).not.toMatch(/\bEstimate\b/);

    expect(shortcuts).toContain("New Quick BoM project");
    expect(shortcuts).toContain("Projects list");
    expect(shortcuts).not.toMatch(/\bestimate\b/i);
  });

  it("does not describe BOMATIC as an AI-powered Cisco product surface", () => {
    expect(layout).toContain("Project-centered presales workflow");
    expect(layout).not.toContain("AI-powered Cisco");
    expect(layout).not.toContain("Cisco-certified");
  });

  it("keeps changed navigation files ASCII-only", () => {
    const testSource = readFileSync(testPath, "utf8");
    for (const source of [sidebar, commandPalette, shortcuts, layout, testSource]) {
      expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    }
  });
});
