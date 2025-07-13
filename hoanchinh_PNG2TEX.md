Chắc chắn rồi! Dựa trên tất cả các yêu cầu và các lần sửa lỗi của chúng ta, đây là bộ code hoàn chỉnh 100% cho toàn bộ dự án. Bạn chỉ cần tạo 6 file sau đây trong cùng một thư mục, dán nội dung tương ứng vào, và mọi thứ sẽ hoạt động trơn tru.

### 1. File: `index.html`
Đây là file chính, chứa cấu trúc của trang web và nạp tất cả các script theo đúng thứ tự để tránh xung đột.

```html
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI LaTeX Editor Pro</title>

    <!-- Các file CSS được tải trong HEAD -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
    <link rel="stylesheet" href="pdf.css">
</head>

<body>
    <!-- ===== HEADER BAR ===== -->
    <div class="header-bar">
        <div class="header-controls">
            <label for="file-input" class="button">
                <span class="icon">📷</span> Chuyển đổi từ ảnh
            </label>
            <input id="file-input" type="file" accept="image/*" style="display: none;">
            
            <button id="clear-draft-btn" class="button clear-button">
                <span class="icon">🗑️</span> Xóa bản nháp
            </button>
            
            <span id="status-message">Sẵn sàng</span>
        </div>
        <div class="header-info">
            <span id="question-counter"></span>
            <button id="theme-toggle" class="button theme-button">
                <span class="icon">🌙</span>
            </button>
        </div>
    </div>
    
    <!-- ===== MAIN CONTENT ===== -->
    <div class="main-container">
        <div id="editor-container" class="panel"></div>
        <div id="render-container" class="panel"></div>
    </div>
    
    <!-- ===== FIND/REPLACE BAR ===== -->
    <div id="find-replace-bar">
        <input type="text" id="find-input" placeholder="Tìm kiếm...">
        <input type="text" id="replace-input" placeholder="Thay thế bằng...">
        <button id="replace-all-btn" class="button">Thay thế tất cả</button>
    </div>

    <!-- ===== SCRIPT LOADING (Thứ tự rất quan trọng) ===== -->
    <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs/loader.js"></script>
    
    <script src="pdf-latex.js"></script> 
    <script src="pdftotext.js"></script>

</body>
</html>
```

---

### 2. File: `pdf.css`
File này chứa toàn bộ style cho trang, bao gồm cả giao diện Sáng/Tối và các sửa lỗi hiển thị cho KaTeX.

