import os
from google.cloud import translate_v3beta1 as translate

UPLOAD_FOLDER = 'uploads'
OUTPUT_FOLDER = 'outputs'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

# Path to your service account key file
service_account_key_path = 'propartners-426310-fc4188025a16.json'

# Initialize the Google Cloud Translation client with the service account key file
translate_client = translate.TranslationServiceClient.from_service_account_file(service_account_key_path)

def translate_document(input_path, target_language):
    parent = "projects/propartners-426310/locations/global"

    with open(input_path, "rb") as f:
        content = f.read()

    document_input_config = translate.DocumentInputConfig(
        content=content,
        mime_type="application/pdf"  # Mime types: text/plain, text/html, application/pdf, etc.
    )

    output_config = translate.DocumentOutputConfig(
        mime_type="application/pdf"  # The desired output mime type
    )

    request = translate.TranslateDocumentRequest(
        parent=parent,
        target_language_code=target_language,
        document_input_config=document_input_config,
        document_output_config=output_config
    )

    response = translate_client.translate_document(request=request)
    return response.document_translation.byte_stream_outputs[0]

def main():
    file_path = 'zhenxianbao-paulaversnick.pdf'
    target_language = "ru"

    filename = os.path.basename(file_path)
    input_path = os.path.join(UPLOAD_FOLDER, filename)
    output_path = os.path.join(OUTPUT_FOLDER, 'translated_' + filename)

    # Copy the file to the upload folder
    with open(file_path, 'rb') as source_file, open(input_path, 'wb') as destination_file:
        destination_file.write(source_file.read())

    translated_content = translate_document(input_path, target_language)

    with open(output_path, "wb") as f:
        f.write(translated_content)

    print(f"Translation complete. Translated file saved as: {output_path}")

if __name__ == '__main__':
    main()
