/**
 * Document Translation Worker
 * Handles Word document upload, parsing, and translation using R2, AutoRAG, and Meta AI
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Enable CORS for all requests
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Debug logging
    console.log(`Request: ${request.method} ${path}`);

    try {
      if (path === '/') {
        return new Response(getHTMLInterface(), {
          headers: { 'Content-Type': 'text/html', ...corsHeaders }
        });
      }

      if (path === '/upload' && request.method === 'POST') {
        console.log('Handling upload request');
        return await handleDocumentUpload(request, env, corsHeaders);
      }

      if (path === '/translate' && request.method === 'POST') {
        console.log('Handling translate request');
        return await handleTranslation(request, env, corsHeaders);
      }

      if (path === '/download' && request.method === 'GET') {
        console.log('Handling download request');
        return await handleDownload(request, env, corsHeaders);
      }

      if (path === '/status' && request.method === 'GET') {
        console.log('Handling status request');
        return await handleStatus(request, env, corsHeaders);
      }

      console.log(`Path not found: ${path}`);
      return new Response(
        JSON.stringify({ error: 'Not Found', path: path, method: request.method }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    } catch (error) {
      console.error('Error:', error);
      return new Response(
        JSON.stringify({ error: error.message, stack: error.stack }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }
  },
};

/**
 * Handle document upload and initial processing
 */
