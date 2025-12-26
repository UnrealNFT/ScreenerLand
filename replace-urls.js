// Script Node.js pour remplacer localhost par API_URL dans tous les fichiers
const fs = require('fs');
const path = require('path');

const filesToUpdate = [
  'src/components/StoryUpload.jsx',
  'src/pages/Home.jsx',
  'src/pages/AdminCleanup.jsx',
  'src/pages/FeedPage.jsx',
  'src/pages/ProfilePage.jsx',
  'src/services/wallet.service.js',
  'src/contexts/WalletContext.jsx'
];

filesToUpdate.forEach(filePath => {
  const fullPath = path.join(__dirname, filePath);
  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  Skipping ${filePath} (not found)`);
    return;
  }
  
  let content = fs.readFileSync(fullPath, 'utf8');
  
  // Ajouter l'import si pas déjà présent
  if (!content.includes("import { API_URL } from")) {
    const importMatch = content.match(/(import[^\n]+\n)+/);
    if (importMatch) {
      const lastImport = importMatch[0];
      const importToAdd = filePath.includes('services/') 
        ? "import { API_URL } from '../config'\n"
        : filePath.includes('contexts/') 
          ? "import { API_URL } from '../config'\n"
          : "import { API_URL } from '../config'\n";
      content = content.replace(lastImport, lastImport + importToAdd);
    }
  }
  
  // Remplacer http://localhost:3001 par ${API_URL}
  content = content.replace(/http:\/\/localhost:3001/g, '${API_URL}');
  content = content.replace(/('|")http:\/\/localhost:3001/g, '`${API_URL}');
  content = content.replace(/http:\/\/localhost:3001('|")/g, '${API_URL}`');
  
  fs.writeFileSync(fullPath, content, 'utf8');
  console.log(`✅ Updated: ${filePath}`);
});

console.log('\n🎉 All files updated!');
