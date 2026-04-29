/**
 * Cisco OAuth adapter — ROPC flow with per-tenant token caching.
 *
 * Token endpoint: https://id.cisco.com/oauth2/default/v1/token
 * Grant type: password (Resource Owner Password Credentials)
 * Cache: Redis with 50-minute TTL (10min safety margin under 60min validity)
 */

import { redis, tenantKey } from "@/lib/redis";
import { isMockMode, getMockError } from "@/lib/env";
import { appendAuditLog } from "@/lib/db/queries";
import type { CiscoTokenResponse } from "@/types/cisco";

const TOKEN_TTL_SECONDS = 50 * 60; // 50 minutes
const REFRESH_TOKEN_KEY_SUFFIX = "refresh_token";

interface TenantCredentials {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
}

export async function getAccessToken(
  tenantId: string,
  credentials: TenantCredentials
): Promise<string> {
  if (isMockMode()) {
    const mockError = getMockError();
    if (mockError === "auth_failure") {
      throw new CiscoAuthError("Mock auth failure: credentials invalid");
    }
    return "mock-access-token-" + tenantId;
  }

  // Check cache first
  const cacheKey = tenantKey(tenantId, "oauth", "access_token");
  const cached = await redis.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Try refresh token first
  const refreshKey = tenantKey(tenantId, "oauth", REFRESH_TOKEN_KEY_SUFFIX);
  const refreshToken = await redis.get(refreshKey);

  if (refreshToken) {
    try {
      const tokenResponse = await requestToken({
        grant_type: "refresh_token",
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        refresh_token: refreshToken,
      });
      await cacheTokens(tenantId, tokenResponse);
      await auditTokenEvent(tenantId, "token_refresh_success");
      return tokenResponse.access_token;
    } catch {
      // Refresh failed — fall through to full re-auth
      await auditTokenEvent(tenantId, "token_refresh_failed");
    }
  }

  // Full ROPC authentication
  try {
    const tokenResponse = await requestToken({
      grant_type: "password",
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      username: credentials.username,
      password: credentials.password,
    });
    await cacheTokens(tenantId, tokenResponse);
    await auditTokenEvent(tenantId, "token_auth_success");
    return tokenResponse.access_token;
  } catch (err) {
    await auditTokenEvent(tenantId, "token_auth_failed");
    throw new CiscoAuthError(
      `Authentication failed for tenant ${tenantId}: ${err instanceof Error ? err.message : "Unknown error"}`
    );
  }
}

export async function invalidateTokens(tenantId: string): Promise<void> {
  const accessKey = tenantKey(tenantId, "oauth", "access_token");
  const refreshKey = tenantKey(tenantId, "oauth", REFRESH_TOKEN_KEY_SUFFIX);
  await redis.del(accessKey, refreshKey);
}

async function requestToken(
  params: Record<string, string>
): Promise<CiscoTokenResponse> {
  const tokenEndpoint =
    process.env.CISCO_TOKEN_ENDPOINT ||
    "https://id.cisco.com/oauth2/default/v1/token";

  const body = new URLSearchParams(params);

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Token request failed (${response.status}): ${errorBody}`);
  }

  return (await response.json()) as CiscoTokenResponse;
}

async function cacheTokens(
  tenantId: string,
  tokenResponse: CiscoTokenResponse
): Promise<void> {
  const accessKey = tenantKey(tenantId, "oauth", "access_token");
  await redis.setex(accessKey, TOKEN_TTL_SECONDS, tokenResponse.access_token);

  if (tokenResponse.refresh_token) {
    const refreshKey = tenantKey(tenantId, "oauth", REFRESH_TOKEN_KEY_SUFFIX);
    // Refresh tokens typically have longer validity — cache for 24h
    await redis.setex(refreshKey, 24 * 60 * 60, tokenResponse.refresh_token);
  }
}

async function auditTokenEvent(
  tenantId: string,
  event: string
): Promise<void> {
  try {
    await appendAuditLog(tenantId, `cisco_auth:${event}`, null, {
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Audit log failure should not block auth flow
  }
}

export class CiscoAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CiscoAuthError";
  }
}
