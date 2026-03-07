// Script to generate personalCallCode for existing users who don't have one
// Run with: node update-call-codes.js
/* eslint-disable @typescript-eslint/no-require-imports */

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// Same logic as in register route - avoiding confusing chars
function generatePersonalCallCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function main() {
  // Find all users without a personalCallCode
  const usersWithoutCode = await prisma.user.findMany({
    where: { personalCallCode: null },
    select: { id: true, fullName: true, email: true },
  });

  console.log(`Found ${usersWithoutCode.length} users without a call code`);

  for (const user of usersWithoutCode) {
    let code;
    let attempts = 0;

    // Try to generate a unique code (retry if collision)
    while (attempts < 10) {
      code = generatePersonalCallCode();
      const existing = await prisma.user.findUnique({
        where: { personalCallCode: code },
      });
      if (!existing) break;
      attempts++;
    }

    if (attempts >= 10) {
      console.error(`Failed to generate unique code for ${user.email}`);
      continue;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { personalCallCode: code },
    });

    console.log(`Updated ${user.fullName} (${user.email}) → ${code}`);
  }

  console.log("Done!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
