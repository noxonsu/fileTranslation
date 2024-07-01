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

function wrapText(context, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let testLine = '';
    let lineCount = 0;

    for (let n = 0; n < words.length; n++) {
        testLine = line + words[n] + ' ';
        const metrics = context.measureText(testLine);
        const testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
            context.fillText(line, x, y);
            line = words[n] + ' ';
            y += lineHeight;
            lineCount++;
        }
        else {
            line = testLine;
        }
    }
    context.fillText(line, x, y);
}

app.post('/upload', upload.single('file'), async (req, res) => {
    const filePath = path.join(__dirname, UPLOAD_FOLDER, req.file.filename);
    const targetLanguage = req.body['target-language'];
    const originalName = req.file.originalname;
    const mimeType = req.file.mimetype;

    try {
        if (mimeType.startsWith('image/')) {
            const [visionResult] = await visionClient.documentTextDetection(filePath);
            const detections = visionResult.fullTextAnnotation;
            if (!detections) {
                res.status(400).send('No text found in image');
                return;
            }

            const pages = detections.pages;
            const blocks = [];

            pages.forEach(page => {
                page.blocks.forEach(block => {
                    let blockText = '';
                    block.paragraphs.forEach(paragraph => {
                        paragraph.words.forEach(word => {
                            word.symbols.forEach(symbol => {
                                blockText += symbol.text;
                            });
                            blockText += ' ';
                        });
                        blockText += '\n';
                    });
                    blocks.push({
                        text: blockText.trim(),
                        boundingBox: block.boundingBox.vertices
                    });
                });
            });

            // Translate each block separately
            const translatedBlocks = await Promise.all(blocks.map(async (block) => {
                const [translation] = await translate.translateText({
                    parent: 'projects/propartners-426310/locations/global',
                    contents: [block.text],
                    mimeType: 'text/plain',
                    targetLanguageCode: targetLanguage
                });
                return {
                    ...block,
                    translatedText: translation.translations[0].translatedText
                };
            }));

            const image = await Jimp.read(filePath);

            // Load the image into a canvas
            const canvas = createCanvas(image.bitmap.width, image.bitmap.height);
            const ctx = canvas.getContext('2d');
            const img = await loadImage(filePath);
            ctx.drawImage(img, 0, 0);

            translatedBlocks.forEach((block) => {
                const boundingPoly = block.boundingBox;
                const x = boundingPoly[0].x;
                const y = boundingPoly[0].y;
                const width = boundingPoly[1].x - boundingPoly[0].x;
                const height = boundingPoly[2].y - boundingPoly[0].y;

                const textToWrite = block.translatedText;

                // Calculate adaptive font size
                const fontSize = Math.min(Math.floor(height / 2), 13); // Max font size of 24px
                ctx.font = `${fontSize}px Roboto`;

                // Calculate the position to start the text
                const textX = x + 2;
                const textY = y + 2;
                const maxWidth = width - 4;
                const lineHeight = fontSize * 1.2;

                // Draw white rectangle as background for the text
                ctx.fillStyle = 'white';
                ctx.fillRect(x, y, width, height);

                // Draw the text
                ctx.fillStyle = 'black';
                ctx.textBaseline = 'top';
                wrapText(ctx, textToWrite, textX, textY, maxWidth, lineHeight);
            });

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
