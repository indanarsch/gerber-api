// renderGerber.js
import fs from 'fs-extra';
import path from 'path';
import unzipper from 'unzipper';
import pify from 'pify';
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

  // Unzip the uploaded file
  await new Promise((resolve, reject) => {
    fs.createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: extractPath }))
      .on('close', resolve)
      .on('error', reject);
  });

  const files = await fs.readdir(extractPath);
  const layerInputs = [];

  for (const file of files) {
    const fullPath = path.join(extractPath, file);
    const content = await fs.readFile(fullPath, 'utf8');

    const props = detect(file);
    if (!props) continue;

    layerInputs.push({
      filename: file,
      side: props.side,
      type: props.type,
      gerber: content,
    });
  }

  // Ensure we have at least top/bottom copper
  const required = ['top.copper', 'bottom.copper'];
  const found = layerInputs.map(l => `${l.side}.${l.type}`);
  const missing = required.filter(r => !found.includes(r));
  if (missing.length) {
    throw new Error('Missing required layers: ' + missing.join(', '));
  }

  const stackup = await pcbStackup('MyBoard', layerInputs);

  const topSVGPath = path.join(outputDir, 'top.svg');
  const bottomSVGPath = path.join(outputDir, 'bottom.svg');

  await fs.writeFile(topSVGPath, stackup.top.svg);
  await fs.writeFile(bottomSVGPath, stackup.bottom.svg);

  return { topSVG: topSVGPath, bottomSVG: bottomSVGPath };
}
