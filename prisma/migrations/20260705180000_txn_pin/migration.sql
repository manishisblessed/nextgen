-- Transaction PIN: bcrypt-hashed 4-6 digit PIN verified on every
-- money-moving action, with failure counting + temporary lockout.
ALTER TABLE "User" ADD COLUMN     "txnPinHash" TEXT,
ADD COLUMN     "txnPinSetAt" TIMESTAMP(3),
ADD COLUMN     "txnPinFailedAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "txnPinLockedUntil" TIMESTAMP(3);
