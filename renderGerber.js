// renderGerber.js
import fs from 'fs-extra';
import path from 'path';
import unzipper from 'unzipper';
import pcbStackup from 'pcb-stackup';
import detect from 'whats-that-gerber';

/**
 * Renders top.svg and bottom.svg from uploaded Gerber ZIP
 * @param {string} zipPath Path to uploaded Gerber ZIP file
 * @param {string} outputDir Path to store rendered SVGs
 * @returns {Promise<{topSVG: string, bottomSVG: string}>}
 */
export async function renderSVGsFromZip(zipPath, outputDir) {
  const extractPath = path.join(outputDir, 'unzipped');
  await fs.ensureDir(extractPath);

  // Extract archive
  await new Promise((resolve, reject) => {
    fs.createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: extractPath }))
      .on('close', resolve)
      .on('error', reject);
  });

  // Recursively collect all file paths
  async function collectFiles(dir) {
    const entries = await fs.readdir(dir);
    const files = [];
    for (const entry of entries) {
      const full = path.join(dir, entry);
      const stat = await fs.stat(full);
      if (stat.isDirectory()) {
        files.push(...await collectFiles(full));
      } else {
        files.push(full);
      }
    }
    return files;
  }

  const filePaths = await collectFiles(extractPath);
  const layerInputs = [];

  for (const filePath of filePaths) {
    const filename = path.basename(filePath);
    const props = detect(filename.toLowerCase());
    if (!props) continue;

    const content = await fs.readFile(filePath, 'utf8');
    layerInputs.push({
      filename,
      side: props.side,
      type: props.type,
      gerber: content
    });
  }

  if (layerInputs.length === 0) {
    throw new Error('No valid Gerber layers detected.');
  }

  // Attempt to generate stackup
  let stackup;
  try {
    stackup = await pcbStackup('MyBoard', layerInputs);
  } catch (err) {
    throw new Error(`Stackup rendering failed: ${err.message}`);
  }

  // Write SVG files
  const topSVGPath = path.join(outputDir, 'top.svg');
  const bottomSVGPath = path.join(outputDir, 'bottom.svg');
  await fs.writeFile(topSVGPath, stackup.top.svg);
  await fs.writeFile(bottomSVGPath, stackup.bottom.svg);

  return { topSVG: topSVGPath, bottomSVG: bottomSVGPath };
}
