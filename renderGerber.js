// renderGerber.js
import fs from 'fs-extra';
import path from 'path';
import unzipper from 'unzipper';
import pcbStackup from 'pcb-stackup';
import detect from 'whats-that-gerber';

/**
 * Advanced layer detection supporting multiple EDA tools
 * @param {string} filename
 * @returns {null|{side: string, type: string}}
 */
function detectLayer(filename) {
  const name = filename.toLowerCase();
  const base = path.basename(name);

  const fallback = (side, type) => ({ side, type });

  // Try built-in detection first
  const result = detect(base);
  if (result) return result;

  if (base.match(/f\.cu|top|gtl|\.cmp|\.top$/)) return fallback('top', 'copper');
  if (base.match(/b\.cu|bottom|gbl|\.sol|\.bot$/)) return fallback('bottom', 'copper');

  if (base.match(/f\.mask|gts|stc|\.topmask/)) return fallback('top', 'soldermask');
  if (base.match(/b\.mask|gbs|sts|\.bottommask/)) return fallback('bottom', 'soldermask');

  if (base.match(/f\.silks|gto|plc|\.topsilk/)) return fallback('top', 'silkscreen');
  if (base.match(/b\.silks|gbo|pls|\.bottomsilk/)) return fallback('bottom', 'silkscreen');

  if (base.match(/edge\.cuts|outline|gm1|gko|.oln|.out/)) return fallback('all', 'outline');

  if (base.match(/\.drl|\.drd|\.xln|\.cnc|\.txt|\.exc/)) return fallback('inner', 'drill');

  return null;
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

  // Unzip the archive
  await new Promise((resolve, reject) => {
    fs.createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: extractPath }))
      .on('close', resolve)
      .on('error', reject);
  });

  // Traverse all extracted files recursively
  const walk = async (dir) => {
    const files = await fs.readdir(dir);
    const results = [];
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        results.push(...await walk(fullPath));
      } else {
        results.push(fullPath);
      }
    }
    return results;
  };

  const allFiles = await walk(extractPath);
  const layerInputs = [];

  for (const filePath of allFiles) {
    const content = await fs.readFile(filePath, 'utf8');
    const filename = path.basename(filePath);
    const props = detectLayer(filename);
    if (!props) {
      console.warn(`Skipped unrecognized layer: ${filename}`);
      continue;
    }

    layerInputs.push({
      filename,
      side: props.side,
      type: props.type,
      gerber: content,
    });
  }

  // Require at least top and bottom copper
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
