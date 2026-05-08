const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const staticEntries = [
  'index.html',
  'manifest.json',
  'service-worker.js',
  'css',
  'js',
  'data',
  'assets'
];

function insideRoot(targetPath) {
  const resolved = path.resolve(targetPath);
  return resolved === rootDir || resolved.startsWith(rootDir + path.sep);
}

function copyEntry(entry) {
  const source = path.join(rootDir, entry);
  const target = path.join(distDir, entry);

  if (!fs.existsSync(source)) {
    throw new Error(`Required static entry is missing: ${entry}`);
  }

  fs.cpSync(source, target, {
    recursive: true,
    force: true,
    errorOnExist: false
  });
}

function assertBuiltFile(relativePath) {
  const target = path.join(distDir, relativePath);
  if (!fs.existsSync(target)) {
    throw new Error(`Build output is missing ${relativePath}`);
  }
}

if (!insideRoot(distDir)) {
  throw new Error('Refusing to write dist outside the project root.');
}

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

for (const entry of staticEntries) copyEntry(entry);

assertBuiltFile('index.html');
assertBuiltFile('manifest.json');
assertBuiltFile('service-worker.js');
assertBuiltFile(path.join('css', 'design-system.css'));
assertBuiltFile(path.join('js', 'app.js'));
assertBuiltFile(path.join('data', 'subject-mapping.js'));
assertBuiltFile(path.join('assets', 'logo.png'));

console.log(`Static site built in ${path.relative(rootDir, distDir)}.`);
