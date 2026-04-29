/**
 * Role-based authentication middleware skeleton.
 *
 * Three roles: engineer, tenant_admin, super_admin
 * Route-level role checks enforced in middleware, not individual handlers.
 */

import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@/types/tenant";

export interface AuthSession {
  userId: string;
  tenantId: string;
  email: string;
  name: string;
  role: UserRole;
}

/**
 * Extract session from request headers.
 * In production, this reads from NextAuth.js session cookie.
 * In development, supports a dev header for testing.
 */
export function getSession(request: NextRequest): AuthSession | null {
  // Development mode: allow X-Dev-Session header
  if (process.env.NODE_ENV === "development") {
    const devSession = request.headers.get("x-dev-session");
    if (devSession) {
      try {
        return JSON.parse(devSession) as AuthSession;
      } catch {
        return null;
      }
    }
  }

  // Production: read from NextAuth.js session
  // This is a skeleton — wire up NextAuth.js + Cognito in production
  const sessionToken = request.cookies.get("next-auth.session-token")?.value;
  if (!sessionToken) {
    return null;
  }

  // TODO: Validate session token against NextAuth.js
  return null;
}

/**
 * Require authentication. Returns 401 if no valid session.
 */
export function requireAuth(
  request: NextRequest
): AuthSession | NextResponse {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }
  return session;
}

/**
 * Require a specific role. Returns 403 if insufficient permissions.
 */
export function requireRole(
  request: NextRequest,
  ...allowedRoles: UserRole[]
): AuthSession | NextResponse {
  const result = requireAuth(request);
  if (result instanceof NextResponse) return result;

  if (!allowedRoles.includes(result.role)) {
    return NextResponse.json(
      { error: "Insufficient permissions" },
      { status: 403 }
    );
  }

  return result;
}
