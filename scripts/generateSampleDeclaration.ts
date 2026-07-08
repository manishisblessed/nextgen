import { writeFile } from "fs/promises";
import {
  generateSelfDeclarationPdf,
  generateSuccessorDeclarationPdf,
} from "../src/lib/declaration/generatePdf";
import type { DeclarationData } from "../src/lib/declaration/types";

// Sample data mirroring a Super Distributor onboarding a Master Distributor.
const data: DeclarationData = {
  date: "08/07/2026",
  creatorName: "Kumar Manish",
  creatorId: "4EIKKMPK",
  creatorCompany: "Shiv Ram Enterprises",
  creatorMobile: "9717414195",
  creatorEmail: "kumar.manish@example.com",
  creatorAddress: "E-1/427/428, Shiv Ram Park, Nangloi, West Delhi, Delhi, 110041",
  creatorPan: "ABCDE1234F",
  creatorAadhaar: "XXXX-XXXX-1234",
  creatorRole: "SUPER_DISTRIBUTOR",

  onboardeeName: "Ramesh Chand",
  onboardeeId: "9KLMN012",
  onboardeeBusiness: "Ramesh Mobile Point",
  onboardeeMobile: "9812345678",
  onboardeeEmail: "ramesh@example.com",
  onboardeeAddress: "Shop 12, Main Bazaar, Rohini, North West Delhi, Delhi, 110085",
  onboardeePan: "PQRSX6789K",
  onboardeeAadhaar: "XXXX-XXXX-5678",
  onboardeeRole: "MASTER_DISTRIBUTOR",
};

async function main() {
  const self = await generateSelfDeclarationPdf(data);
  await writeFile("declaration-sample-self.pdf", Buffer.from(self));
  console.log(`OK: declaration-sample-self.pdf (${self.length} bytes)`);

  const successor = await generateSuccessorDeclarationPdf(data);
  await writeFile("declaration-sample-successor.pdf", Buffer.from(successor));
  console.log(`OK: declaration-sample-successor.pdf (${successor.length} bytes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
