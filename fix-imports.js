// Fix import paths for API_URL
const fs = require('fs');
const path = require('path');
const glob = require('glob');

const files = glob.sync('src/**/*.{js,jsx}', {
  ignore: ['**/node_modules/**', '**/dist/**', '**/config.js']
});

files.forEach(filePath => {
  let content = fs.readFileSync(filePath, 'utf8');
  
  if (!content.includes("import { API_URL }")) {
    return; // Skip files without API_URL import
  }
  
  // Calculate correct relative path
  const dir = path.dirname(filePath);
  const levels = dir.split('/').length - 1; // How many levels deep from src/
  const correctImport = '../'.repeat(levels) + 'config';
  
  // Replace any existing API_URL import with correct path
  content = content.replace(
    /import { API_URL } from ['"]\.\.?\/.*?config['"]/g,
    `import { API_URL } from '${correctImport}'`
  );
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✅ Fixed: ${filePath} -> ${correctImport}`);
});

console.log('\n🎉 All import paths fixed!');
