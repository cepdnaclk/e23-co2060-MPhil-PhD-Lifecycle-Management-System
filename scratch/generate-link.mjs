import 'dotenv/config';
import { generateFirebasePasswordSetupLink } from "./src/lib/firebase/admin.js";

async function generateLink() {
  const email = process.argv[2];
  
  if (!email) {
    console.error("Please provide an email address. Example: npx tsx scratch/generate-link.mjs sandun@gmail.com");
    process.exit(1);
  }

  try {
    const url = await generateFirebasePasswordSetupLink(email, { url: "http://localhost:3000/login" });
    console.log("\n=============================================");
    console.log(`Firebase Setup Link for ${email}:`);
    console.log(url);
    console.log("=============================================\n");
  } catch (err) {
    console.error("Error generating link:", err);
  }
}

generateLink();
