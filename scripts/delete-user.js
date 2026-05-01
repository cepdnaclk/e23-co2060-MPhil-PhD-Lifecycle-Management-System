const admin = require('firebase-admin');
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function deleteUser(email) {
  if (!email) {
    console.error('Please provide an email: node scripts/delete-user.js user@example.com');
    process.exit(1);
  }

  console.log(`--- Deleting User: ${email} ---`);

  // 1. Load Environment
  const envPath = path.join(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        value = value.trim().replace(/^["'](.+)["']$/, '$1');
        process.env[key] = value;
      }
    });
  }

  // 2. Init Firebase
  const serviceAccountPath = path.join(__dirname, '../../test-b069c-firebase-adminsdk-fbsvc-6298251c02.json');
  let credential;
  if (fs.existsSync(serviceAccountPath)) {
    credential = admin.credential.cert(serviceAccountPath);
  } else {
    credential = admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    });
  }
  
  if (admin.apps.length === 0) {
    admin.initializeApp({ credential });
  }

  try {
    // 3. Delete from Firebase
    try {
      const firebaseUser = await admin.auth().getUserByEmail(email);
      await admin.auth().deleteUser(firebaseUser.uid);
      console.log('✅ Deleted from Firebase Auth.');
    } catch (e) {
      console.log('ℹ️ User not found in Firebase (skipping).');
    }

    // 4. Delete from Database
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        student: true,
        supervisor: true,
        examiner: true,
        administrator: true
      }
    });

    if (!user) {
      console.log('❌ User not found in database.');
      return;
    }

    // Delete profiles
    if (user.student) await prisma.student.delete({ where: { id: user.student.id } });
    if (user.supervisor) await prisma.supervisor.delete({ where: { id: user.supervisor.id } });
    if (user.examiner) await prisma.examiner.delete({ where: { id: user.examiner.id } });
    if (user.administrator) await prisma.administrator.delete({ where: { id: user.administrator.id } });

    await prisma.user.delete({ where: { id: user.id } });
    console.log('✅ Deleted from Database.');

    console.log('\nSUCCESS: User has been completely removed.');
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

const emailToDelete = process.argv[2];
deleteUser(emailToDelete);