```css
/* --- CSS Variables for Theming --- */
:root {
    --bg-color: #ffffff;
    --text-color: #333;
    --panel-bg: #f3f3f3;
    --panel-border: #ddd;
    --primary-color: #007acc;
    --primary-hover: #005a9e;
    --link-color: #4a90e2;
    --solution-bg: #f9f9f9;
    --correct-answer: #28a745;
}

body.dark-mode {
    --bg-color: #1e1e1e;
    --text-color: #ccc;
    --panel-bg: #252526;
    --panel-border: #333;
    --primary-color: #007acc;
    --primary-hover: #009cff;
    --link-color: #69b3ff;
    --solution-bg: #2a2d2e;
    --correct-answer: #4dcc70;
}

/* --- Global & Layout --- */
body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    margin: 0;
    padding: 0;
    color: var(--text-color);
    background-color: var(--bg-color);
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
    transition: background-color 0.3s, color 0.3s;
}

/* --- Header Bar --- */
.header-bar {
    height: 50px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    background-color: var(--panel-bg);
    border-bottom: 1px solid var(--panel-border);
    flex-shrink: 0;
}

.header-controls, .header-info {
    display: flex;
    align-items: center;
    gap: 20px;
}

.button {
    background-color: var(--primary-color);
    color: white;
    border: none;
    padding: 8px 15px;
    border-radius: 5px;
    cursor: pointer;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: background-color 0.2s;
}
.button:hover {
    background-color: var(--primary-hover);
}
.theme-button { padding: 8px 10px; }
.clear-button { background-color: #d9534f; }
.clear-button:hover { background-color: #c9302c; }


#status-message {
    color: var(--text-color);
    opacity: 0.8;
    font-style: italic;
}
#question-counter {
    font-weight: bold;
    background-color: rgba(128, 128, 128, 0.2);
    padding: 5px 10px;
    border-radius: 5px;
}

/* --- Main Container & Panels --- */
.main-container {
    display: flex;
    flex-grow: 1;
    overflow: hidden;
}

.panel {
    flex: 1;
    overflow: auto;
    box-sizing: border-box;
}

#editor-container {
    border-right: 1px solid var(--panel-border);
}

#render-container {
    padding: 20px;
}

/* --- Find/Replace Bar --- */
#find-replace-bar {
    height: 50px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 20px;
    background-color: var(--panel-bg);
    border-top: 1px solid var(--panel-border);
    flex-shrink: 0;
}
#find-replace-bar input {
    flex-grow: 1;
    padding: 8px;
    border: 1px solid var(--panel-border);
    border-radius: 4px;
    background-color: var(--bg-color);
    color: var(--text-color);
}


/* --- Render Content Styles --- */
.question-block {
    margin-bottom: 25px;
    padding-bottom: 20px;
    border-bottom: 1px solid var(--panel-border);
}
.question-title {
    margin-bottom: 10px;
    font-size: 1.1em;
    line-height: 1.6;
}
.question-title strong { color: var(--primary-color); }
.options-list { list-style-type: none; padding-left: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 15px;}
.options-list li { padding-left: 25px; position: relative; }
.options-list li::before { content: attr(data-option); position: absolute; left: 0; font-weight: bold; }
.options-list li.correct-answer { color: var(--correct-answer); font-weight: bold; }
.options-list li.correct-answer::before { content: attr(data-option) " ✔"; color: var(--correct-answer); }
.solution-link { display: inline-block; margin-top: 10px; padding: 5px 10px; background-color: transparent; border: 1px solid var(--link-color); color: var(--link-color); border-radius: 4px; cursor: pointer; text-decoration: none; }
.solution-link:before { content: '▶ '; transition: transform 0.2s ease-in-out; display: inline-block; }
.solution-link.expanded:before { transform: rotate(90deg); }
.solution-content { display: none; margin-top: 10px; padding: 15px; background-color: var(--solution-bg); border-left: 3px solid var(--link-color); border-radius: 4px; line-height: 1.8; }
.error-text { color: #ff4d4d; font-weight: bold; }

/* --- KaTeX styling --- */
.katex {
    font-size: 1.1em !important;
}
.katex * {
    color: magenta !important;
}
```

---

### 3. File: `pdftotext.js`
Đây là file Javascript chính, chứa toàn bộ logic của ứng dụng, đã được sửa lỗi và tổ chức lại một cách hoàn chỉnh.

```javascript
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
            // Cấu hình tô màu cú pháp
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

            // Logic đúng để ưu tiên localStorage
            const savedContent = localStorage.getItem(EDITOR_CONTENT_KEY);
            const defaultContent = [
                '\\begin{ex}',
                '    Chào mừng bạn đến với LaTeX Editor!\\',
                '    Nội dung của bạn sẽ được tự động lưu.\\',
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

            // Lắng nghe sự kiện để lưu nội dung
            editor.onDidChangeModelContent(() => {
                const currentCode = editor.getValue();
                localStorage.setItem(EDITOR_CONTENT_KEY, currentCode);
                updateRender(currentCode);
            });

            // Render nội dung ban đầu
            updateRender(editor.getValue());
        });
    }

    function initializeEventListeners() {
        themeToggleButton.addEventListener('click', toggleTheme);

        replaceAllButton.addEventListener('click', () => {
            if (!editor) return;
            const findText = findInput.value;
            const replaceText = replaceInput.value;
            if (!findText) return;
            const escapedFindText = escapeRegExp(findText);
            const regex = new RegExp(escapedFindText, 'g');
            const newContent = editor.getValue().replace(regex, replaceText);
            editor.setValue(newContent);
        });
        
        clearDraftButton.addEventListener('click', () => {
            if (confirm('Bạn có chắc muốn xóa bản nháp và quay về mặc định?')) {
                localStorage.removeItem(EDITOR_CONTENT_KEY);
                const defaultContent = [
                    '\\begin{ex}',
                    '    Chào mừng bạn đến với LaTeX Editor!\\',
                    '    Nội dung của bạn sẽ được tự động lưu.\\',
                    '    Hãy thử chỉnh sửa và nhấn F5.',
                    '\\end{ex}',
                ].join('\n');
                if (editor) {
                    editor.setValue(defaultContent);
                }
            }
        });

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
    }
    
    // === EVENT HANDLERS & HELPERS ===
    function toggleTheme() {
        document.body.classList.toggle('dark-mode');
        const isDarkMode = document.body.classList.contains('dark-mode');
        
        if (editor) {
            monaco.editor.setTheme(isDarkMode ? 'vs-dark' : 'vs');
        }
        
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
            
            const payload = {
                contents: [{ parts: [{ text: promptText }, { inline_data: { mime_type: file.type, data: base64Image } }] }]
            };

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
```

