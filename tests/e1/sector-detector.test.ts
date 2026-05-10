import { describe, it, expect } from "vitest";
import { detectSector } from "@/engines/e1/sector-detector";

describe("detectSector — Method 1: client name lookup (highest priority)", () => {
  it("detects oil_and_gas for Saudi Aramco", () => {
    const result = detectSector("Saudi Aramco");
    expect(result.sector).toBe("oil_and_gas");
    expect(result.confidence).toBeGreaterThan(0.9);
    expect(result.method).toBe("client_lookup");
  });

  it("detects oil_and_gas for Aramco (without Saudi prefix)", () => {
    const result = detectSector("Aramco");
    expect(result.sector).toBe("oil_and_gas");
    expect(result.method).toBe("client_lookup");
  });

  it("detects banking for Riyad Bank", () => {
    const result = detectSector("Riyad Bank");
    expect(result.sector).toBe("banking");
    expect(result.method).toBe("client_lookup");
  });

  it("detects banking for Al Rajhi", () => {
    const result = detectSector("Al Rajhi");
    expect(result.sector).toBe("banking");
    expect(result.method).toBe("client_lookup");
  });

  it("detects government for Ministry of Communications", () => {
    const result = detectSector("Ministry of Communications and Information Technology");
    expect(result.sector).toBe("government");
    expect(result.method).toBe("client_lookup");
  });

  it("detects government for Diriyah", () => {
    const result = detectSector("Diriyah Gate Development Authority");
    expect(result.sector).toBe("government");
  });

  it("detects hospitality for Red Sea Global", () => {
    const result = detectSector("Red Sea Global");
    expect(result.sector).toBe("hospitality");
    expect(result.method).toBe("client_lookup");
  });

  it("detects telecom for STC", () => {
    const result = detectSector("STC");
    expect(result.sector).toBe("telecom");
    expect(result.method).toBe("client_lookup");
  });

  it("detects petrochemical for SABIC", () => {
    const result = detectSector("SABIC");
    expect(result.sector).toBe("petrochemical");
    expect(result.method).toBe("client_lookup");
  });

  it("client name lookup wins even when rfpText has strong banking keywords", () => {
    const result = detectSector(
      "Saudi Aramco",
      "core banking ATM SWIFT PCI DSS card processing anti-money laundering"
    );
    expect(result.sector).toBe("oil_and_gas");
    expect(result.method).toBe("client_lookup");
  });
});

describe("detectSector — Method 2: content keywords", () => {
  it("detects oil_and_gas from upstream/refinery keywords", () => {
    const result = detectSector(
      "Unknown Client",
      "The project involves upstream oil processing and refinery operations including drilling and pipeline management."
    );
    expect(result.sector).toBe("oil_and_gas");
    expect(result.method).toBe("content_keywords");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("detects banking from core banking / ATM keywords", () => {
    const result = detectSector(
      "Unknown Client",
      "The solution shall support core banking operations, ATM networks, and SWIFT messaging with PCI DSS compliance."
    );
    expect(result.sector).toBe("banking");
    expect(result.method).toBe("content_keywords");
  });

  it("detects healthcare from hospital / HIS / PACS keywords", () => {
    const result = detectSector(
      "Unknown Client",
      "The system shall integrate with the hospital HIS and support PACS for patient record management across all clinics."
    );
    expect(result.sector).toBe("healthcare");
    expect(result.method).toBe("content_keywords");
  });

  it("detects hospitality from hotel / PMS keywords", () => {
    const result = detectSector(
      "Unknown Client",
      "The solution must integrate with the hotel PMS and support key card access for all guest rooms and IPTV."
    );
    expect(result.sector).toBe("hospitality");
    expect(result.method).toBe("content_keywords");
  });

  it("detects government from ministry / e-government keywords", () => {
    const result = detectSector(
      "Unknown Client",
      "The solution shall connect with the e-government portal Etimad and deliver citizen services."
    );
    expect(result.sector).toBe("government");
    expect(result.method).toBe("content_keywords");
  });

  it("content keywords win over standard_reference when rfpText is provided", () => {
    // content says oil_and_gas (refinery), standard says banking (SAMA CSF)
    // Method 2 (content) runs before Method 3 (standard), so oil_and_gas wins
    const result = detectSector(
      "Unknown Client",
      "The refinery upstream drilling and pipeline operations require network upgrades.",
      ["SAMA CSF"]
    );
    expect(result.sector).toBe("oil_and_gas");
    expect(result.method).toBe("content_keywords");
  });
});

describe("detectSector — Method 3: standard reference", () => {
  it("detects banking from SAMA CSF (when no rfpText provided)", () => {
    const result = detectSector("Unknown Client", undefined, ["SAMA CSF"]);
    expect(result.sector).toBe("banking");
    expect(result.method).toBe("standard_reference");
    expect(result.confidence).toBeGreaterThan(0.85);
  });

  it("detects oil_and_gas from SACS standard", () => {
    const result = detectSector("Unknown Client", undefined, ["SACS-002", "SAES-X-001"]);
    expect(result.sector).toBe("oil_and_gas");
    expect(result.method).toBe("standard_reference");
  });

  it("detects healthcare from ADHICS standard", () => {
    const result = detectSector("Unknown Client", undefined, ["ADHICS"]);
    expect(result.sector).toBe("healthcare");
    expect(result.method).toBe("standard_reference");
  });

  it("detects government from NCA ECC reference", () => {
    const result = detectSector("Unknown Client", undefined, ["NCA ECC"]);
    expect(result.sector).toBe("government");
    expect(result.method).toBe("standard_reference");
  });
});

describe("detectSector — default: general", () => {
  it("returns general when no signals found", () => {
    const result = detectSector("XYZ Company Ltd");
    expect(result.sector).toBe("general");
  });

  it("returns general with empty rfpText and empty standards", () => {
    const result = detectSector("", "", []);
    expect(result.sector).toBe("general");
  });

  it("returns general for rfpText with no sector keywords", () => {
    const result = detectSector(
      "Unknown Client",
      "The vendor shall provide installation and commissioning services within 90 days of contract award."
    );
    expect(result.sector).toBe("general");
  });
});

describe("detectSector — SectorDetection schema", () => {
  it("all fields are present with correct types", () => {
    const result = detectSector("Saudi Aramco");
    expect(typeof result.sector).toBe("string");
    expect(typeof result.confidence).toBe("number");
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(typeof result.method).toBe("string");
    expect(typeof result.evidence).toBe("string");
    expect(result.evidence.length).toBeGreaterThan(0);
  });
});
