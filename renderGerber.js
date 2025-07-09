import fs from 'fs-extra';
import path from 'path';
import unzipper from 'unzipper';
import pcbStackup from 'pcb-stackup';
import detect from 'whats-that-gerber';

/**
 * Recursively get all files inside a directory
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function getAllFiles(dir) {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    dirents.map((dirent) => {
      const res = path.resolve(dir, dirent.name);
      return dirent.isDirectory() ? getAllFiles(res) : res;
    })
  );
  return Array.prototype.concat(...files);
}

/**
 * Renders top.svg and bottom.svg from uploaded Gerber ZIP
 * @param {string} zipPath Path to uploaded Gerber ZIP file
 * @param {string} outputDir Path to store rendered SVGs
 * @returns {Promise<{topSVG: string, bottomSVG: string}>}
 */
export async function renderSVGsFromZip(zipPath, outputDir) {
  const extractPath = path.join(outputDir, 'unzipped');
  await fs.ensureDir(extractPath);

  // ✅ Unzip the uploaded file
  await new Promise((resolve, reject) => {
    fs.createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: extractPath }))
      .on('close', resolve)
      .on('error', reject);
  });

  // ✅ Recursively get all files
  const allFiles = await getAllFiles(extractPath);
  const layerInputs = [];

  for (const filePath of allFiles) {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) continue;

    const content = await fs.readFile(filePath, 'utf8');
    const filename = path.basename(filePath);
    const props = detect(filename);
    if (!props) continue;

    layerInputs.push({
      filename,
      side: props.side,
      type: props.type,
      gerber: content,
    });
  }

  // ✅ Ensure top and bottom copper layers exist
  const required = ['top.copper', 'bottom.copper'];
  const found = layerInputs.map((l) => `${l.side}.${l.type}`);
  const missing = required.filter((r) => !found.includes(r));
  if (missing.length) {
    throw new Error('Missing required layers: ' + missing.join(', '));
  }

  const stackup = await pcbStackup('MyBoard', layerInputs);

  const topSVGPath = path.join(outputDir, 'top.svg');
  const bottomSVGPath = path.join(outputDir, 'bottom.svg');

  await fs.writeFile(topSVGPath, stackup.top.svg);
  await fs.writeFile(bottomSVGPath, stackup.bottom.svg);

  return {
    topSVG: topSVGPath,
    bottomSVG: bottomSVGPath
  };
}
