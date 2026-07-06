export type DeclarationRole = "SUPER_DISTRIBUTOR" | "MASTER_DISTRIBUTOR" | "DISTRIBUTOR" | "RETAILER";

export const ROLE_LABELS: Record<DeclarationRole, { en: string; hi: string }> = {
  SUPER_DISTRIBUTOR: { en: "Super Distributor", hi: "Super Distributor" },
  MASTER_DISTRIBUTOR: { en: "Master Distributor", hi: "Master Distributor" },
  DISTRIBUTOR: { en: "Distributor", hi: "Distributor" },
  RETAILER: { en: "Retailer", hi: "Retailer" },
};

export type DeclarationData = {
  date: string;
  creatorName: string;
  creatorId: string;
  creatorCompany: string;
  creatorMobile: string;
  creatorEmail: string;
  creatorAddress: string;
  creatorPan: string;
  creatorAadhaar: string;
  creatorRole: DeclarationRole;

  onboardeeName: string;
  onboardeeId: string;
  onboardeeBusiness: string;
  onboardeeMobile: string;
  onboardeeAddress: string;
  onboardeeRole: DeclarationRole;
};

export function needsSuccessorApproval(onboardeeRole: string, creatorRole: string): boolean {
  if (
    creatorRole === "ADMIN" ||
    creatorRole === "MASTER_ADMIN" ||
    creatorRole === "SUPPORT"
  ) {
    return false;
  }
  return true;
}

export function getCreatorRoleLabel(role: string): { en: string; hi: string } {
  return ROLE_LABELS[role as DeclarationRole] ?? { en: role, hi: role };
}

export function getOnboardeeRoleLabel(role: string): { en: string; hi: string } {
  return ROLE_LABELS[role as DeclarationRole] ?? { en: role, hi: role };
}
