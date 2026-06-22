import { PrismaClient, Role, UserStatus, ServiceCode } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("→ Seeding NextGenPay database…");

  const demoHash = await bcrypt.hash("Demo@1234", 10);

  // ── Master Admin (primary platform owner) ──
  const masterAdminHash = await bcrypt.hash("9090702707", 12);
  await prisma.user.upsert({
    where: { email: "manish@shahworks.com" },
    update: { passwordHash: masterAdminHash, status: UserStatus.ACTIVE },
    create: {
      name: "Manish Shah",
      email: "manish@shahworks.com",
      phone: "+919090702707",
      passwordHash: masterAdminHash,
      role: Role.MASTER_ADMIN,
      status: UserStatus.ACTIVE,
      shopName: "ShahWorks HQ"
    }
  });

  // ── Admin ──
  const adminHash = await bcrypt.hash("9090702705", 12);
  const admin = await prisma.user.upsert({
    where: { email: "support@grandhr.in" },
    update: { passwordHash: adminHash, status: UserStatus.ACTIVE },
    create: {
      name: "GrandHR Admin",
      email: "support@grandhr.in",
      phone: "+919090702705",
      passwordHash: adminHash,
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
      shopName: "NextGenPay HQ"
    }
  });

  // ── Legacy demo accounts (kept for testing) ──
  await prisma.user.upsert({
    where: { email: "masteradmin@jmpnextgenpay.com" },
    update: {},
    create: {
      name: "JMP Master Admin",
      email: "masteradmin@jmpnextgenpay.com",
      phone: "+919000000051",
      passwordHash: demoHash,
      role: Role.MASTER_ADMIN,
      status: UserStatus.ACTIVE,
      shopName: "NextGenPay HQ"
    }
  });

  const master = await prisma.user.upsert({
    where: { email: "master@jmpnextgenpay.com" },
    update: {},
    create: {
      name: "Neha Kapoor",
      email: "master@jmpnextgenpay.com",
      phone: "+919000000031",
      passwordHash: demoHash,
      role: Role.MASTER_DISTRIBUTOR,
      status: UserStatus.ACTIVE,
      walletBalance: 2148000
    }
  });

  const distributor = await prisma.user.upsert({
    where: { email: "distributor@jmpnextgenpay.com" },
    update: {},
    create: {
      name: "Rohit Verma",
      email: "distributor@jmpnextgenpay.com",
      phone: "+919000000021",
      passwordHash: demoHash,
      role: Role.DISTRIBUTOR,
      status: UserStatus.ACTIVE,
      walletBalance: 482300,
      parentId: master.id
    }
  });

  await prisma.user.upsert({
    where: { email: "retailer@jmpnextgenpay.com" },
    update: {},
    create: {
      name: "Aman Sharma",
      email: "retailer@jmpnextgenpay.com",
      phone: "+919898000000",
      passwordHash: demoHash,
      role: Role.RETAILER,
      status: UserStatus.ACTIVE,
      shopName: "Sharma Mobile World",
      city: "New Delhi",
      state: "Delhi",
      pincode: "110085",
      walletBalance: 28450,
      parentId: distributor.id
    }
  });

  // sample operators
  const ops = [
    { service: ServiceCode.RECHARGE_MOBILE, name: "Jio", code: "JIO" },
    { service: ServiceCode.RECHARGE_MOBILE, name: "Airtel", code: "AIRTEL" },
    { service: ServiceCode.RECHARGE_MOBILE, name: "Vi", code: "VI" },
    { service: ServiceCode.RECHARGE_MOBILE, name: "BSNL", code: "BSNL" },
    { service: ServiceCode.RECHARGE_DTH, name: "Tata Play", code: "TATA_PLAY" },
    { service: ServiceCode.RECHARGE_DTH, name: "Dish TV", code: "DISH" },
    { service: ServiceCode.BILL_ELECTRICITY, name: "BSES Rajdhani", code: "BSES_R" },
    { service: ServiceCode.BILL_ELECTRICITY, name: "Tata Power Delhi", code: "TATA_DEL" },
    { service: ServiceCode.BILL_GAS, name: "Indane", code: "INDANE" },
    { service: ServiceCode.BILL_GAS, name: "HP Gas", code: "HP_GAS" }
  ];
  for (const o of ops) {
    await prisma.operator.upsert({
      where: { code: o.code },
      update: {},
      create: o
    });
  }

  console.log("✓ Seed complete.");
  console.log("  Master Admin: manish@shahworks.com / 9090702707");
  console.log("  Admin:        support@grandhr.in / 9090702705");
  console.log("  Demo users:   Demo@1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
