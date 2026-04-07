import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Helper functions
  function generateUserId(): string {
    const digits = Math.floor(1000 + Math.random() * 9000).toString();
    return `USER${digits}`;
  }

  function generateReferralCode(): string {
    return Math.random().toString(36).substr(2, 8).toUpperCase();
  }

  function generatePersonalCallCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // Create Admin User
  const adminPassword = await hash("admin123", 12);
  const admin = await prisma.user.create({
    data: {
      userId: "ADMIN001",
      fullName: "Admin",
      email: "admin@hustleclickgh.com",
      phone: "+233501234567",
      password: adminPassword,
      role: "admin",
      status: "active",
      referralCode: generateReferralCode(),
      personalCallCode: generatePersonalCallCode(),
    },
  });
  console.log("✅ Admin created:", admin.email, "(password: admin123)");

  // Create One Sample User
  const userPassword = await hash("user123", 12);
  const user = await prisma.user.create({
    data: {
      userId: generateUserId(),
      fullName: "Sample User",
      email: "user@example.com",
      phone: "+233502345678",
      password: userPassword,
      role: "user",
      status: "active",
      referralCode: generateReferralCode(),
      personalCallCode: generatePersonalCallCode(),
    },
  });
  console.log("✅ User created:", user.email, "(password: user123)");

  console.log("🎉 Database seeding completed!");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

