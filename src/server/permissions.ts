/**
 * AMTP Permission Guard — middleware for policy-based access control.
 *
 * Evaluates the permissions/policies declared in an AMTPDocument against
 * the current session's granted permissions at action-execution time.
 *
 * Design:
 *  - Documents declare `permissions` and `policies` as first-class protocol blocks.
 *  - Sessions hold a flat `permissions: string[]` of granted permission IDs.
 *  - PermissionGuard resolves which policies apply to the current session,
 *    checks conditions, and denies the action if a required permission is missing.
 */

import {
  AMTPDocument,
  Action,
  Session,
  PolicyCondition,
  StatusCode,
  ErrorCode,
  AMTPError,
} from "../types/amtp.types";

/* ================================================================
   TYPES
   ================================================================ */

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  requiredPermissions?: string[];
  matchedPolicy?: string;
}

export interface PermissionGuardConfig {
  /** When true, actions with no matching permission/policy are denied (default: false) */
  denyByDefault?: boolean;
  /** Custom error message for denied actions */
  deniedMessage?: string;
}

/* ================================================================
   PERMISSION GUARD
   ================================================================ */

export class PermissionGuard {
  private config: Required<PermissionGuardConfig>;

  constructor(config?: PermissionGuardConfig) {
    this.config = {
      denyByDefault: config?.denyByDefault ?? false,
      deniedMessage: config?.deniedMessage ?? "Action denied by policy",
    };
  }

  /**
   * Check whether a session is allowed to execute an action on a document
   * given the document's declared permissions and policies.
   */
  check(
    action: Action,
    doc: AMTPDocument,
    session?: Session
  ): PermissionCheckResult {
    // If the action doesn't declare required permissions, policy is optional
    const requiredPerms = action.permissions;
    if (!requiredPerms || requiredPerms.length === 0) {
      return { allowed: !this.config.denyByDefault };
    }

    const sessionPerms = session?.permissions ?? [];

    // If no session but action requires auth, deny
    if (!session && action.requiresAuthentication !== false) {
      return {
        allowed: false,
        reason: "Authentication required",
        requiredPermissions: requiredPerms,
      };
    }

    // Find policies in the document that apply to the session's role
    const docPolicies = doc.policies ?? [];
    const sessionRole = session?.metadata?.role as string | undefined;

    const matchingPolicies = docPolicies.filter((p) => {
      // If the policy has a role restriction, the session must match
      if (p.roles && p.roles.length > 0) {
        if (!sessionRole || !p.roles.includes(sessionRole)) return false;
      }
      return true;
    });

    // Check conditions on matching policies
    for (const policy of matchingPolicies) {
      if (policy.conditions && policy.conditions.length > 0) {
        const conditionsMet = this.evaluateConditions(policy.conditions, session);
        if (!conditionsMet) continue;
      }

      // Check if this policy covers all the action's required permissions
      const hasAllPerms = requiredPerms.every((rp) => {
        return policy.permissions.includes(rp) || sessionPerms.includes(rp);
      });

      if (hasAllPerms) {
        return {
          allowed: true,
          matchedPolicy: policy.id,
          requiredPermissions: requiredPerms,
        };
      }
    }

    // Fallback: check if session directly has the required permissions
    const hasDirectPerms = requiredPerms.every((rp) =>
      sessionPerms.includes(rp)
    );
    if (hasDirectPerms) {
      return {
        allowed: true,
        requiredPermissions: requiredPerms,
      };
    }

    // Deny
    const missingPerms = requiredPerms.filter(
      (rp) => !sessionPerms.includes(rp)
    );

    return {
      allowed: false,
      reason: `${this.config.deniedMessage}: missing permissions [${missingPerms.join(", ")}]`,
      requiredPermissions: requiredPerms,
    };
  }

  /**
   * Convenience: throws AMTPError if the action is not permitted.
   */
  assert(action: Action, doc: AMTPDocument, session?: Session): void {
    const result = this.check(action, doc, session);
    if (!result.allowed) {
      throw new AMTPError(
        ErrorCode.PERMISSION_DENIED,
        result.reason || this.config.deniedMessage,
        StatusCode.FORBIDDEN
      );
    }
  }

  private evaluateConditions(
    conditions: PolicyCondition[],
    session?: Session
  ): boolean {
    if (!session) return false;

    for (const cond of conditions) {
      const actual = this.resolveField(cond.field, session);
      const expected = cond.value;

      switch (cond.operator) {
        case "eq":
          if (actual !== expected) return false;
          break;
        case "neq":
          if (actual === expected) return false;
          break;
        case "in": {
          if (!Array.isArray(expected) || !expected.includes(actual)) return false;
          break;
        }
        case "gt":
          if (typeof actual !== "number" || typeof expected !== "number" || actual <= expected)
            return false;
          break;
        case "lt":
          if (typeof actual !== "number" || typeof expected !== "number" || actual >= expected)
            return false;
          break;
        case "contains":
          if (typeof actual !== "string" || !actual.includes(String(expected))) return false;
          break;
        case "exists":
          if (actual === undefined || actual === null) return false;
          break;
      }
    }
    return true;
  }

  private resolveField(field: string, session: Session): unknown {
    const parts = field.split(".");
    let value: unknown = session as unknown as Record<string, unknown>;
    for (const part of parts) {
      if (value && typeof value === "object") {
        value = (value as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
    return value;
  }
}
