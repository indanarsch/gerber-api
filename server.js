import express from 'express';
import multer from 'multer';
import fs from 'fs-extra';
import path from 'path';
import archiver from 'archiver';
import { fileURLToPath } from 'url';
import { renderSVGsFromZip } from './renderGerber.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;

// Create necessary folders
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const OUTPUT_DIR = path.join(__dirname, 'output');
fs.ensureDirSync(UPLOAD_DIR);
fs.ensureDirSync(OUTPUT_DIR);

// Setup multer for file upload
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// API: POST /api/render
app.post('/api/render', upload.single('gerber'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  const zipPath = req.file.path;
  const sessionDir = path.join(OUTPUT_DIR, Date.now().toString());
  await fs.ensureDir(sessionDir);

  try {
    const { topSVG, bottomSVG } = await renderSVGsFromZip(zipPath, sessionDir);

    // Create output.zip
    const zipOutputPath = path.join(sessionDir, 'output.zip');
    const archive = archiver('zip');
    const output = fs.createWriteStream(zipOutputPath);

    archive.pipe(output);
    archive.file(topSVG, { name: 'top.svg' });
    archive.file(bottomSVG, { name: 'bottom.svg' });
    await archive.finalize();

    output.on('close', () => {
      res.download(zipOutputPath, 'output.zip');
    });
  } catch (err) {
    console.error('Render error:', err);
    res.status(500).send('Failed to generate Gerber preview.');
  }
});

// Health check
app.get('/', (req, res) => {
  res.send('Gerber render API is up');
});

app.listen(port, () => {
  console.log(`✅ Server running on http://localhost:${port}`);
});