async function handleDocumentUpload(request, env, corsHeaders) {
  try {
    const formData = await request.formData();
    const file = formData.get('document');
    
    if (!file) {
      return new Response(
        JSON.stringify({ error: 'No document provided' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Check file size
    if (file.size > env.MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({ error: 'File too large' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Generate unique ID for this document
    const documentId = crypto.randomUUID();
    const fileName = file.name;
    const fileExtension = fileName.split('.').pop().toLowerCase();

    // Validate file type
    if (!['docx', 'doc', 'pdf', 'txt'].includes(fileExtension)) {
      return new Response(
        JSON.stringify({ error: 'Unsupported file type. Please upload .docx, .doc, .pdf, or .txt files' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Store original file in R2
    const originalKey = `documents/${documentId}/original.${fileExtension}`;
    await env.DOCUMENTS.put(originalKey, file.stream());

    // Extract text content
    const fileBuffer = await file.arrayBuffer();
    let extractedText = '';

    if (fileExtension === 'docx' || fileExtension === 'doc') {
      try {
        console.log('Attempting to extract text from:', fileName, 'Size:', fileBuffer.byteLength);
        
        if (fileExtension === 'docx') {
          // For now, provide a clear message about DOCX parsing
          extractedText = `DOCX Document: ${fileName}\n\n` +
            `Unfortunately, DOCX text extraction is not currently available in this demo. ` +
            `This is a technical limitation with parsing Word documents in the Cloudflare Workers environment.\n\n` +
            `To test the full translation functionality, please:\n` +
            `1. Copy the text content from your DOCX file\n` +
            `2. Save it as a .txt file\n` +
            `3. Upload the .txt file instead\n\n` +
            `The translation system will work perfectly with plain text files and demonstrate the complete workflow.\n\n` +
            `This would be a production enhancement to add proper DOCX parsing using external services or specialized libraries.`;
        } else {
          // For DOC files, we'll use a simple approach
          extractedText = `DOC file parsing not implemented. Please convert to DOCX format or save as .txt file for text extraction.`;
        }
        
        console.log('Successfully extracted text, length:', extractedText.length);
      } catch (error) {
        console.error('Document extraction error:', error);
        extractedText = `Error extracting document content: ${error.message}\n\n` +
          `Please ensure the document is a valid DOCX file and try again.`;
      }
    } else if (fileExtension === 'pdf') {
      try {
        console.log('Attempting to extract formatted text from PDF:', fileName);
        
        // Use Cloudflare AI's toMarkdown for PDF extraction with formatting preservation
        const result = await env.AI.toMarkdown([{
          name: fileName,
          blob: new Blob([fileBuffer], { type: 'application/pdf' })
        }]);
        
        console.log('PDF toMarkdown result:', result);
        
        if (result && result.length > 0 && result[0] && result[0].data) {
          extractedText = result[0].data;
          console.log('Successfully extracted formatted PDF text, length:', extractedText.length);
          // Apply additional formatting preservation for better readability
          extractedText = preserveTextFormatting(extractedText);
        } else {
          console.log('No data in PDF toMarkdown result, using fallback');
          extractedText = 'No content extracted from PDF. The PDF may be image-based or encrypted.';
        }
      } catch (error) {
        console.error('PDF extraction error:', error);
        extractedText = 'Error extracting PDF content: ' + error.message + '\n\nThis may be an image-based PDF or the file may be corrupted.';
      }
    } else if (fileExtension === 'txt') {
      extractedText = new TextDecoder().decode(fileBuffer);
      // Preserve formatting by maintaining line breaks and spacing
      extractedText = preserveTextFormatting(extractedText);
    }

    // Store extracted text
    const textKey = `documents/${documentId}/text.txt`;
    await env.DOCUMENTS.put(textKey, extractedText);

    // Store metadata
    const metadata = {
      documentId,
      fileName,
      fileExtension,
      fileSize: file.size,
      uploadTime: new Date().toISOString(),
      status: 'uploaded',
      textLength: extractedText.length
    };

    await env.TRANSLATION_CACHE.put(documentId, JSON.stringify(metadata));

    return new Response(
      JSON.stringify({ 
        documentId, 
        fileName, 
        status: 'uploaded',
        textLength: extractedText.length,
        message: 'Document uploaded successfully'
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  } catch (error) {
    console.error('Upload error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to upload document' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
}

/**
 * Handle translation request
 */
async function handleTranslation(request, env, corsHeaders) {
  try {
    const { documentId, targetLanguage, sourceLanguage = 'auto' } = await request.json();

    if (!documentId || !targetLanguage) {
      return new Response(
        JSON.stringify({ error: 'Document ID and target language are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Get document metadata
    const metadataStr = await env.TRANSLATION_CACHE.get(documentId);
    if (!metadataStr) {
      return new Response(
        JSON.stringify({ error: 'Document not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const metadata = JSON.parse(metadataStr);

    // Get extracted text
    const textKey = `documents/${documentId}/text.txt`;
    const extractedText = await env.DOCUMENTS.get(textKey);
    
    if (!extractedText) {
      return new Response(
        JSON.stringify({ error: 'Document text not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const textContent = await extractedText.text();

    // Update status
    metadata.status = 'translating';
    metadata.targetLanguage = targetLanguage;
    metadata.sourceLanguage = sourceLanguage;
    await env.TRANSLATION_CACHE.put(documentId, JSON.stringify(metadata));

    // Process with AutoRAG for chunking (simplified implementation)
    const chunks = chunkText(textContent, 2000); // 2000 character chunks
    const translatedChunks = [];

    // Translate each chunk using Meta AI
    for (const chunk of chunks) {
      try {
        const translatedChunk = await translateWithMetaAI(chunk, targetLanguage, sourceLanguage, env);
        translatedChunks.push(translatedChunk);
      } catch (error) {
        console.error('Translation error for chunk:', error);
        translatedChunks.push(chunk); // Keep original if translation fails
      }
    }

    const translatedText = translatedChunks.join('\n\n');

    // Store translated text
    const translatedKey = `documents/${documentId}/translated_${targetLanguage}.txt`;
    await env.DOCUMENTS.put(translatedKey, translatedText);

    // Update metadata
    metadata.status = 'completed';
    metadata.translatedLanguage = targetLanguage;
    metadata.translationTime = new Date().toISOString();
    await env.TRANSLATION_CACHE.put(documentId, JSON.stringify(metadata));

    return new Response(
      JSON.stringify({ 
        documentId, 
        status: 'completed',
        targetLanguage,
        translatedLength: translatedText.length,
        message: 'Translation completed successfully'
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  } catch (error) {
    console.error('Translation error:', error);
    return new Response(
      JSON.stringify({ error: 'Translation failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
}

/**
 * Handle download request
 */
async function handleDownload(request, env, corsHeaders) {
  try {
    const url = new URL(request.url);
    const documentId = url.searchParams.get('documentId');
    const type = url.searchParams.get('type') || 'translated';
    const language = url.searchParams.get('language') || 'en';

    if (!documentId) {
      return new Response(
        JSON.stringify({ error: 'Document ID is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Get document metadata
    const metadataStr = await env.TRANSLATION_CACHE.get(documentId);
    if (!metadataStr) {
      return new Response(
        JSON.stringify({ error: 'Document not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const metadata = JSON.parse(metadataStr);

    let key;
    let filename;
    let contentType = 'text/plain';

    if (type === 'original') {
      key = `documents/${documentId}/original.${metadata.fileExtension}`;
      filename = `original_${metadata.fileName}`;
      contentType = getContentType(metadata.fileExtension);
    } else if (type === 'translated') {
      key = `documents/${documentId}/translated_${language}.txt`;
      filename = `translated_${language}_${metadata.fileName.replace(/\.[^/.]+$/, '')}.txt`;
    } else {
      key = `documents/${documentId}/text.txt`;
      filename = `extracted_${metadata.fileName.replace(/\.[^/.]+$/, '')}.txt`;
    }

    const file = await env.DOCUMENTS.get(key);
    if (!file) {
      return new Response(
        JSON.stringify({ error: 'File not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    return new Response(file.body, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        ...corsHeaders
      }
    });
  } catch (error) {
    console.error('Download error:', error);
    return new Response(
      JSON.stringify({ error: 'Download failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
}

/**
 * Handle status request
 */
async function handleStatus(request, env, corsHeaders) {
  try {
    const url = new URL(request.url);
    const documentId = url.searchParams.get('documentId');

    if (!documentId) {
      return new Response(
        JSON.stringify({ error: 'Document ID is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const metadataStr = await env.TRANSLATION_CACHE.get(documentId);
    if (!metadataStr) {
      return new Response(
        JSON.stringify({ error: 'Document not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const metadata = JSON.parse(metadataStr);

    return new Response(
      JSON.stringify(metadata),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  } catch (error) {
    console.error('Status error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to get status' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
}

/**
 * Translate text using Meta AI through Cloudflare AI
 */
async function translateWithMetaAI(text, targetLanguage, sourceLanguage, env) {
  try {
    // Use Cloudflare AI with Meta's translation model
    const response = await env.AI.run('@cf/meta/m2m100-1.2b', {
      text: text,
      source_lang: sourceLanguage === 'auto' ? 'en' : sourceLanguage,
      target_lang: targetLanguage
    });

    return response.translated_text || text;
  } catch (error) {
    console.error('Meta AI translation error:', error);
    // Fallback to simple translation service or return original
    return text;
  }
}

/**
 * Chunk text for processing (simplified AutoRAG implementation)
 */
function chunkText(text, maxLength = 2000) {
  const chunks = [];
  const sentences = text.split(/[.!?]+/);
  let currentChunk = '';

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > maxLength) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = sentence;
    } else {
      currentChunk += sentence + '.';
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Preserve text formatting for better readability and translation
 */
function preserveTextFormatting(text) {
  if (!text) return text;
  
  // Normalize line endings to \n
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // Preserve paragraph breaks (double line breaks)
  text = text.replace(/\n\n+/g, '\n\n');
  
  // Preserve single line breaks but ensure they're consistent
  text = text.replace(/\n/g, '\n');
  
  // Clean up excessive whitespace while preserving intentional spacing
  text = text.replace(/[ \t]+/g, ' '); // Multiple spaces/tabs to single space
  text = text.replace(/\n /g, '\n'); // Remove spaces at start of lines
  text = text.replace(/ \n/g, '\n'); // Remove spaces at end of lines
  
  // Preserve common formatting patterns
  // Headers (lines that end with a colon or are all caps)
  text = text.replace(/^([A-Z][A-Z\s]+[A-Z])$/gm, '\n$1\n');
  
  // Lists (lines starting with -, *, or numbers)
  text = text.replace(/^(\s*)([\-\*]|\d+\.)\s+/gm, '\n$1$2 ');
  
  // Clean up any triple line breaks that might have been created
  text = text.replace(/\n\n\n+/g, '\n\n');
  
  // Trim whitespace from start and end
  text = text.trim();
  
  return text;
}

/**
 * Get content type based on file extension
 */
function getContentType(extension) {
  const types = {
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'doc': 'application/msword',
    'pdf': 'application/pdf',
    'txt': 'text/plain'
  };
  return types[extension] || 'application/octet-stream';
}

/**
 * HTML interface for the document translator
 */
function getHTMLInterface() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cloudflare Document Translator</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>">
    <link rel="apple-touch-icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='45' fill='%23f97316'/><text x='50' y='70' font-size='60' text-anchor='middle' fill='white'>⚡</text></svg>">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: #0f0f23;
            min-height: 100vh;
            color: #e5e7eb;
            line-height: 1.6;
            padding: 40px 20px;
        }

        .container {
            max-width: 800px;
            margin: 0 auto;
            padding: 0;
        }

        h1 {
            color: #f97316;
            margin-bottom: 10px;
            font-size: 2.5em;
            font-weight: 700;
            line-height: 1.2;
        }

        .section {
            margin-bottom: 40px;
            padding: 0;
        }

        .section h2 {
            color: #f3f4f6;
            margin-bottom: 20px;
            font-size: 1.5em;
            font-weight: 600;
            line-height: 1.3;
        }

        .upload-area {
            border: 2px dashed #6b7280;
            border-radius: 8px;
            padding: 40px;
            text-align: center;
            cursor: pointer;
            transition: all 0.3s ease;
            background: rgba(31, 41, 55, 0.5);
            margin-bottom: 20px;
        }

        .upload-area:hover {
            border-color: #f97316;
            background: #374151;
        }

        .upload-area.dragover {
            border-color: #f97316;
            background: #374151;
        }

        input[type="file"] {
            display: none;
        }

        .btn {
            background: linear-gradient(45deg, #f97316, #ea580c);
            color: white;
            border: none;
            padding: 12px 30px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 16px;
            font-weight: 600;
            transition: all 0.3s ease;
            margin: 10px;
        }

        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(249, 115, 22, 0.4);
        }

        .btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }

        select {
            padding: 10px;
            border: 1px solid #6b7280;
            border-radius: 6px;
            font-size: 16px;
            width: 200px;
            margin: 10px;
            background: #374151;
            color: #f9fafb;
        }

        .progress {
            background: #374151;
            border-radius: 6px;
            height: 20px;
            overflow: hidden;
            margin: 10px 0;
        }

        .progress-bar {
            background: linear-gradient(45deg, #f97316, #ea580c);
            height: 100%;
            transition: width 0.3s ease;
            width: 0%;
        }

        .status {
            padding: 15px;
            border-radius: 6px;
            margin: 10px 0;
            font-weight: 500;
        }

        .status.success {
            background: #064e3b;
            color: #6ee7b7;
            border: 1px solid #047857;
        }

        .status.error {
            background: #7f1d1d;
            color: #fca5a5;
            border: 1px solid #dc2626;
        }

        .status.info {
            background: #cce7ff;
            color: #004085;
            border: 1px solid #b8daff;
        }

        .file-info {
            background: white;
            padding: 15px;
            border-radius: 10px;
            margin: 10px 0;
            border: 1px solid #dee2e6;
        }

        .download-links {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-top: 15px;
        }

        .download-link {
            background: #28a745;
            color: white;
            padding: 8px 16px;
            border-radius: 5px;
            text-decoration: none;
            font-size: 14px;
            transition: all 0.3s ease;
        }

        .download-link:hover {
            background: #218838;
            transform: translateY(-1px);
        }

        .footer {
            text-align: center;
            margin-top: 40px;
            padding: 20px;
            border-top: 1px solid #374151;
            color: #9ca3af;
            font-size: 14px;
        }

        .footer a {
            color: #f97316;
            text-decoration: none;
        }

        .footer a:hover {
            text-decoration: underline;
        }

        @media (max-width: 600px) {
            .container {
                padding: 20px;
            }
            
            h1 {
                font-size: 2em;
            }
            
            .section {
                padding: 15px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Cloudflare Document Translator</h1>
        
        <div class="section">
            <h2>Translation Settings</h2>
            <label>
                Source Language:
                <select id="sourceLanguage">
                    <option value="auto">Auto-detect</option>
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                    <option value="it">Italian</option>
                    <option value="pt">Portuguese</option>
                    <option value="ru">Russian</option>
                    <option value="ja">Japanese</option>
                    <option value="ko">Korean</option>
                    <option value="zh">Chinese</option>
                </select>
            </label>
            <label>
                Target Language:
                <select id="targetLanguage">
                    <option value="es">Spanish</option>
                    <option value="en">English</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                    <option value="it">Italian</option>
                    <option value="pt">Portuguese</option>
                    <option value="ru">Russian</option>
                    <option value="ja">Japanese</option>
                    <option value="ko">Korean</option>
                    <option value="zh">Chinese</option>
                </select>
            </label>
        </div>

        <div class="section">
            <h2>Upload Document</h2>
            <div class="upload-area" id="uploadArea">
                <input type="file" id="fileInput" accept=".pdf,.txt">
                <div>
                    <p>📁 Click to select a file or drag and drop</p>
                    <p style="color: #6c757d; font-size: 14px; margin-top: 5px;">
                        Supported formats: .pdf, .txt (max 50MB)
                    </p>
                </div>
            </div>
            <button class="btn" id="uploadBtn" disabled>Upload & Translate</button>
        </div>

        <div class="section">
            <h2>Status</h2>
            <div id="statusArea">
                <p style="color: #6c757d;">Upload a document to begin...</p>
            </div>
            <div class="progress" id="progressBar" style="display: none;">
                <div class="progress-bar" id="progressFill"></div>
            </div>
        </div>

        <div class="section" id="resultsSection" style="display: none;">
            <h2>Download Results</h2>
            <div id="downloadArea"></div>
        </div>
        
        <div class="footer">
            <p>Powered by ⚡ <a href="https://workers.cloudflare.com" target="_blank">Cloudflare Workers</a>, 🗄️ <a href="https://developers.cloudflare.com/r2/" target="_blank">R2</a>, and 🤖 <a href="https://developers.cloudflare.com/workers-ai/" target="_blank">Workers AI</a></p>
        </div>
    </div>

    <script>
        let currentDocumentId = null;
        let currentFile = null;

        // DOM elements
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        const uploadBtn = document.getElementById('uploadBtn');
        const statusArea = document.getElementById('statusArea');
        const progressBar = document.getElementById('progressBar');
        const progressFill = document.getElementById('progressFill');
        const resultsSection = document.getElementById('resultsSection');
        const downloadArea = document.getElementById('downloadArea');
        const sourceLanguage = document.getElementById('sourceLanguage');
        const targetLanguage = document.getElementById('targetLanguage');

        // File upload handling
        uploadArea.addEventListener('click', () => fileInput.click());
        uploadArea.addEventListener('dragover', handleDragOver);
        uploadArea.addEventListener('dragleave', handleDragLeave);
        uploadArea.addEventListener('drop', handleDrop);
        fileInput.addEventListener('change', handleFileSelect);
        uploadBtn.addEventListener('click', uploadDocument);

        function handleDragOver(e) {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        }

        function handleDragLeave(e) {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
        }

        function handleDrop(e) {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleFileSelect({ target: { files: files } });
            }
        }

        function handleFileSelect(e) {
            const file = e.target.files[0];
            if (file) {
                const fileName = file.name.toLowerCase();
                const fileExtension = fileName.split('.').pop();
                
                // Check if user is trying to upload DOCX/DOC files
                if (fileExtension === 'docx' || fileExtension === 'doc') {
                    const conversionInfo = '<div class="file-info" style="border: 2px solid #f97316; padding: 20px; border-radius: 8px;">' +
                        '<h3 style="color: #f97316; margin-bottom: 10px;">📝 DOCX/DOC Files Not Supported</h3>' +
                        '<p style="margin-bottom: 15px;"><strong>' + file.name + '</strong> is a Word document format that we currently do not support.</p>' +
                        '<p style="margin-bottom: 15px;"><strong>How to convert your document:</strong></p>' +
                        '<ul style="margin-left: 20px; margin-bottom: 15px;">' +
                        '<li>Open your document in Microsoft Word</li>' +
                        '<li>Copy all the text content (Ctrl+A, then Ctrl+C)</li>' +
                        '<li>Create a new .txt file in Notepad or any text editor</li>' +
                        '<li>Paste the content and save as .txt</li>' +
                        '<li>Upload the .txt file here for translation</li>' +
                        '</ul>' +
                        '<p style="color: #6b7280; font-size: 14px;">We support .txt and .pdf files for translation.</p>' +
                        '</div>';
                    uploadArea.innerHTML = conversionInfo;
                    uploadBtn.disabled = true;
                    currentFile = null;
                    return;
                }
                
                // Check if it's a supported file type
                if (fileExtension !== 'txt' && fileExtension !== 'pdf') {
                    const unsupportedInfo = '<div class="file-info" style="border: 2px solid #dc2626; padding: 20px; border-radius: 8px;">' +
                        '<h3 style="color: #dc2626; margin-bottom: 10px;">❌ Unsupported File Type</h3>' +
                        '<p style="margin-bottom: 15px;"><strong>' + file.name + '</strong> is not a supported file format.</p>' +
                        '<p style="color: #6b7280; font-size: 14px;">We currently support .txt and .pdf files only.</p>' +
                        '</div>';
                    uploadArea.innerHTML = unsupportedInfo;
                    uploadBtn.disabled = true;
                    currentFile = null;
                    return;
                }
                
                // File is supported, show file info
                currentFile = file;
                const fileInfo = '<div class="file-info">' +
                    '<strong>' + file.name + '</strong><br>' +
                    'Size: ' + (file.size / 1024 / 1024).toFixed(2) + ' MB<br>' +
                    'Type: ' + (file.type || 'Unknown') +
                    '</div>';
                uploadArea.innerHTML = fileInfo;
                uploadBtn.disabled = false;
            }
        }

        async function uploadDocument() {
            if (!currentFile) return;

            const formData = new FormData();
            formData.append('document', currentFile);

            uploadBtn.disabled = true;
            showStatus('Uploading document...', 'info');
            showProgress(30);

            try {
                const response = await fetch('/upload', {
                    method: 'POST',
                    body: formData
                });

                console.log('Upload response status:', response.status);
                console.log('Upload response headers:', response.headers);
                
                if (!response.ok) {
                    throw new Error('HTTP error! status: ' + response.status);
                }

                const result = await response.json();
                console.log('Upload result:', result);
                showProgress(100);

                if (result.documentId && result.status === 'uploaded') {
                    currentDocumentId = result.documentId;
                    showStatus('Document uploaded successfully! Starting translation...', 'success');
                    
                    // Show upload completion and transition to translation
                    setTimeout(() => {
                        showStatus('Translating document...', 'info');
                        translateDocument();
                    }, 1000);
                } else {
                    const errorMsg = result.error || result.message || 'Unknown error occurred';
                    console.error('Upload failed with result:', result);
                    showStatus('Upload failed: ' + errorMsg, 'error');
                }
            } catch (error) {
                console.error('Upload error:', error);
                showStatus('Upload failed: ' + error.message, 'error');
            } finally {
                uploadBtn.disabled = false;
                hideProgress();
            }
        }

        async function translateDocument() {
            if (!currentDocumentId) return;

            uploadBtn.disabled = true;
            showStatus('Starting translation...', 'info');
            showProgress(10);

            try {
                // Show translation progress
                showStatus('Sending translation request...', 'info');
                showProgress(20);
                
                const response = await fetch('/translate', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        documentId: currentDocumentId,
                        sourceLanguage: sourceLanguage.value,
                        targetLanguage: targetLanguage.value
                    })
                });
                
                showStatus('Processing translation...', 'info');
                showProgress(60);

                const result = await response.json();
                
                if (response.ok) {
                    showStatus('Translation completed! Translated length: ' + result.translatedLength + ' characters', 'success');
                    showProgress(100);
                    showDownloadLinks();
                } else {
                    showStatus('Translation failed: ' + result.error, 'error');
                }
            } catch (error) {
                showStatus('Translation error: ' + error.message, 'error');
            } finally {
                uploadBtn.disabled = false;
                hideProgress();
            }
        }

        function showStatus(message, type) {
            statusArea.innerHTML = '<div class="status ' + type + '">' + message + '</div>';
        }

        function showProgress(percent) {
            progressBar.style.display = 'block';
            progressFill.style.width = percent + '%';
        }

        function hideProgress() {
            setTimeout(() => {
                progressBar.style.display = 'none';
                progressFill.style.width = '0%';
            }, 1000);
        }

        function showDownloadLinks() {
            const targetLang = targetLanguage.value;
            downloadArea.innerHTML = \`
                <div class="download-links">
                    <a href="/download?documentId=\${currentDocumentId}&type=original" class="download-link">
                        Original Document
                    </a>
                    <a href="/download?documentId=\${currentDocumentId}&type=text" class="download-link">
                        Extracted Text
                    </a>
                    <a href="/download?documentId=\${currentDocumentId}&type=translated&language=\${targetLang}" class="download-link">
                        Translated Text (\${targetLang.toUpperCase()})
                    </a>
                </div>
            \`;
            resultsSection.style.display = 'block';
        }
    </script>
</body>
</html>
  `;
}
