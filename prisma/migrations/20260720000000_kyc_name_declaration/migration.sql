-- AddColumn: applicant self-declaration for name mismatches
ALTER TABLE "Kyc" ADD COLUMN IF NOT EXISTS "nameDeclarationAccepted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Kyc" ADD COLUMN IF NOT EXISTS "nameDeclarationAt" TIMESTAMP(3);
