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
    const includeSolutionCheckbox = document.getElementById('include-solution-checkbox'); // Checkbox mới

    let editor = null;
    let promptConfig = null; // Sẽ chứa nội dung từ file YAML
    let customReplacements = [];

    // === INITIALIZATION ===
    async function initializeApp() {
        await loadPrompts(); // Tải file YAML
        await loadCustomReplacements();
        initializeEditor();
        initializeEventListeners();
        setInitialTheme();
    }

    // === DATA LOADING FUNCTIONS ===
    async function loadPrompts() {
        if (!window.jsyaml) {
            statusMessage.textContent = 'Lỗi: Thư viện js-yaml chưa được tải.';
            return;
        }
        try {
            const response = await fetch('prompts.yaml');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const yamlText = await response.text();
            promptConfig = jsyaml.load(yamlText);
        } catch (error) {
            statusMessage.textContent = `Lỗi tải prompts.yaml: ${error.message}`;
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
        replaceAllButton.addEventListener('click', handleReplaceAll);
        clearDraftButton.addEventListener('click', handleClearDraft);
        fileInput.addEventListener('change', handleFileChange);
        renderContainer.addEventListener('click', handleSolutionToggle);
    }
    
    // === EVENT HANDLERS & HELPERS ===
    
    async function handleFileChange(event) {
        const file = event.target.files[0];
        if (!file) return;

        setControlsEnabled(false);
        statusMessage.textContent = 'Đang xử lý tệp...';

        try {
            const base64Data = await fileToBase64(file);

            // Lấy lựa chọn của người dùng từ checkbox
            const includeSolution = includeSolutionCheckbox.checked;
            // Chọn prompt tương ứng
            const promptKey = includeSolution ? 'with_solution' : 'without_solution';
            const promptText = promptConfig.prompts[promptKey];

            if (!promptText) {
                throw new Error(`Không tìm thấy prompt '${promptKey}' trong prompts.yaml`);
            }
            
            const latexResult = await getLatexFromFile(base64Data, file.type, promptText);
            const processedLatex = applyCustomReplacements(latexResult);
            
            editor.setValue(processedLatex);
            statusMessage.textContent = 'Hoàn tất!';

        } catch (error) {
            console.error("File Processing Error:", error);
            statusMessage.textContent = `Lỗi: ${error.message}`;
        } finally {
            setControlsEnabled(true);
            fileInput.value = '';
        }
    }

    async function getLatexFromFile(base64Data, mimeType, promptText) {
        if (!promptConfig || !promptConfig.config.apiUrl || !promptConfig.config.geminiApiKey) {
            throw new Error("Cấu hình API (prompts.yaml) bị thiếu hoặc không hợp lệ.");
        }
        
        const pureBase64 = base64Data.split(',')[1];
        const payload = {
            contents: [{
                parts: [
                    { text: promptText },
                    { inline_data: { mime_type: mimeType, data: pureBase64 } }
                ]
            }]
        };

        const response = await fetch(`${promptConfig.config.apiUrl}?key=${promptConfig.config.geminiApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error.message || `Lỗi API ${response.status}`);
        }

        const data = await response.json();
        if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content.parts) {
            throw new Error("Phản hồi từ API không hợp lệ hoặc không có nội dung.");
        }
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

    // Các hàm còn lại giữ nguyên để bạn copy-paste cho tiện
    function handleReplaceAll() {if (!editor) return;let processedContent = editor.getValue();processedContent = applyCustomReplacements(processedContent);const findText = findInput.value;const replaceText = replaceInput.value;if (findText) {processedContent = processedContent.replace(new RegExp(escapeRegExp(findText), 'g'), replaceText);}editor.setValue(processedContent);statusMessage.textContent = 'Đã áp dụng tất cả thay thế!';setTimeout(() => { statusMessage.textContent = 'Sẵn sàng'; }, 2000);}
    function handleClearDraft() {if (confirm('Bạn có chắc muốn xóa bản nháp và quay về mặc định?')) {localStorage.removeItem(EDITOR_CONTENT_KEY);const defaultContent = `\\begin{ex}\n    Chào mừng! Tải tệp Ảnh hoặc PDF để bắt đầu.\n\\end{ex}`;if (editor) editor.setValue(defaultContent);}}
    function handleSolutionToggle(event) {const target = event.target;if (target.classList.contains('solution-link')) {event.preventDefault();target.classList.toggle('expanded');const solutionContent = target.nextElementSibling;if (solutionContent) solutionContent.style.display = solutionContent.style.display === 'block' ? 'none' : 'block';}}
    function toggleTheme() {document.body.classList.toggle('dark-mode');const isDarkMode = document.body.classList.contains('dark-mode');if (editor) monaco.editor.setTheme(isDarkMode ? 'vs-dark' : 'vs');themeToggleButton.querySelector('.icon').textContent = isDarkMode ? '☀️' : '🌙';localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');}
    function setInitialTheme() {if (localStorage.getItem('theme') === 'dark') {if (!document.body.classList.contains('dark-mode')) {toggleTheme();}}}
    function setControlsEnabled(enabled) {fileInput.disabled = !enabled;replaceAllButton.disabled = !enabled;clearDraftButton.disabled = !enabled;const label = document.querySelector('label[for="file-input"]');if (label) {label.style.pointerEvents = enabled ? 'auto' : 'none';label.style.opacity = enabled ? '1' : '0.5';}}

    // Bắt đầu ứng dụng
    initializeApp();
});