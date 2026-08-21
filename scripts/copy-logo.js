/**
 * copy-logo.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Copies the project logo from the artifacts/ folder (project root) into
 * assets/images/logo.jpg.
 *
 * All paths are resolved relative to the project root using __dirname so this
 * script works correctly on any machine or drive — no hardcoded user paths.
 *
 * Usage:
 *   node scripts/copy-logo.js
 *
 * Place your source logo at:
 *   <project-root>/artifacts/logo.jpg
 *
 * The destination is always:
 *   <project-root>/assets/images/logo.jpg
 */

const fs   = require('fs');
const path = require('path');

// ── Paths (all relative to the project root) ──────────────────────────────────
const projectRoot = path.join(__dirname, '..'); // scripts/ is one level below root
const src         = path.join(projectRoot, 'artifacts', 'logo.jpg');
const destDir     = path.join(projectRoot, 'assets', 'images');
const dest        = path.join(destDir, 'logo.jpg');

// ── Copy ──────────────────────────────────────────────────────────────────────
try {
  // Ensure the destination directory exists
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
    console.log('Created directory: ' + destDir);
  }

  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log('✅ Logo copied successfully to: ' + dest);
  } else {
    console.warn(
      '⚠️  Source logo not found at: ' + src + '\n' +
      '   Please place your logo.jpg inside the artifacts/ folder at the project root.'
    );
  }
} catch (err) {
  console.error('❌ Error copying logo:', err.message);
  process.exit(1);
}
