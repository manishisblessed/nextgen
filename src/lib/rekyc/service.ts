import { nanoid } from "nanoid";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { maskTail } from "../crypto/fieldEncryption";
import { logSecurityEvent } from "../security/audit";
import { isNetworkTier } from "../security/kycGate";
import { firstOfNextMonthIST } from "./dates";
import {
  reKycMethod,
  methodRequiresAadhaarOtp,
  methodRequiresFace,
  faceMatchThreshold,
  type ReKycMethod,
} from "./config";
import {
  initiateAadhaarOtp,
  verifyAadhaarOtp,
  matchFace,
  rekycProviderName,
} from "./provider";
import { getFaceBaselineRef, encryptBaselineRef } from "./face";

/**
 * Monthly Re-KYC orchestration (Phase 13).
 *
 * initiate → opens a PENDING attempt and (for Aadhaar-OTP methods) triggers the
 * eKYC Hub OTP. verify → submits the OTP / liveness probe, and on provider
 * success clears the gate, advances the due date to the 1st of next month, and
 * marks the attempt PASSED. No raw Aadhaar/biometric ever touches our DB — only
 * masked values + opaque provider references.
 */

export class ReKycError extends Error {
  constructor(message: string, public statusCode: number, public code: string) {
    super(message);
    this.name = "ReKycError";
  }
}

type Ctx = { ip?: string | null; userAgent?: string | null };

export type ReKycStatus = {
  reKycRequired: boolean;
  reKycDueAt: string | null;
  lastReKycAt: string | null;
  isNetworkTier: boolean;
  method: ReKycMethod;
};

export async function getReKycStatus(user: {
  id: string;
  role: string;
}): Promise<ReKycStatus> {
  const network = isNetworkTier(user.role);
  const row = network
    ? await prisma.user.findUnique({
        where: { id: user.id },
        select: { reKycRequired: true, reKycDueAt: true, lastReKycAt: true },
      })
    : null;

  return {
    reKycRequired: network ? !!row?.reKycRequired : false,
    reKycDueAt: row?.reKycDueAt?.toISOString() ?? null,
    lastReKycAt: row?.lastReKycAt?.toISOString() ?? null,
    isNetworkTier: network,
    method: reKycMethod(),
  };
}

export type InitiateResult = {
  logId: string;
  method: ReKycMethod;
  requiresOtp: boolean;
  requiresFace: boolean;
  needsBaselineEnrollment: boolean;
  provider: string;
};

export async function initiateReKyc(
  user: { id: string; role: string },
  input: { aadhaar?: string },
  ctx: Ctx
): Promise<InitiateResult> {
  if (!isNetworkTier(user.role)) {
    throw new ReKycError("Re-KYC does not apply to this role.", 400, "NOT_NETWORK_TIER");
  }

  const method = reKycMethod();
  const provider = rekycProviderName();
  const orderid = `REKYC${nanoid(18).toUpperCase()}`;
  const requiresOtp = methodRequiresAadhaarOtp(method);
  const requiresFace = methodRequiresFace(method);

  // Trigger the Aadhaar OTP up-front so the user can submit it on /verify.
  let referenceId: string | null = null;
  if (requiresOtp) {
    const aadhaar = (input.aadhaar ?? "").replace(/\s/g, "");
    if (!/^\d{12}$/.test(aadhaar)) {
      throw new ReKycError("A valid 12-digit Aadhaar number is required.", 400, "AADHAAR_INVALID");
    }
    const res = await initiateAadhaarOtp({ aadhaar, orderid });
    if (!res.ok) {
      throw new ReKycError(res.message || "Could not send Aadhaar OTP.", 502, "PROVIDER_INIT_FAILED");
    }
    referenceId = res.referenceId;
  }

  const needsBaselineEnrollment = requiresFace
    ? (await getFaceBaselineRef(user.id)) === null
    : false;

  const log = await prisma.reKycLog.create({
    data: {
      userId: user.id,
      method,
      status: "PENDING",
      provider,
      providerRef: referenceId,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      meta: {
        orderid,
        requiresOtp,
        requiresFace,
        needsBaselineEnrollment,
      } as Prisma.InputJsonValue,
    },
  });

  await logSecurityEvent({
    action: "rekyc.initiated",
    severity: "info",
    userId: user.id,
    entity: "ReKycLog",
    entityId: log.id,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    meta: { method, provider, requiresOtp, requiresFace, needsBaselineEnrollment },
  });

  return {
    logId: log.id,
    method,
    requiresOtp,
    requiresFace,
    needsBaselineEnrollment,
    provider,
  };
}

export type VerifyResult = {
  passed: true;
  reKycDueAt: string;
  enrolledBaseline: boolean;
};

