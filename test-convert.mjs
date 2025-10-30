// test-convert.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Import all exports into an object named 'converter'
import * as converter from '@doenet/v06-to-v07';

// ES Modules don't have __dirname, so we create it
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runConversion() {
  // Define your test files
  const v0_6_filePath = path.join(__dirname, 'vM_test_files/old_file.doenet');
  const v0_7_filePath = path.join(__dirname, 'vM_test_files/new_file.doenet');

  console.log(`Reading file: ${v0_6_filePath}`);
  const v0_6_content = fs.readFileSync(v0_6_filePath, 'utf8');

  try {
    // 2. Run the conversion
    console.log('Converting...');
    
    // 3. Get the result object
    const resultObject = await converter.updateSyntaxFromV06toV07(v0_6_content); 
    
    // --- 4. THIS IS THE FIX ---
    // Access the 'xml' property we discovered
    const v0_7_content = resultObject.xml; 

    if (typeof v0_7_content !== 'string') {
      throw new Error(`The 'xml' property was not a string!`);
    }
    
    // 5. Save the result
    fs.writeFileSync(v0_7_filePath, v0_7_content);
    console.log(`✅ Success! Converted file saved to: ${v0_7_filePath}`);

  } catch (error) {
    console.error('❌ Conversion failed:', error);
  }
}

// CALL THE ASYNC FUNCTION
runConversion();