import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

function loadEnv() {
  try {
    const envPath = path.resolve('.env');
    const envFile = fs.readFileSync(envPath, 'utf8');
    const envs = envFile.split('\n');
    for (const line of envs) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        process.env[match[1]] = match[2].replace(/(^['"]|['"]$)/g, '');
      }
    }
  } catch {}
}

async function testUpload() {
  loadEnv();
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucketName = process.env.SUPABASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET;

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log("Generating signed upload URL...");
  const { data, error } = await supabase.storage
    .from(bucketName)
    .createSignedUploadUrl('test-put-upload.txt');
    
  if (error || !data) {
    console.error("Failed to generate URL:", error);
    return;
  }

  console.log("URL:", data.signedUrl);

  console.log("Attempting PUT request to the signed URL (simulating frontend)...");
  
  // Try a native fetch PUT request
  const response = await fetch(data.signedUrl, {
    method: 'PUT',
    body: 'Hello World from direct PUT request',
    headers: {
      'Content-Type': 'text/plain',
    }
  });

  console.log("Response status:", response.status);
  console.log("Response text:", await response.text());

  if (response.ok) {
    console.log("✅ PUT upload successful!");
  } else {
    console.log("❌ PUT upload failed.");
  }
}

testUpload().catch(console.error);
