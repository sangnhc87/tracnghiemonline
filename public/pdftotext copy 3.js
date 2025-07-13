// Sử dụng import động, chúng ta sẽ tải thư viện khi ứng dụng bắt đầu
// nên không cần import tĩnh ở đầu file nữa.

document.addEventListener('DOMContentLoaded', () => {

    // === CONSTANTS & DOM ELEMENTS ===
    const EDITOR_CONTENT_KEY = 'latexEditorContent';
    const fileInput = document.getElementById('file-input');
    const statusMessage = document.getElementById('status-message');
    const questionCounterSpan = document.getElementById('question-counter');
    const editorContainer = document.getElementById('editor-container');
    const renderContainer = document.getElementById('render-container');
    const themeToggleButton = document.getElementById('theme-toggle');
    const findInput = document.getElementById('find-input');
    const replaceInput = document.getElementById('replace-input');
    const replaceAllButton = document.getElementById('replace-all-btn');
    const clearDraftButton = document.getElementById('clear-draft-btn');

    let editor = null;
    let config = null;
    let customReplacements = [];
    let pdfjsLib = null; // Biến để giữ thư viện PDF.js sau khi tải

    // === INITIALIZATION ===
    async function initializeApp() {
        await loadPdfLibrary(); // Tải thư viện PDF.js trước tiên
        await loadConfig();
        await loadCustomReplacements();
        initializeEditor();
        initializeEventListeners();
        setInitialTheme();
    }

    // === DATA LOADING FUNCTIONS ===
    
    /**
     * Tải thư viện PDF.js một cách động để tránh lỗi cú pháp.
     */
    async function loadPdfLibrary() {
        try {
            const PDF_JS_VERSION = '4.3.136'; // Sử dụng phiên bản cố định
            const pdfjsModule = await import(`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDF_JS_VERSION}/pdf.mjs`);
            pdfjsModule.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDF_JS_VERSION}/pdf.worker.mjs`;
            pdfjsLib = pdfjsModule; // Lưu lại để sử dụng sau
        } catch (error) {
            console.error("Failed to load PDF.js library", error);
            statusMessage.textContent = 'Lỗi: Không thể tải thư viện PDF.js.';
            statusMessage.style.color = 'red';
        }
    }
    
    async function loadConfig() {
        try {
            const response = await fetch('pdf.json');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            config = await response.json();
        } catch (error) {
            statusMessage.textContent = `Lỗi tải config: ${error.message}`;
        }
    }

    async function loadCustomReplacements() {
        try {
            const response = await fetch('pdf_replace.json');
            if (!response.ok) return;
            customReplacements = await response.json();
        } catch (error) {
            console.warn("Could not load pdf_replace.json", error);
        }
    }

    // === CORE FUNCTIONS ===
    function updateRender(latexCode) {
        const result = convertLatexToHtml(latexCode);
        renderContainer.innerHTML = result.html;
        questionCounterSpan.textContent = `${result.count} câu hỏi`;
        if (window.renderMathInElement) {
            renderMathInElement(renderContainer, {
                delimiters: [
                    {left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false},
                    {left: '\\[', right: '\\]', display: true}, {left: '\\(', right: '\\)', display: false}
                ],
                throwOnError: false
            });
        }
    }
    
    function applyCustomReplacements(text) {
        if (!customReplacements || customReplacements.length === 0) return text;
        let newText = text;
        customReplacements.forEach(rule => {
            try {
                const regex = rule.isRegex ? new RegExp(rule.find, 'g') : new RegExp(escapeRegExp(rule.find), 'g');
                newText = newText.replace(regex, rule.replace);
            } catch (e) {
                console.error(`Invalid regex in replacement rule:`, rule, e);
            }
        });
        return newText;
    }

    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // === INITIALIZERS ===
    function initializeEditor() {
        require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' } });
        require(['vs/editor/editor.main'], function () {
            monaco.languages.register({ id: 'latex-enhanced' });
            monaco.languages.setMonarchTokensProvider('latex-enhanced', {
                tokenizer: {
                    root: [
                        [/\\begin\{[a-zA-Z\d*]+\}/, 'keyword.control'],
                        [/\\end\{[a-zA-Z\d*]+\}/, 'keyword.control'],
                        [/(\\[a-zA-Z\d]+)/, 'keyword'],
                        [/[\{\}]/, 'delimiter.bracket'],
                        [/\$.*?\$/, 'string.special'],
                        [/%%.*$/, 'comment'],
                        [/\%.*$/, 'comment'],
                    ],
                },
            });

            const savedContent = localStorage.getItem(EDITOR_CONTENT_KEY);
            const defaultContent = `\\begin{ex}\n    Chào mừng! Tải tệp Ảnh hoặc PDF để bắt đầu.\n\\end{ex}`;
            
            editor = monaco.editor.create(editorContainer, {
                value: savedContent || defaultContent,
                language: 'latex-enhanced', theme: 'vs', fontSize: '14px',
                minimap: { enabled: true }, automaticLayout: true, wordWrap: 'on'
            });

            editor.onDidChangeModelContent(() => {
                const currentCode = editor.getValue();
                localStorage.setItem(EDITOR_CONTENT_KEY, currentCode);
                updateRender(currentCode);
            });
            updateRender(editor.getValue());
        });
    }

    function initializeEventListeners() {
        themeToggleButton.addEventListener('click', toggleTheme);
        replaceAllButton.addEventListener('click', handleReplaceAll);
        clearDraftButton.addEventListener('click', handleClearDraft);
        fileInput.addEventListener('change', handleFileChange);
        renderContainer.addEventListener('click', handleSolutionToggle);
    }
    
    // === EVENT HANDLERS & HELPERS ===
    
    async function handleFileChange(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!pdfjsLib && file.type === 'application/pdf') {
            statusMessage.textContent = 'Thư viện PDF chưa sẵn sàng. Vui lòng thử lại.';
            return;
        }

        setControlsEnabled(false);
        if (file.type.startsWith('image/')) {
            await processImageFile(file);
        } else if (file.type === 'application/pdf') {
            await processPdfFile(file);
        } else {
            statusMessage.textContent = 'Định dạng file không được hỗ trợ.';
        }
        setControlsEnabled(true);
        fileInput.value = '';
    }

    async function processImageFile(file) {
        statusMessage.textContent = 'Đang xử lý ảnh...';
        try {
            const base64Image = await fileToBase64(file);
            const latexResult = await getLatexFromImage(base64Image, file.type);
            const processedLatex = applyCustomReplacements(latexResult);
            editor.setValue(processedLatex);
            statusMessage.textContent = 'Hoàn tất!';
        } catch (error) {
            statusMessage.textContent = `Lỗi: ${error.message}`;
        }
    }

    async function processPdfFile(file) {
        const fileReader = new FileReader();
        fileReader.readAsArrayBuffer(file);
        
        fileReader.onload = async function() {
            const typedarray = new Uint8Array(this.result);
            let allLatexContent = [];
            
            try {
                const pdf = await pdfjsLib.getDocument(typedarray).promise;
                const numPages = pdf.numPages;
                statusMessage.textContent = `Đã tải PDF (${numPages} trang). Bắt đầu xử lý...`;
                
                for (let i = 1; i <= numPages; i++) {
                    statusMessage.textContent = `Đang xử lý trang ${i}/${numPages}...`;
                    const page = await pdf.getPage(i);
                    const viewport = page.getViewport({ scale: 2.0 });
                    const canvas = document.createElement('canvas');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;
                    const context = canvas.getContext('2d');
                    await page.render({ canvasContext: context, viewport: viewport }).promise;
                    const base64Image = canvas.toDataURL('image/jpeg');
                    const latexResult = await getLatexFromImage(base64Image, 'image/jpeg');
                    allLatexContent.push(latexResult);
                }
                
                const finalLatex = applyCustomReplacements(allLatexContent.join('\n\n'));
                editor.setValue(finalLatex);
                statusMessage.textContent = 'Hoàn tất xử lý PDF!';

            } catch (error) {
                console.error("PDF Processing Error:", error);
                statusMessage.textContent = `Lỗi xử lý PDF: ${error.message}`;
            }
        };
    }

    async function getLatexFromImage(base64Data, mimeType) {
        const pureBase64 = base64Data.split(',')[1];
        
        const promptText = config.prompts.textLatex;
        const payload = { contents: [{ parts: [{ text: promptText }, { inline_data: { mime_type: mimeType, data: pureBase64 } }] }] };

        const response = await fetch(`${config.apiUrl}?key=${config.geminiApiKey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error.message || `Lỗi API ${response.status}`);
        }

        const data = await response.json();
        return data.candidates[0].content.parts[0].text.replace(/```latex|```/g, '').trim();
    }
    
    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    }

    function handleReplaceAll() {
        if (!editor) return;
        let processedContent = editor.getValue();
        processedContent = applyCustomReplacements(processedContent);
        const findText = findInput.value;
        const replaceText = replaceInput.value;
        if (findText) {
            processedContent = processedContent.replace(new RegExp(escapeRegExp(findText), 'g'), replaceText);
        }
        editor.setValue(processedContent);
        statusMessage.textContent = 'Đã áp dụng tất cả thay thế!';
        setTimeout(() => { statusMessage.textContent = 'Sẵn sàng'; }, 2000);
    }

    function handleClearDraft() {
        if (confirm('Bạn có chắc muốn xóa bản nháp và quay về mặc định?')) {
            localStorage.removeItem(EDITOR_CONTENT_KEY);
            const defaultContent = `\\begin{ex}\n    Chào mừng! Tải tệp Ảnh hoặc PDF để bắt đầu.\n\\end{ex}`;
            if (editor) editor.setValue(defaultContent);
        }
    }
    
    function handleSolutionToggle(event) {
        const target = event.target;
        if (target.classList.contains('solution-link')) {
            event.preventDefault();
            target.classList.toggle('expanded');
            const solutionContent = target.nextElementSibling;
            if (solutionContent) solutionContent.style.display = solutionContent.style.display === 'block' ? 'none' : 'block';
        }
    }

    function toggleTheme() {
        document.body.classList.toggle('dark-mode');
        const isDarkMode = document.body.classList.contains('dark-mode');
        if (editor) monaco.editor.setTheme(isDarkMode ? 'vs-dark' : 'vs');
        themeToggleButton.querySelector('.icon').textContent = isDarkMode ? '☀️' : '🌙';
        localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    }

    function setInitialTheme() {
        if (localStorage.getItem('theme') === 'dark') {
            // Chỉ gọi toggle nếu chưa ở dark mode để tránh gọi 2 lần
            if (!document.body.classList.contains('dark-mode')) {
                toggleTheme();
            }
        }
    }

    function setControlsEnabled(enabled) {
        fileInput.disabled = !enabled;
        replaceAllButton.disabled = !enabled;
        clearDraftButton.disabled = !enabled;
        document.querySelector('label[for="file-input"]').style.pointerEvents = enabled ? 'auto' : 'none';
        document.querySelector('label[for="file-input"]').style.opacity = enabled ? '1' : '0.5';
    }

    // Bắt đầu ứng dụng
    initializeApp();
});