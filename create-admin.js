const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function createAdmin() {
  try {
    // Check if admin already exists
    const existingAdmin = await prisma.user.findFirst({
      where: { role: 'admin' }
    });

    if (existingAdmin) {
      console.log('\n⚠️  Admin already exists:');
      console.log(`Email: ${existingAdmin.email}`);
      console.log(`User ID: ${existingAdmin.userId}`);
      await prisma.$disconnect();
      return;
    }

    // Create admin
    const hashedPassword = await bcrypt.hash('Admin@123', 12);
    
    const admin = await prisma.user.create({
      data: {
        userId: 'ADMIN001',
        fullName: 'System Admin',
        email: 'admin@hustleclickgh.com',
        phone: '0000000000',
        password: hashedPassword,
        role: 'admin',
        status: 'active',
        referralCode: 'ADMIN001',
        balance: 0,
        totalEarned: 0
      }
    });

    console.log('\n✅ Admin account created successfully!\n');
    console.log('=== ADMIN LOGIN CREDENTIALS ===');
    console.log(`Email: ${admin.email}`);
    console.log(`Password: Admin@123`);
    console.log(`User ID: ${admin.userId}`);
    console.log(`Role: ${admin.role}`);
    console.log('\n⚠️  Please change the password after first login!\n');

  } catch (error) {
    console.error('Error creating admin:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();