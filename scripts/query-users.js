const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      userId: true,
      fullName: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      balance: true,
      totalEarned: true,
      referralCode: true,
      referredBy: true,
      createdAt: true
    }
  });
  
  console.log('\n=== ALL USERS IN DATABASE ===\n');
  
  if (users.length === 0) {
    console.log('No users found in database.');
  } else {
    users.forEach((user, i) => {
      console.log(`--- User ${i + 1} (${user.role.toUpperCase()}) ---`);
      console.log(`ID: ${user.id}`);
      console.log(`User ID: ${user.userId}`);
      console.log(`Name: ${user.fullName}`);
      console.log(`Email: ${user.email}`);
      console.log(`Phone: ${user.phone}`);
      console.log(`Role: ${user.role}`);
      console.log(`Status: ${user.status}`);
      console.log(`Balance: GH₵${user.balance.toFixed(2)}`);
      console.log(`Total Earned: GH₵${user.totalEarned.toFixed(2)}`);
      console.log(`Referral Code: ${user.referralCode}`);
      console.log(`Referred By: ${user.referredBy || 'None'}`);
      console.log(`Created: ${user.createdAt}`);
      console.log('');
    });
  }
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
