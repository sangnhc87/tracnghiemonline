document.addEventListener('DOMContentLoaded', () => {

    // === CONSTANTS (Hằng số toàn cục) ===
    const EDITOR_CONTENT_KEY = 'latexEditorContent'; // Key để lưu trong localStorage

    // === DOM ELEMENTS ===
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

    // === INITIALIZATION ===
    async function initializeApp() {
        await loadConfig();
        await loadCustomReplacements();
        initializeEditor();
        initializeEventListeners();
        setInitialTheme();
    }

    // === DATA LOADING FUNCTIONS ===
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
            if (!response.ok) return; // File is optional
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
        if (!customReplacements || customReplacements.length === 0) {
            return text;
        }
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
            const defaultContent = [
                '\\begin{ex}',
                '    Chào mừng bạn đến với LaTeX Editor!\\\\',
                '    Nội dung của bạn sẽ được tự động lưu.\\\\',
                '    Hãy thử chỉnh sửa và nhấn F5.',
                '\\end{ex}',
            ].join('\n');
            
            editor = monaco.editor.create(editorContainer, {
                value: savedContent || defaultContent,
                language: 'latex-enhanced',
                theme: 'vs',
                fontSize: '14px',
                minimap: { enabled: true },
                automaticLayout: true,
                wordWrap: 'on',
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
        fileInput.addEventListener('change', handleFileChange);
        renderContainer.addEventListener('click', function(event) {
            const target = event.target;
            if (target.classList.contains('solution-link')) {
                event.preventDefault();
                target.classList.toggle('expanded');
                const solutionContent = target.nextElementSibling;
                if (solutionContent) {
                    solutionContent.style.display = solutionContent.style.display === 'block' ? 'none' : 'block';
                }
            }
        });
        clearDraftButton.addEventListener('click', () => {
            if (confirm('Bạn có chắc muốn xóa bản nháp và quay về mặc định?')) {
                localStorage.removeItem(EDITOR_CONTENT_KEY);
                const defaultContent = [
                    '\\begin{ex}',
                    '    Chào mừng bạn đến với LaTeX Editor!\\\\',
                    '    Nội dung của bạn sẽ được tự động lưu.\\\\',
                    '    Hãy thử chỉnh sửa và nhấn F5.',
                    '\\end{ex}',
                ].join('\n');
                if (editor) {
                    editor.setValue(defaultContent);
                }
            }
        });
        

        // === LOGIC NÚT "THAY THẾ TẤT CẢ" ĐÃ ĐƯỢC NÂNG CẤP ===
        replaceAllButton.addEventListener('click', () => {
            if (!editor) return;

            let processedContent = editor.getValue();

            // 1. Luôn áp dụng các quy tắc từ file pdf_replace.json trước
            processedContent = applyCustomReplacements(processedContent);

            // 2. Sau đó, áp dụng quy tắc từ ô nhập liệu (nếu có)
            const findText = findInput.value;
            const replaceText = replaceInput.value;

            if (findText) {
                const escapedFindText = escapeRegExp(findText);
                const regex = new RegExp(escapedFindText, 'g');
                processedContent = processedContent.replace(regex, replaceText);
            }

            // 3. Cập nhật lại editor với nội dung cuối cùng
            editor.setValue(processedContent);

            statusMessage.textContent = 'Đã áp dụng tất cả thay thế!';
            setTimeout(() => { statusMessage.textContent = 'Sẵn sàng'; }, 2000);
        });
    }
    
    // === EVENT HANDLERS & HELPERS ===
    function toggleTheme() {
        document.body.classList.toggle('dark-mode');
        const isDarkMode = document.body.classList.contains('dark-mode');
        if (editor) { monaco.editor.setTheme(isDarkMode ? 'vs-dark' : 'vs'); }
        themeToggleButton.querySelector('.icon').textContent = isDarkMode ? '☀️' : '🌙';
        localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    }

    function setInitialTheme() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark' && !document.body.classList.contains('dark-mode')) {
            toggleTheme();
        }
    }
    
    async function handleFileChange(event) {
        const file = event.target.files[0];
        if (!file || !config || !editor) {
            statusMessage.textContent = 'Trình soạn thảo hoặc config chưa sẵn sàng.';
            return;
        }

        statusMessage.textContent = 'Đang xử lý ảnh...';
        try {
            const base64Image = await imageToBase64(file);
            const promptText = config.prompts.textLatex;
            const payload = { contents: [{ parts: [{ text: promptText }, { inline_data: { mime_type: file.type, data: base64Image } }] }] };
            const response = await fetch(`${config.apiUrl}?key=${config.geminiApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error.message || `Lỗi API ${response.status}`);
            }

            const data = await response.json();
            let rawLatex = data.candidates[0].content.parts[0].text.replace(/```latex|```/g, '').trim();
            // Xử lý tự động sau OCR vẫn giữ nguyên
            let processedLatex = applyCustomReplacements(rawLatex);
            editor.setValue(processedLatex);
            statusMessage.textContent = 'Hoàn tất!';

        } catch (error) {
            statusMessage.textContent = `Lỗi: ${error.message}`;
        } finally {
            fileInput.value = '';
        }
    }

    function imageToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = error => reject(error);
        });
    }

    // Start the application
    initializeApp();
});