import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs-extra';
import path from 'path';
import JSZip from 'jszip';
import { renderSVGsFromZip } from './renderGerber.js';

const app = express();
const upload = multer({ dest: 'uploads/' });
app.use(cors());

app.post('/', upload.single('gerber'), async (req, res) => {
  try {
    const zipPath = req.file.path;
    const outputDir = path.join('output', path.basename(zipPath));
    await fs.ensureDir(outputDir);

    // ⬇️ Call your renderer
    const { topSVG, bottomSVG } = await renderSVGsFromZip(zipPath, outputDir);

    // ⬇️ Load rendered SVGs
    const top = await fs.readFile(topSVG);
    const bottom = await fs.readFile(bottomSVG);

    // ⬇️ Zip the results
    const zip = new JSZip();
    zip.file('top.svg', top);
    zip.file('bottom.svg', bottom);
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    res.setHeader('Content-Type', 'application/zip');
    res.send(zipBuffer);

    // Optional cleanup
    await fs.remove(zipPath);
    await fs.remove(outputDir);
  } catch (err) {
    console.error('Render failed:', err);
    res.status(500).send('Gerber render failed');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Gerber API listening on port ${PORT}`));
