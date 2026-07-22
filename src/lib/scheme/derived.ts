/**
 * Derived schemes — DEPRECATED.
 *
 * The cascade/derived scheme model has been removed. Schemes are now created
 * and assigned exclusively by admin. This file is kept as a stub to avoid
 * breaking any lingering imports during the transition.
 */

export class DerivedSchemeError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "DerivedSchemeError";
    this.statusCode = statusCode;
  }
}

export const DERIVING_ROLES = [] as const;

export async function createDerivedScheme(_input: unknown): Promise<never> {
  throw new DerivedSchemeError("Derived schemes are no longer supported. Schemes are assigned by admin only.", 410);
}

export async function updateDerivedScheme(_ownerId: string, _schemeId: string, _input: unknown): Promise<never> {
  throw new DerivedSchemeError("Derived schemes are no longer supported. Schemes are assigned by admin only.", 410);
}

export async function deactivateDerivedScheme(_ownerId: string, _schemeId: string): Promise<never> {
  throw new DerivedSchemeError("Derived schemes are no longer supported. Schemes are assigned by admin only.", 410);
}
