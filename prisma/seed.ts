import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient({});

async function main() {
  console.log("🌱 Starting database seed...");

  // Create admin user
  const adminPassword = await bcrypt.hash("Admin@123", 12);
  const admin = await prisma.user.upsert({
    where: { userId: "USER000001" },
    update: {},
    create: {
      userId: "USER000001",
      fullName: "Admin User",
      email: "admin@hustleclickgh.com",
      phone: "0200000000",
      password: adminPassword,
      role: "admin",
      referralCode: "ADMIN001",
      balance: 0,
      totalEarned: 0,
    },
  });

  console.log("✅ Admin user created:", admin.userId);

  // Create sample users
  const userPassword = await bcrypt.hash("User@123", 12);
  
  const user1 = await prisma.user.upsert({
    where: { userId: "USER000002" },
    update: {},
    create: {
      userId: "USER000002",
      fullName: "Kwame Mensah",
      email: "kwame@example.com",
      phone: "0241234567",
      password: userPassword,
      role: "user",
      referralCode: "KWAME002",
      balance: 25.5,
      totalEarned: 45.5,
    },
  });

  const user2 = await prisma.user.upsert({
    where: { userId: "USER000003" },
    update: {},
    create: {
      userId: "USER000003",
      fullName: "Ama Osei",
      email: "ama@example.com",
      phone: "0249876543",
      password: userPassword,
      role: "user",
      referralCode: "AMA003",
      balance: 12.0,
      totalEarned: 32.0,
    },
  });

  console.log("✅ Sample users created");

  // Create referral relationship
  await prisma.referral.create({
    data: {
      referrerId: user1.id,
      referredId: user2.id,
      earned: 1.0,
    },
  });

  console.log("✅ Referral created");

  // Create sample surveys
  const survey1 = await prisma.survey.create({
    data: {
      title: "Customer Satisfaction Survey",
      description: "Help us understand your experience with our services",
      reward: 2.5,
      maxRespondents: 100,
      currentRespondents: 5,
      status: "active",
      visibility: "public",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      createdBy: admin.id,
      questions: {
        create: [
          {
            questionText: "How satisfied are you with our service?",
            questionType: "multiple_choice",
            options: JSON.stringify(["Very Satisfied", "Satisfied", "Neutral", "Dissatisfied", "Very Dissatisfied"]),
            required: true,
            order: 0,
          },
          {
            questionText: "What can we improve?",
            questionType: "text",
            options: null,
            required: false,
            order: 1,
          },
        ],
      },
    },
  });

  await prisma.survey.create({
    data: {
      title: "Product Feedback",
      description: "Share your thoughts on our new features",
      reward: 3.0,
      maxRespondents: 50,
      currentRespondents: 2,
      status: "active",
      visibility: "public",
      expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days
      createdBy: admin.id,
      questions: {
        create: [
          {
            questionText: "Which feature do you use most?",
            questionType: "multiple_choice",
            options: JSON.stringify(["Dashboard", "Surveys", "Withdrawals", "Referrals"]),
            required: true,
            order: 0,
          },
          {
            questionText: "Rate the app interface (1-5)",
            questionType: "rating",
            options: JSON.stringify(["1", "2", "3", "4", "5"]),
            required: true,
            order: 1,
          },
        ],
      },
    },
  });

  console.log("✅ Sample surveys created");

  // Create sample survey responses
  await prisma.surveyResponse.create({
    data: {
      surveyId: survey1.id,
      userId: user1.id,
      answers: JSON.stringify({
        0: "Very Satisfied",
        1: "Great service, keep it up!",
      }),
      rewarded: true,
    },
  });

  console.log("✅ Sample survey responses created");

  // Create sample withdrawals
  await prisma.withdrawal.create({
    data: {
      userId: user1.id,
      amount: 20.0,
      paymentMethod: "MTN Mobile Money",
      mobileNumber: "0241234567",
      accountName: "Kwame Mensah",
      status: "pending",
    },
  });

  await prisma.withdrawal.create({
    data: {
      userId: user2.id,
      amount: 20.0,
      paymentMethod: "Vodafone Cash",
      mobileNumber: "0249876543",
      accountName: "Ama Osei",
      status: "approved",
      processedAt: new Date(),
      notes: "Processed successfully",
    },
  });

  console.log("✅ Sample withdrawals created");

  console.log("\n🎉 Database seed completed!");
  console.log("\n📝 Login Credentials:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("👨‍💼 ADMIN:");
  console.log("   User ID: USER000001");
  console.log("   Password: Admin@123");
  console.log("\n👤 SAMPLE USER 1:");
  console.log("   User ID: USER000002");
  console.log("   Password: User@123");
  console.log("\n👤 SAMPLE USER 2:");
  console.log("   User ID: USER000003");
  console.log("   Password: User@123");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main()
  .catch((e) => {
    console.error("❌ Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
