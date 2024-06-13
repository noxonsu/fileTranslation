from flask import Flask, request, render_template, send_file
from google.cloud import translate_v3beta1 as translate
import os
import io
from PyPDF2 import PdfFileReader, PdfFileWriter
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['OUTPUT_FOLDER'] = 'outputs'
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['OUTPUT_FOLDER'], exist_ok=True)

# Initialize the Google Cloud Translation client
translate_client = translate.TranslationServiceClient()

def translate_document(input_path, output_path, target_language):
    parent = "projects/YOUR_PROJECT_ID/locations/global"

    with open(input_path, "rb") as f:
        content = f.read()

    document_input_config = translate.DocumentInputConfig(
        content=content,
        mime_type="application/pdf"  # Mime types: text/plain, text/html, application/pdf, etc.
    )

    gcs_destination = translate.GcsDestination(uri=output_path)
    output_config = translate.DocumentOutputConfig(gcs_destination=gcs_destination)

    request = translate.TranslateDocumentRequest(
        parent=parent,
        target_language_code=target_language,
        document_input_config=document_input_config,
        document_output_config=output_config
    )

    response = translate_client.translate_document(request=request)
    return response.document_translation.byte_stream_outputs[0]

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return "No file part", 400

    file = request.files['file']
    if file.filename == '':
        return "No selected file", 400

    if not file.filename.lower().endswith('.pdf'):
        return "Unsupported file type", 400

    filename = secure_filename(file.filename)
    input_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    output_path = os.path.join(app.config['OUTPUT_FOLDER'], 'translated_' + filename)
    file.save(input_path)

    target_language = request.form.get('target_language', 'en')
    translated_content = translate_document(input_path, output_path, target_language)

    output_file_path = os.path.join(app.config['OUTPUT_FOLDER'], 'translated_' + filename)
    with open(output_file_path, "wb") as f:
        f.write(translated_content)

    return send_file(output_file_path, as_attachment=True)

if __name__ == '__main__':
    app.run(port=5000, debug=True)