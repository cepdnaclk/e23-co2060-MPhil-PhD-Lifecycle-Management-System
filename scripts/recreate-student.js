const admin = require('firebase-admin');
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function run() {
  const email = 'student@gmail.com';
  const password = 'student@123';

  console.log(`--- Recreating Student: ${email} ---`);

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
    // 3. Delete from Firebase if exists
    try {
      const oldUser = await admin.auth().getUserByEmail(email);
      await admin.auth().deleteUser(oldUser.uid);
      console.log('✅ Deleted existing user from Firebase.');
    } catch (e) {
      console.log('ℹ️ User not found in Firebase (skipping deletion).');
    }

    // 4. Delete from Database if exists
    const dbUser = await prisma.user.findUnique({
      where: { email },
      include: { student: true }
    });

    if (dbUser) {
      if (dbUser.student) {
        await prisma.student.delete({ where: { id: dbUser.student.id } });
        console.log('✅ Deleted Student profile from Database.');
      }
      await prisma.user.delete({ where: { id: dbUser.id } });
      console.log('✅ Deleted User record from Database.');
    } else {
      console.log('ℹ️ User not found in Database (skipping deletion).');
    }

    // 5. Create in Firebase
    const newUser = await admin.auth().createUser({
      email,
      password,
      displayName: 'Test Student',
    });
    console.log(`✅ Created new user in Firebase (UID: ${newUser.uid})`);

    // 6. Set Custom Claims
    await admin.auth().setCustomUserClaims(newUser.uid, { role: 'STUDENT' });
    console.log('✅ Set custom claim: role=STUDENT');

    // 7. Create in Database
    await prisma.user.create({
      data: {
        email,
        displayName: 'Test Student',
        firebaseUid: newUser.uid,
        role: 'STUDENT',
        student: {
          create: {
            programType: 'MPHIL',
            academicStatus: 'ACTIVE',
            enrollmentDate: new Date(),
          }
        }
      }
    });
    console.log('✅ Created new records in Database.');

    console.log('\nSUCCESS: Student has been recreated and synced!');
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

run();