---

### 4. File: `pdf-latex.js`
File này chứa các hàm phân tích cú pháp LaTeX để chuyển đổi sang HTML, hỗ trợ xuống dòng bằng `\\`.

```javascript
/**
 * Hàm hỗ trợ để tìm nội dung của một khối lệnh LaTeX có cặp ngoặc nhọn cân bằng.
 */
function extractBalancedBraceContent(text, commandName) {
    const regex = new RegExp(`\\\\${commandName}\\s*(\{)`);
    if (!text.match(regex)) return null;

    const match = text.match(regex);
    const commandStart = match.index;
    const braceStartIndex = commandStart + match[0].length - 1;
    let balance = 1;
    let contentEndIndex = -1;

    for (let i = braceStartIndex + 1; i < text.length; i++) {
        if (text[i] === '{') balance++;
        else if (text[i] === '}') balance--;
        if (balance === 0) {
            contentEndIndex = i;
            break;
        }
    }
    if (contentEndIndex !== -1) {
        return {
            content: text.substring(braceStartIndex + 1, contentEndIndex).trim(),
            fullMatch: text.substring(commandStart, contentEndIndex + 1),
        };
    }
    throw new Error(`Dấu ngoặc '{' của lệnh \\${commandName} không được đóng.`);
}

/**
 * Hàm hỗ trợ để tìm tất cả các cặp ngoặc nhọn độc lập.
 */
function extractCurlyBraceContents(text) {
    let contents = [];
    let balance = 0;
    let currentBlockStart = -1;
    text = text.trim();

    for (let i = 0; i < text.length; i++) {
        let char = text[i];
        if (char === '{') {
            if (balance === 0) currentBlockStart = i + 1;
            balance++;
        } else if (char === '}') {
            if (balance === 0) throw new Error(`Dấu '}' thừa tại vị trí ${i}.`);
            balance--;
            if (balance === 0) {
                contents.push(text.substring(currentBlockStart, i));
                currentBlockStart = -1;
            }
        } else if (balance === 0 && char.trim() !== '') {
            if (['$', '&', '\\'].includes(char)) continue;
            throw new Error(`Ký tự '${char}' không hợp lệ ngoài dấu ngoặc tại vị trí ${i}.`);
        }
    }
    if (balance !== 0) throw new Error("Dấu ngoặc '{' không khớp.");
    return contents;
}


/**
 * Chuyển đổi một khối câu hỏi từ định dạng \begin{ex} sang HTML.
 * Hỗ trợ xuống dòng bằng \\ mọi nơi.
 */
function parseSingleExBlockToHtml(exBlock, questionNumber) {
    const mainContentMatch = exBlock.match(/\\begin{ex}([\s\S]*?)\\end{ex}/i);
    if (!mainContentMatch) return '';

    let content = mainContentMatch[1].trim();
    let questionBody = '';
    let choicesArray = [];
    let solutionContent = '';
    let syntaxError = null;

    // 1. Tách lời giải
    try {
        const loigiaiResult = extractBalancedBraceContent(content, 'loigiai');
        if (loigiaiResult) {
            solutionContent = loigiaiResult.content.replace(/\\\\/g, '<br>');
            content = content.replace(loigiaiResult.fullMatch, '').trim();
        }
    } catch (error) {
        syntaxError = `Lỗi cú pháp \\loigiai: ${error.message}`;
    }

    // 2. Tách câu hỏi và đáp án
    const choiceMatch = content.match(/\\choice/i);
    if (choiceMatch) {
        questionBody = content.substring(0, choiceMatch.index).trim();
        let choicesText = content.substring(choiceMatch.index + '\\choice'.length).trim();
        try {
            if (!syntaxError) {
                choicesArray = extractCurlyBraceContents(choicesText);
            }
        } catch (error) {
            syntaxError = `Lỗi cú pháp đáp án: ${error.message}`;
        }
    } else {
        questionBody = content;
    }
    
    questionBody = questionBody.replace(/\\\\/g, '<br>');

    // 3. Dựng HTML
    let html = '<div class="question-block">';
    html += `<div class="question-title"><strong>Câu ${questionNumber}.</strong> ${questionBody}</div>`;
    
    if (syntaxError) {
        html += `<p class="error-text">${syntaxError}</p>`;
    } 
    else if (choicesArray.length > 0) {
        let optionsHtml = '<ul class="options-list">';
        let optionLetterCode = 65; // 'A'
        
        choicesArray.forEach(choice => {
            const isTrue = /\\True/.test(choice);
            const choiceText = choice.replace(/\\True/, '').replace(/\\\\/g, '<br>').trim();
            const optionLetter = String.fromCharCode(optionLetterCode++);
            optionsHtml += `<li class="${isTrue ? 'correct-answer' : ''}" data-option="${optionLetter}.">${choiceText}</li>`;
        });
        optionsHtml += '</ul>';
        html += optionsHtml;
    }

    if (solutionContent) {
        html += `<a href="#" class="solution-link">Lời giải</a><div class="solution-content">${solutionContent}</div>`;
    }

    html += '</div>';
    return html;
}

/**
 * Hàm chính để chuyển đổi toàn bộ nội dung LaTeX sang HTML để render.
 */
function convertLatexToHtml(rawContent) {
    if (typeof rawContent !== 'string' || !rawContent.trim()) {
        return { html: '<p>Chưa có nội dung.</p>', count: 0 };
    }

    let cleanedContent = rawContent.split('\n')
        .map(line => {
            const commentIndex = line.search(/(?<!\\)%/);
            return commentIndex !== -1 ? line.substring(0, commentIndex) : line;
        }).join('\n');

    const exBlockRegex = /(\\begin{ex}[\s\S]*?\\end{ex})/ig;
    const parts = cleanedContent.split(exBlockRegex);
    
    let finalHtml = '';
    let questionCount = 0;
    
    parts.forEach(part => {
        if (!part || part.trim() === '') return;
        if (part.trim().startsWith('\\begin{ex}')) {
            questionCount++;
            finalHtml += parseSingleExBlockToHtml(part, questionCount);
        }
    });

    return {
        html: finalHtml || '<p>Không tìm thấy khối `\\begin{ex}` nào.</p>',
        count: questionCount
    };
}
```

---

### 5. File: `pdf.json`
File cấu hình cho API, chứa API key và prompt.

```json
{
  "geminiApiKey": "AIza...CỦA_BẠN_Ở_ĐÂY",
  "apiUrl": "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent",
  "prompts": {
    "textLatex": "Bạn là một công cụ OCR chuyên nghiệp. Hãy trích xuất toàn bộ văn bản và nội dung toán học từ hình ảnh này. Xác định MỖI câu hỏi trắc nghiệm riêng biệt. Đối với MỖI câu hỏi, trích xuất nội dung câu hỏi, các lựa chọn và lời giải. Định dạng MỖI câu hỏi thành một khối LaTeX riêng biệt như sau:\n\n\\begin{ex}\n[Nội dung câu hỏi, bao gồm số câu nếu có]\n\\choice\n{ Nội dung lựa chọn A }\n{ Nội dung lựa chọn B }\n{ Nội dung lựa chọn C }\n{ Nội dung lựa chọn D }\n\\loigiai{\n[Nội dung lời giải nếu có]\n}\n\\end{ex}\n\nXác định lựa chọn đúng và thêm macro \\True trước lựa chọn đó. Ví dụ: {\\True Nội dung lựa chọn đúng}. Đảm bảo TẤT CẢ nội dung toán học (công thức, biến số, điểm, vector, số) được định dạng trong chế độ toán LaTeX ($...$ hoặc \\[...\\]). Sử dụng \\\\ ở cuối mỗi dòng để xuống dòng trong lời giải.\nChỉ trả về CÁC khối LaTeX đã định dạng, KHÔNG bao gồm bất kỳ lời mở đầu, kết luận hay markdown ```latex``` nào."
  }
}
```

---

### 6. File: `pdf_replace.json`
File chứa các quy tắc thay thế văn bản tùy chỉnh.

```json
[
  {
    "find": "Lò̀i giải",
    "replace": "\\loigiai"
  },
  {
    "find": "Câu ([0-9]+)\\.",
    "replace": "Câu $1:",
    "isRegex": true
  },
  {
    "find": "\\(\\s*-\\s*\\infty",
    "replace": "(-\\infty",
    "isRegex": true
  },
  {
    "find": "choise",
    "replace": "\\choice"
  },
  {
    "find": "begin(ex)",
    "replace": "begin{ex}",
    "isRegex": true
  }
]
```