export async function verifyReKyc(
  user: { id: string; role: string },
  input: { otp?: string; faceProbeRef?: string },
  ctx: Ctx
): Promise<VerifyResult> {
  if (!isNetworkTier(user.role)) {
    throw new ReKycError("Re-KYC does not apply to this role.", 400, "NOT_NETWORK_TIER");
  }

  // The active attempt is the most recent PENDING log opened by /initiate.
  const log = await prisma.reKycLog.findFirst({
    where: { userId: user.id, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  if (!log) {
    throw new ReKycError("No active re-KYC request. Start verification again.", 409, "NO_PENDING_REKYC");
  }

  const meta = (log.meta as Record<string, unknown> | null) ?? {};
  const method = log.method as ReKycMethod;
  const orderid = String(meta.orderid ?? log.id);
  const requiresOtp = methodRequiresAadhaarOtp(method);
  const requiresFace = methodRequiresFace(method);

  const resultMeta: Record<string, unknown> = { ...meta };

  // ── Fail helper: mark the attempt FAILED, keep the gate closed, surface code.
  const fail = async (message: string, code: string, statusCode = 422): Promise<never> => {
    await prisma.reKycLog.update({
      where: { id: log.id },
      data: { status: "FAILED", meta: { ...resultMeta, failureCode: code } as Prisma.InputJsonValue },
    });
    await logSecurityEvent({
      action: "rekyc.failed",
      severity: "warn",
      userId: user.id,
      entity: "ReKycLog",
      entityId: log.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      meta: { method, code },
    });
    throw new ReKycError(message, statusCode, code);
  };

  // ── Factor 1: Aadhaar OTP ──────────────────────────────────────────────
  if (requiresOtp) {
    const otp = (input.otp ?? "").trim();
    if (!/^\d{4,8}$/.test(otp)) {
      await fail("Enter the OTP sent to your Aadhaar-linked mobile.", "OTP_REQUIRED", 400);
    }
    if (!log.providerRef) {
      await fail("Re-KYC session expired. Please restart.", "MISSING_REFERENCE", 409);
    }
    const res = await verifyAadhaarOtp({ referenceId: log.providerRef!, otp, orderid });
    if (!res.ok) {
      await fail(res.message || "Aadhaar OTP verification failed.", res.code || "OTP_FAILED");
    }
    if (res.ok) {
      // Store ONLY masked identity — never the raw Aadhaar.
      resultMeta.verifiedName = res.name;
      resultMeta.maskedAadhaar = res.maskedAadhaar ? maskTail(res.maskedAadhaar, 4) : null;
    }
  }

  // ── Factor 2: liveness face (match vs. baseline, or enroll on first cycle) ─
  let enrolledBaseline = false;
  if (requiresFace) {
    const probeRef = (input.faceProbeRef ?? "").trim();
    if (!probeRef) {
      await fail("A fresh liveness capture is required.", "FACE_PROBE_REQUIRED", 400);
    }

    const baselineRef = await getFaceBaselineRef(user.id);
    if (!baselineRef) {
      // Legacy / first cycle: enroll the fresh probe AS the baseline (Task 7).
      resultMeta.faceBaselineRefEnc = encryptBaselineRef(probeRef);
      resultMeta.faceEnrolled = true;
      enrolledBaseline = true;
    } else {
      const res = await matchFace({ baselineRef, probeRef, orderid });
      if (!res.ok) {
        await fail(res.message || "Face match failed.", res.code || "FACE_MATCH_FAILED");
      }
      if (res.ok) {
        resultMeta.faceConfidence = res.confidence;
        if (!res.match || res.confidence < faceMatchThreshold()) {
          await fail("Face did not match our records.", "FACE_MISMATCH");
        }
        // Carry the baseline forward so future months keep matching.
        resultMeta.faceBaselineRefEnc = encryptBaselineRef(baselineRef);
      }
    }
  }

  // ── Success: clear the gate and advance the due date to next month. ──────
  const nextDue = firstOfNextMonthIST();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { reKycRequired: false, lastReKycAt: new Date(), reKycDueAt: nextDue },
    }),
    prisma.reKycLog.update({
      where: { id: log.id },
      data: { status: "PASSED", meta: resultMeta as Prisma.InputJsonValue },
    }),
    prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "rekyc.passed",
        entity: "ReKycLog",
        entityId: log.id,
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
        meta: {
          method,
          provider: log.provider,
          enrolledBaseline,
          reKycDueAt: nextDue.toISOString(),
        },
      },
    }),
  ]);

  await logSecurityEvent({
    action: "rekyc.passed",
    severity: "info",
    userId: user.id,
    entity: "ReKycLog",
    entityId: log.id,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    persist: false, // AuditLog row already written in the transaction above
    meta: { method, enrolledBaseline, reKycDueAt: nextDue.toISOString() },
  });

  return { passed: true, reKycDueAt: nextDue.toISOString(), enrolledBaseline };
}
