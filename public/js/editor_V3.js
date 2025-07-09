// js/editor_V3.js - PHIÊN BẢN NÂNG CẤP VỚI PANDOC BACKEND

document.addEventListener('DOMContentLoaded', () => {

    // --- 1. DOM ELEMENT CACHING ---
    const getEl = (id) => document.getElementById(id);
    const questionEditorContainer = getEl("question-editor-container");
    const reviewDisplayArea = getEl("review-display-area");
    const addQuestionBtn = getEl("add-question-btn");
    const uploadDocxBtn = getEl("upload-docx-btn");
    const docxFileInput = getEl("docx-file-input");
    const copyContentBtn = getEl("copy-content-btn");
    const clearEditorBtn = getEl("clear-editor-btn");
    const generatedKeysInput = getEl("generated-keys");
    const generatedCoresInput = getEl("generated-cores");
    const charCountSpan = getEl("char-count");
    const lineCountSpan = getEl("line-count");
    const questionCountSpan = getEl("question-count");

    // --- 2. STATE MANAGEMENT ---
    let questions = [];

    // --- 3. HELPER & UI INTERACTION FUNCTIONS ---
    function insertTextToEditor(startTag, endTag, placeholder) {
        const activeTextarea = document.querySelector('.question-editor-frame.is-focused .question-textarea');
        if (!activeTextarea) {
            Swal.fire({ icon: 'info', title: 'Chưa chọn khung soạn thảo', text: 'Vui lòng nhấp vào một khung câu hỏi để bắt đầu chèn nội dung.' });
            return;
        }
        const start = activeTextarea.selectionStart;
        const end = activeTextarea.selectionEnd;
        const originalText = activeTextarea.value;
        const selectedText = originalText.substring(start, end) || placeholder;
        activeTextarea.value = originalText.substring(0, start) + startTag + selectedText + endTag + originalText.substring(end);
        activeTextarea.focus();
        activeTextarea.setSelectionRange(start + startTag.length, start + startTag.length + selectedText.length);
        activeTextarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function convertLineBreaks(text) {
        if (!text || typeof text !== 'string') return text;
        const mathBlocksRegex = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$[\s\S]*?\$|\\\([\s\S]*?\\\))/g;
        return text.split(mathBlocksRegex).map((part, index) => (index % 2 === 0) ? (part || '').replace(/\\\\/g, '<br>') : part).join('');
    }

    /**
     * Xử lý cú pháp [align]...[/align] và chuyển thành thẻ <img> với class tương ứng.
     */
    function processImagePlaceholders(text) {
        if (!text || typeof text !== 'string') return text;
        let processedText = text;
        const alignmentRegex = /\[(center|left|right)\]\s*(https?:\/\/[^\]\s]+)\s*\[\/\1\]/gi;
        processedText = processedText.replace(alignmentRegex, (match, alignment, url) => {
            return `<img src="${url}" alt="image" class="inline-image img-${alignment}">`;
        });
        return processedText;
    }

    function extractInfoFromBlock(block) {
        let key = ''; let type = 'UNKNOWN';
        const mcMatch = block.match(/^\s*#(?![#])\s*([A-D])\./m);
        if (mcMatch) { type = 'MC'; key = mcMatch[1]; return { key, type }; }
        if (/^\s*[a-d]\)/m.test(block)) {
            type = 'TABLE_TF';
            let tfKey = "";
            tfKey += /^\s*#(?![#])\s*a\)/m.test(block) ? "T" : "F";
            tfKey += /^\s*#(?![#])\s*b\)/m.test(block) ? "T" : "F";
            tfKey += /^\s*#(?![#])\s*c\)/m.test(block) ? "T" : "F";
            tfKey += /^\s*#(?![#])\s*d\)/m.test(block) ? "T" : "F";
            key = tfKey;
            return { key, type };
        }
        const numericMatch = block.match(/^\s*#(?![#])(\s*[\d.,]+)/m);
        if (numericMatch) { type = 'NUMERIC'; key = numericMatch[1].trim().replace(/,/g, '.'); return { key, type }; }
        if (/^\s*[A-D]\./m.test(block)) { type = 'MC'; }
        return { key, type };
    }

    function renderKatexInElement(element) {
        if (window.renderMathInElement) {
            try {
                window.renderMathInElement(element, {
                    delimiters: [
                        { left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false },
                        { left: '\\[', right: '\\]', display: true }, { left: '\\(', right: '\\)', display: false }
                    ], throwOnError: false
                });
            } catch (error) { console.error("KaTeX rendering error:", error); }
        }
    }

    // --- 4. CORE UI RENDERING ---
    function renderEditor() {
        questionEditorContainer.innerHTML = '';
        questions.forEach((questionText, index) => {
            const frame = document.createElement('div');
            frame.className = 'question-editor-frame';
            frame.dataset.index = index;
            frame.innerHTML = `<div class="frame-header"><span class="frame-title">Câu ${index + 1}</span><div class="frame-actions"><button class="collapse-btn" title="Thu gọn/Mở rộng"><i class="fas fa-chevron-down collapse-icon"></i></button><button class="delete-btn" title="Xóa câu này"><i class="fas fa-trash-alt"></i></button></div></div><div class="frame-content"><textarea class="question-textarea"></textarea></div>`;
            frame.querySelector('.question-textarea').value = questionText;
            questionEditorContainer.appendChild(frame);
        });
        attachFrameEventListeners();
    }

    function attachFrameEventListeners() {
        document.querySelectorAll('.question-editor-frame').forEach(frame => {
            const index = parseInt(frame.dataset.index, 10);
            const textarea = frame.querySelector('.question-textarea');
            textarea.addEventListener('input', () => { questions[index] = textarea.value; updateReview(); });
            textarea.addEventListener('focus', () => {
                document.querySelectorAll('.question-editor-frame').forEach(f => f.classList.remove('is-focused'));
                frame.classList.add('is-focused');
            });
            frame.querySelector('.frame-header').addEventListener('click', e => {
                if (!e.target.closest('.delete-btn')) frame.classList.toggle('collapsed');
            });
            frame.querySelector('.delete-btn').addEventListener('click', () => {
                Swal.fire({ title: `Xóa Câu ${index + 1}?`, text: 'Hành động này không thể hoàn tác.', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', cancelButtonText: 'Hủy', confirmButtonText: 'Vẫn xóa' })
                    .then(result => { if (result.isConfirmed) { questions.splice(index, 1); renderEditor(); updateReview(); } });
            });
        });
    }

    function renderQuestionPreview(parsedData, index, correctKey) {
        const questionDiv = document.createElement("div");
        questionDiv.className = "question";
        const statementDiv = document.createElement("div");
        statementDiv.className = "question-statement";
        let questionContent = parsedData.statement.replace(/^(Câu\s*\d+\s*[:.]?\s*)/i, '').trim();
        statementDiv.innerHTML = `<span class="question-number-highlight">Câu ${index + 1}:</span> ${convertLineBreaks(processImagePlaceholders(questionContent))}`;
        questionDiv.appendChild(statementDiv);
        // ... (phần còn lại của renderQuestionPreview giữ nguyên) ...
        if(parsedData.solution) {
            //...
        }
        reviewDisplayArea.appendChild(questionDiv);
    }

    // --- 5. MAIN LOGIC FLOW ---
    let updateReviewTimeout;
    function updateReview() {
        clearTimeout(updateReviewTimeout);
        updateReviewTimeout = setTimeout(() => {
            const rawContent = questions.join('\n\n');
            reviewDisplayArea.innerHTML = '';
            charCountSpan.textContent = rawContent.length;
            lineCountSpan.textContent = rawContent.split('\n').length;
            questionCountSpan.textContent = questions.length;
            if (questions.length === 0) {
                reviewDisplayArea.innerHTML = '<p class="placeholder-message">Nội dung xem trước sẽ hiển thị ở đây.</p>';
                generatedKeysInput.value = ''; generatedCoresInput.value = ''; return;
            }
            const allKeys = [], allCores = [];
            questions.forEach((block, index) => {
                const info = extractInfoFromBlock(block);
                allKeys.push(info.key);
                allCores.push(info.type === 'TABLE_TF' ? '0.25,0.5,0.75,1' : '0.5');
                const cleanBlock = block.replace(/^\s*#(?![#])\s*/gm, '');
                if (window.parseMCQuestion) {
                    const parsedData = window.parseMCQuestion(cleanBlock);
                    if (parsedData) renderQuestionPreview(parsedData, index, info.key);
                    else reviewDisplayArea.innerHTML += `<p class="error-message">[Lỗi phân tích Câu ${index + 1}]</p>`;
                }
            });
            generatedKeysInput.value = allKeys.join('|');
            generatedCoresInput.value = allCores.join('|');
            renderKatexInElement(reviewDisplayArea);
        }, 300);
    }
    
    // --- 6. DOCX UPLOAD LOGIC ---
    /**
     * Xử lý file DOCX bằng cách gửi nó đến backend Pandoc.
     */
    async function handleDocxUpload(event) {
        const file = event.target.files[0];
        if (!file || !file.name.endsWith('.docx')) {
            if (file) Swal.fire('File không hợp lệ', 'Vui lòng chỉ chọn file .docx.', 'error');
            return;
        }
        
        // **ĐÂY LÀ URL CỦA BACKEND MẠNH MẼ MỚI CỦA BẠN**
        const backendUrl = 'https://tikz-server-797442200106.asia-southeast1.run.app/process-full-docx';

        Swal.fire({
            title: 'Đang gửi file đến server...',
            html: 'Server đang xử lý file DOCX, chuyển đổi công thức MathType và tải lên hình ảnh. Vui lòng chờ...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch(backendUrl, { method: 'POST', body: formData });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.log || data.error || 'Lỗi không xác định từ server.');
            }

            const plainTextContent = data.text;
            if (!plainTextContent) {
                throw new Error('Server không trả về nội dung văn bản.');
            }

            const newQuestions = plainTextContent.split(/(?=Câu\s*\d+[:.]?\s*)/)
                .map(q => q.trim())
                .filter(b => b.trim() !== '');

            if (newQuestions.length === 0) {
                throw new Error("Không tìm thấy câu hỏi nào trong file. (Gợi ý: Mỗi câu hỏi phải bắt đầu bằng 'Câu X:')");
            }

            questions = newQuestions;
            renderEditor();
            updateReview();
            Swal.fire('Thành công!', `Đã xử lý file DOCX và chuyển đổi ${questions.length} câu hỏi.`, 'success');

        } catch (err) {
            console.error('Lỗi khi xử lý DOCX:', err);
            Swal.fire('Đã xảy ra lỗi', `Không thể xử lý file: ${err.message}`, 'error');
        } finally {
            event.target.value = '';
        }
    }

    // --- 7. EVENT LISTENERS ---
    addQuestionBtn.addEventListener('click', () => {
        const newQuestionTemplate = `Câu ${questions.length + 1}: \nA. \nB. \nC. \nD. \n\\begin{loigiai}\n\n\\end{loigiai}`;
        questions.push(newQuestionTemplate); renderEditor(); updateReview();
    });
    clearEditorBtn.addEventListener('click', () => {
        Swal.fire({ title: 'Xóa tất cả?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', cancelButtonText: 'Hủy', confirmButtonText: 'Vẫn xóa' })
        .then(r => { if (r.isConfirmed) { questions = []; renderEditor(); updateReview(); } });
    });
    copyContentBtn.addEventListener('click', () => { /* ... */ });
    uploadDocxBtn.addEventListener('click', () => docxFileInput.click());
    docxFileInput.addEventListener('change', handleDocxUpload);

    // --- 8. INITIAL LOAD & GLOBAL FUNCTIONS ---
    initializeEditor();
    function initializeEditor() {
        const initialContent = `Câu 1: Thủ đô của Pháp là gì?
A. London
B. Berlin
#C. Paris
D. Rome
##options-layout=2x2
\\begin{loigiai}
Paris là thủ đô và là thành phố lớn nhất của Pháp.
\\end{loigiai}
`;
        questions = initialContent.split(/(?=\n*Câu\s*\d+:\s*)/).filter(block => block.trim() !== '');
        renderEditor();
        updateReview();
    }
    window.insertTextToEditor = insertTextToEditor;
    window.copySingleField = (inputId) => {
        const inputElement = document.getElementById(inputId);
        if (!inputElement || !inputElement.value.trim()) {
            Swal.fire({ icon: 'warning', title: 'Không có nội dung', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
            return;
        }
        navigator.clipboard.writeText(inputElement.value)
            .then(() => { Swal.fire({ icon: 'success', title: 'Đã sao chép!', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 }); })
            .catch(err => Swal.fire('Lỗi', 'Không thể sao chép: ' + err, 'error'));
    };
});