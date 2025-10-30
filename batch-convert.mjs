// batch-convert.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob'; // Used to find all files

// Import the converter
import * as converter from '@doenet/v06-to-v07';

// ES Modules don't have __dirname, so we create it
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- 1. CONFIGURE YOUR PATHS HERE ---
// (Use relative paths from where this script is)
const INPUT_DIR = './vM_test_files';    // <-- PUT YOUR FOLDER OF V0.6 FILES HERE
const OUTPUT_DIR = './converted_files'; // <-- A NEW FOLDER WILL BE CREATED HERE
// ------------------------------------

// Resolve the absolute paths
const fullInputPath = path.resolve(__dirname, INPUT_DIR);
const fullOutputPath = path.resolve(__dirname, OUTPUT_DIR);

async function runBatch() {
  console.log(`Searching for .doenet files in: ${fullInputPath}`);
  
  // Find all .doenet files, even in subfolders
  const files = await glob(`${fullInputPath}/**/*.doenet`);
  
  console.log(`Found ${files.length} files to convert.`);

  if (files.length === 0) {
    console.warn("No files found. Check your INPUT_DIR path.");
    return;
  }

  // Ensure the output directory exists
  if (!fs.existsSync(fullOutputPath)) {
    fs.mkdirSync(fullOutputPath, { recursive: true });
    console.log(`Created output directory: ${fullOutputPath}`);
  }

  // Loop over every file found
  for (const filePath of files) {
    const baseName = path.basename(filePath);
    const outPath = path.join(fullOutputPath, baseName);
    
    console.log(`Converting: ${baseName}...`);

    try {
      const v0_6_content = fs.readFileSync(filePath, 'utf8');
      
      // Run the same conversion logic from our test
      const resultObject = await converter.updateSyntaxFromV06toV07(v0_6_content);
      const v0_7_content = resultObject.xml;

      if (typeof v0_7_content !== 'string') {
        throw new Error(`The 'xml' property was not a string!`);
      }
      
      // Save the new file
      fs.writeFileSync(outPath, v0_7_content);
      console.log(`  ✅ Success: ${baseName}`);

    } catch (error) {
      // Log the error but continue with the next file
      console.error(`  ❌ FAILED: ${baseName} | Error: ${error.message}`);
    }
  }

  console.log('\n--- Batch conversion complete! ---');
  console.log(`All converted files are in: ${fullOutputPath}`);
}

// Run the script
runBatch();