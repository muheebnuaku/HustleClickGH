import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
const prisma = new PrismaClient();

async function main() {
  console.log("🗑️  Clearing database...");
  
  await prisma.callRecording.deleteMany({});
  await prisma.dataSubmission.deleteMany({});
  await prisma.dataProject.deleteMany({});
  await prisma.surveyResponse.deleteMany({});
  await prisma.surveyQuestion.deleteMany({});
  await prisma.survey.deleteMany({});
  await prisma.withdrawal.deleteMany({});
  await prisma.referral.deleteMany({});
  await prisma.callSession.deleteMany({});
  await prisma.activityLog.deleteMany({});
  await prisma.user.deleteMany({});
  
  console.log("✅ Database cleared!");
}

main()
  .catch(e => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
