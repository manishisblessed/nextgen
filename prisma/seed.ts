import { PrismaClient, Role, UserStatus, ServiceCode } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedServiceRoutes } from "../src/lib/services/catalog";

const prisma = new PrismaClient();

async function main() {
  console.log("→ Seeding NextGenPay database…");

  // ── Master Admin (primary platform owner) ──
  const masterAdminHash = await bcrypt.hash("9090702707", 12);
  const masterAdmin = await prisma.user.upsert({
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

  // ── Role network accounts (Lion_9090702707) ──
  const roleHash = await bcrypt.hash("Lion_9090702707", 12);

  const demoSD = await prisma.user.upsert({
    where: { email: "manishspecial009@outlook.com" },
    update: {
      name: "Manish K Shah",
      passwordHash: roleHash,
      role: Role.SUPER_DISTRIBUTOR,
      status: UserStatus.ACTIVE,
      walletBalance: 0,
    },
    create: {
      name: "Manish K Shah",
      email: "manishspecial009@outlook.com",
      phone: "+919000000201",
      passwordHash: roleHash,
      role: Role.SUPER_DISTRIBUTOR,
      status: UserStatus.ACTIVE,
      walletBalance: 0,
      parentId: masterAdmin.id
    }
  });

  const demoMD = await prisma.user.upsert({
    where: { email: "manishspecial009@gmail.com" },
    update: {
      name: "Manish Kumar",
      passwordHash: roleHash,
      role: Role.MASTER_DISTRIBUTOR,
      status: UserStatus.ACTIVE,
      walletBalance: 0,
    },
    create: {
      name: "Manish Kumar",
      email: "manishspecial009@gmail.com",
      phone: "+919000000202",
      passwordHash: roleHash,
      role: Role.MASTER_DISTRIBUTOR,
      status: UserStatus.ACTIVE,
      walletBalance: 0,
      parentId: demoSD.id
    }
  });

  const demoDT = await prisma.user.upsert({
    where: { email: "manishkshah27@outlook.com" },
    update: {
      name: "M K Shah",
      passwordHash: roleHash,
      role: Role.DISTRIBUTOR,
      status: UserStatus.ACTIVE,
      walletBalance: 0,
    },
    create: {
      name: "M K Shah",
      email: "manishkshah27@outlook.com",
      phone: "+919000000203",
      passwordHash: roleHash,
      role: Role.DISTRIBUTOR,
      status: UserStatus.ACTIVE,
      walletBalance: 0,
      parentId: demoMD.id
    }
  });

  await prisma.user.upsert({
    where: { email: "manishisspecial@gmail.com" },
    update: {
      name: "Manish Shah",
      passwordHash: roleHash,
      role: Role.RETAILER,
      status: UserStatus.ACTIVE,
      shopName: null,
      walletBalance: 0,
    },
    create: {
      name: "Manish Shah",
      email: "manishisspecial@gmail.com",
      phone: "+919000000204",
      passwordHash: roleHash,
      role: Role.RETAILER,
      status: UserStatus.ACTIVE,
      city: "Mumbai",
      state: "Maharashtra",
      pincode: "400001",
      walletBalance: 0,
      parentId: demoDT.id
    }
  });

  // ── Operators (master data for recharge/bill services) ──
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

  // ── Service routes (On/Off Services panel) ──
  const routes = await seedServiceRoutes(prisma);
  console.log(`  Service routes: +${routes.created} new, ${routes.updated} refreshed`);

  console.log("✓ Seed complete.");
  console.log("  Master Admin:        manish@shahworks.com / 9090702707");
  console.log("");
  console.log("  Role accounts (password: Lion_9090702707):");
  console.log("  Super Distributor:   manishspecial009@outlook.com  (Manish K Shah)");
  console.log("  Master Distributor:  manishspecial009@gmail.com    (Manish Kumar)");
  console.log("  Distributor:         manishkshah27@outlook.com     (M K Shah)");
  console.log("  Retailer:            manishisspecial@gmail.com     (Manish Shah)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
