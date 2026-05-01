const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

async function test() {
  console.log('--- Testing SMTP Configuration ---');

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

  const config = {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
  };

  if (!config.host || !config.port || !config.user || !config.pass) {
    console.error('❌ Error: Missing SMTP configuration in .env');
    console.log('Ensure you have: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS');
    process.exit(1);
  }

  console.log(`Config found: ${config.host}:${config.port} (User: ${config.user})`);

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  try {
    console.log('Connecting to SMTP server...');
    await transporter.verify();
    console.log('✅ Connection verified!');

    console.log(`Sending test email to ${config.user}...`);
    const info = await transporter.sendMail({
      from: config.from,
      to: config.user,
      subject: 'PGSMS SMTP Test',
      text: 'If you are reading this, your SMTP configuration is working correctly!',
      html: '<b>If you are reading this, your SMTP configuration is working correctly!</b>',
    });

    console.log('✅ Email sent successfully!');
    console.log('Message ID:', info.messageId);
  } catch (error) {
    console.error('❌ SMTP Error:', error.message);
    if (error.message.includes('Invalid login')) {
      console.log('\nTIP: Double check your SMTP_USER and SMTP_PASS (App Password).');
    }
  } finally {
    process.exit(0);
  }
}

test();
