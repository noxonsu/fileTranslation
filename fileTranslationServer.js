const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { TranslationServiceClient } = require('@google-cloud/translate').v3beta1;

const app = express();
const port = 3014;

const upload = multer({ dest: 'uploads/' });
const UPLOAD_FOLDER = 'uploads';
const OUTPUT_FOLDER = 'outputs';

const serviceAccountKeyPath = 'propartners-426310-fc4188025a16.json';
const translate = new TranslationServiceClient({ keyFilename: serviceAccountKeyPath });

app.use(express.static('public'));

app.post('/upload', upload.single('file'), async (req, res) => {
    const filePath = path.join(__dirname, UPLOAD_FOLDER, req.file.filename);
    const targetLanguage = req.body['target-language'];

    try {
        const [response] = await translate.translateDocument({
            parent: 'projects/propartners-426310/locations/global',
            targetLanguageCode: targetLanguage,
            documentInputConfig: {
                content: fs.readFileSync(filePath),
                mimeType: 'application/pdf'
            },
            documentOutputConfig: {
                mimeType: 'application/pdf'
            }
        });

        const outputPath = path.join(__dirname, OUTPUT_FOLDER, `translated_${req.file.filename}.pdf`);
        fs.writeFileSync(outputPath, response.documentTranslation.byteStreamOutputs[0]);

        res.json({ filename: `translated_${req.file.filename}.pdf` });
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
