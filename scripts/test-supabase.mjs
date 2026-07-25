import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Parse .env file manually
function loadEnv() {
  try {
    const envPath = path.resolve('.env');
    const envFile = fs.readFileSync(envPath, 'utf8');
    const envs = envFile.split('\n');
    for (const line of envs) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        // Remove surrounding quotes if they exist
        if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
          value = value.replace(/\\n/gm, '\n');
        }
        process.env[key] = value.replace(/(^['"]|['"]$)/g, '');
      }
    }
  } catch (error) {
    console.error("Failed to load .env file:", error);
  }
}

async function testSupabaseConnection() {
  loadEnv();

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucketName = process.env.SUPABASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET;

  console.log("Checking Supabase Environment Variables...");
  if (!supabaseUrl) {
    console.error("❌ SUPABASE_URL is missing.");
    return;
  }
  if (!supabaseKey) {
    console.error("❌ SUPABASE_SERVICE_ROLE_KEY is missing.");
    return;
  }
  if (!bucketName) {
    console.error("❌ SUPABASE_STORAGE_BUCKET is missing.");
    return;
  }

  console.log(`URL configured: ${supabaseUrl}`);
  console.log(`Bucket configured: ${bucketName}`);
  console.log("Service key configured: Yes (Hidden)");
  
  console.log("\nConnecting to Supabase...");
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log(`\nAttempting to query bucket: '${bucketName}'...`);
  
  // Test 1: Check if bucket exists/is accessible by listing contents of a non-existent folder
  const { error } = await supabase.storage.from(bucketName).list('test-connection-path-do-not-create', {
    limit: 1,
    offset: 0,
  });

  if (error) {
    console.error("❌ Connection failed!");
    console.error(error);
    return;
  }

  console.log("✅ Connection successful! The bucket is accessible with the provided credentials.");
  
  // Test 2: Attempt to generate a signed upload URL to ensure signing key is valid
  const { error: uploadError } = await supabase.storage
    .from(bucketName)
    .createSignedUploadUrl('test-connection/test-file.txt');
    
  if (uploadError) {
    console.error("❌ Failed to generate upload URL. Check bucket permissions and configurations.");
    console.error(uploadError);
    return;
  }
  
  console.log("✅ Upload URL generation successful! The backend has full permissions to manage storage.");
}

testSupabaseConnection().catch(console.error);
