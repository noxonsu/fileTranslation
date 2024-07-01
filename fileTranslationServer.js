const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { TranslationServiceClient } = require('@google-cloud/translate').v3beta1;
const vision = require('@google-cloud/vision');
const Jimp = require('jimp');
const { registerFont, createCanvas, loadImage } = require('canvas');

const app = express();
const port = 3014;

const upload = multer({ dest: 'uploads/' });
const UPLOAD_FOLDER = 'uploads';
const OUTPUT_FOLDER = 'outputs';

const serviceAccountKeyPath = 'propartners-426310-fc4188025a16.json';
const translate = new TranslationServiceClient({ keyFilename: serviceAccountKeyPath });
const visionClient = new vision.ImageAnnotatorClient({ keyFilename: serviceAccountKeyPath });

// Enable CORS for all routes
app.use(cors());

app.use(express.static('public'));

// Register the font for canvas
registerFont(path.join(__dirname, 'fonts', 'Roboto-Regular.ttf'), { family: 'Roboto' });

app.post('/upload', upload.single('file'), async (req, res) => {
    const filePath = path.join(__dirname, UPLOAD_FOLDER, req.file.filename);
    const targetLanguage = req.body['target-language'];
    const originalName = req.file.originalname;
    const mimeType = req.file.mimetype;

    try {
        if (mimeType.startsWith('image/')) {
            const [visionResult] = await visionClient.textDetection(filePath);
            const detections = visionResult.textAnnotations;
            if (detections.length === 0) {
                res.status(400).send('No text found in image');
                return;
            }

            const originalText = detections[0].description;
            const [translation] = await translate.translateText({
                parent: 'projects/propartners-426310/locations/global',
                contents: [originalText],
                mimeType: 'text/plain',
                targetLanguageCode: targetLanguage
            });

            const translatedText = translation.translations[0].translatedText.split('\n');
            const originalTextAnnotations = detections.slice(1);

            const image = await Jimp.read(filePath);

            // Load the image into a canvas
            const canvas = createCanvas(image.bitmap.width, image.bitmap.height);
            const ctx = canvas.getContext('2d');
            const img = await loadImage(filePath);
            ctx.drawImage(img, 0, 0);

            // Set font and text properties
            ctx.font = '32px Roboto';
            ctx.fillStyle = 'black';
            ctx.textBaseline = 'top';

            for (let i = 0; i < originalTextAnnotations.length; i++) {
                const annotation = originalTextAnnotations[i];
                const boundingPoly = annotation.boundingPoly.vertices;
                const x = boundingPoly[0].x;
                const y = boundingPoly[0].y;
                const width = boundingPoly[1].x - boundingPoly[0].x;
                const height = boundingPoly[2].y - boundingPoly[0].y;

                const textToWrite = translatedText[i] || '';

                // Draw white rectangle as background for the text
                ctx.fillStyle = 'white';
                ctx.fillRect(x, y, width, height);

                // Draw the text
                ctx.fillStyle = 'black';
                ctx.fillText(textToWrite, x, y, width);
            }

            const outputPath = path.join(__dirname, OUTPUT_FOLDER, `translated_${originalName}`);
            const out = fs.createWriteStream(outputPath);
            const stream = canvas.createJPEGStream();
            stream.pipe(out);
            out.on('finish', () => res.json({ filename: `translated_${originalName}` }));
        } else {
            res.status(400).send('Unsupported file type');
        }
    } catch (error) {
        console.error('Error during translation:', error);
        res.status(500).send('Translation failed');
    }
});

app.get('/download/:filename', (req, res) => {
    const file = path.join(__dirname, OUTPUT_FOLDER, req.params.filename);
    res.download(file);
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
    fs.mkdirSync(UPLOAD_FOLDER, { recursive: true });
    fs.mkdirSync(OUTPUT_FOLDER, { recursive: true });
});
