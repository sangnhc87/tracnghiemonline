/**
 * Zenith Editor - Main Script
 * Version: 15.0 (FINAL, STABLE & CORRECTED LOGIC FLOW)
 * Description: This definitive version corrects the core logic flow by splitting blocks
 * FIRST, then cleaning each block individually before parsing. This ensures all functionalities,
 * including answer highlighting and '##' directives, work correctly without requiring
 * any changes to quiz-parser.js.
 */

document.addEventListener('DOMContentLoaded', () => {

    // --- 1. DOM Element Caching ---
    const getEl = (id) => document.getElementById(id);
    const rawContentEditor = getEl("raw-content-editor");
    const reviewDisplayArea = getEl("review-display-area");
    const copyContentBtn = getEl("copy-content-btn"); 
    const clearEditorBtn = getEl("clear-editor-btn");
    const generatedKeysInput = getEl("generated-keys");
    const generatedCoresInput = getEl("generated-cores");
    const charCountSpan = getEl("char-count");
    const lineCountSpan = getEl("line-count");
    const questionCountSpan = getEl("question-count");

    // --- 2. Helper Functions ---
    function extractInfoFromBlock(block) {
        let key = '';
        let type = 'UNKNOWN';
        const mcMatch = block.match(/^\s*#(?![#])\s*([A-D])\./m);
        if (mcMatch) {
            type = 'MC';
            key = mcMatch[1];
            return { key, type };
        }
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
        if (numericMatch) {
             type = 'NUMERIC';
             key = numericMatch[1].trim().replace(/,/g, '.');
             return { key, type };
        }
        if (/^\s*[A-D]\./m.test(block)) {
            type = 'MC';
        }
        return { key, type };
    }

    // --- 3. Core Logic: The Main Update Function (CORRECTED) ---
    let updateReviewTimeout;
    function updateReview() {
        clearTimeout(updateReviewTimeout);
        updateReviewTimeout = setTimeout(() => {
            const rawContent = rawContentEditor.value;
            
            reviewDisplayArea.innerHTML = ''; 
            generatedKeysInput.value = '';
            generatedCoresInput.value = '';
            questionCountSpan.textContent = '0';
            charCountSpan.textContent = rawContent.length;
            lineCountSpan.textContent = rawContent.split('\n').length;
            
            if (typeof window.parseMCQuestion !== 'function') {
                reviewDisplayArea.innerHTML = '<p class="error-message">Lỗi: Không tìm thấy quiz-parser.js.</p>';
                return;
            }

            // Step 1: Split into blocks using the original, reliable method.
            const questionBlocks = rawContent.split(/(?=\n*Câu\s*\d+:\s*)/).filter(block => block.trim() !== '');

            if (questionBlocks.length === 0) {
                reviewDisplayArea.innerHTML = '<p class="placeholder-message">Nội dung xem trước sẽ hiển thị ở đây.</p>';
                return;
            }

            questionCountSpan.textContent = questionBlocks.length;
            const allKeys = [];
            const allCores = [];

            questionBlocks.forEach((block, index) => {
                const info = extractInfoFromBlock(block);
                allKeys.push(info.key);
                
                let coreForThisQuestion = '0.2';
                switch (info.type) {
                    case 'MC': case 'NUMERIC': coreForThisQuestion = '0.5'; break;
                    case 'TABLE_TF': coreForThisQuestion = '0.1,0.25,0.5,1'; break;
                }
                allCores.push(coreForThisQuestion);
                
                // ==========================================================
                // ==          ĐÂY LÀ PHẦN LÀM SẠCH QUAN TRỌNG NHẤT        ==
                // ==========================================================
                const lines = block.split('\n');
                const cleanLines = lines.map(line => {
                    // Xóa dấu # và khoảng trắng ở đầu dòng cho các dòng đáp án
                    return line.replace(/^\s*#(?![#])\s*/, '');
                });
                const cleanBlock = cleanLines.join('\n');

                const parsedData = window.parseMCQuestion(cleanBlock);
                if (parsedData) {
                    renderQuestionPreview(parsedData, index, info.key);
                } else {
                    reviewDisplayArea.innerHTML += `<p class="error-message">[Lỗi phân tích Câu ${index + 1}]</p>`;
                }
            });

            generatedKeysInput.value = allKeys.join('|');
            generatedCoresInput.value = allCores.join('|');
            renderKatexInElement(reviewDisplayArea);
        }, 500);
    }
    // THAY THẾ TOÀN BỘ HÀM renderQuestionPreview TRONG editor.js BẰNG HÀM NÀY

function renderQuestionPreview(parsedData, index, correctKey) {
    const questionDiv = document.createElement("div");
    questionDiv.className = "question";
    questionDiv.id = `review-q-${index}`;
    
    // Xử lý Nội dung câu hỏi
    const statementDiv = document.createElement("div");
    statementDiv.className = "question-statement";
    let questionContent = parsedData.statement.replace(/^(Câu\s*\d+\s*[:.]?\s*)/i, '').trim();
    const newQuestionTitle = `<span class="question-number-highlight">Câu ${index + 1}:</span>`;
    // Áp dụng hàm convertLineBreaks
    statementDiv.innerHTML = newQuestionTitle + " " + convertLineBreaks(processImagePlaceholders(questionContent));
    questionDiv.appendChild(statementDiv);

    // Xử lý câu Trắc nghiệm (MC)
    if (parsedData.type === 'MC') {
        const optionsContainer = document.createElement('div');
        optionsContainer.className = `mc-options mc-layout-${parsedData.layout}`;
        parsedData.options.forEach(opt => {
            const optionDiv = document.createElement("div");
            const isCorrect = correctKey && correctKey.toUpperCase() === opt.label.replace('.', '');
            optionDiv.className = isCorrect ? "mc-option correct-answer-preview" : "mc-option";
            // Áp dụng hàm convertLineBreaks
            optionDiv.innerHTML = `<span class="mc-option-label">${opt.label}</span><span class="mc-option-content">${convertLineBreaks(processImagePlaceholders(opt.content))}</span>`;
            optionsContainer.appendChild(optionDiv);
        });
        questionDiv.appendChild(optionsContainer);
    } 
    // Xử lý câu Đúng/Sai dạng bảng (TABLE_TF)
    else if (parsedData.type === 'TABLE_TF') {
        const table = document.createElement('table');
        table.className = 'table-tf-container';
        table.innerHTML = `<thead><tr><th>Mệnh đề</th><th>Đúng</th><th>Sai</th></tr></thead><tbody>`;
        parsedData.options.forEach((opt, idx) => {
            // Áp dụng hàm convertLineBreaks
            const processedOptionContent = convertLineBreaks(processImagePlaceholders(opt.content));
            if (correctKey && idx < correctKey.length) {
                const isCorrectT = correctKey[idx] === 'T';
                const tfClassT = isCorrectT ? 'table-tf-radio selected' : 'table-tf-radio';
                const tfClassF = !isCorrectT ? 'table-tf-radio selected' : 'table-tf-radio';
                table.innerHTML += `<tr><td>${opt.label}) ${processedOptionContent}</td><td><label class="${tfClassT}"></label></td><td><label class="${tfClassF}"></label></td></tr>`;
            } else {
                table.innerHTML += `<tr><td>${opt.label}) ${processedOptionContent}</td><td><label class="table-tf-radio"></label></td><td><label class="table-tf-radio"></label></td></tr>`;
            }
        });
        table.innerHTML += `</tbody></table>`;
        questionDiv.appendChild(table);
    } 
    // Xử lý câu Điền số (NUMERIC)
    else if (parsedData.type === 'NUMERIC') {
         const numDiv = document.createElement("div");
         numDiv.className = "numeric-option";
         numDiv.innerHTML = `<input type="text" placeholder="Đáp số: ${correctKey || 'N/A'}" disabled>`; 
         questionDiv.appendChild(numDiv);
    }

    // Xử lý Lời giải
    if (parsedData.solution && parsedData.solution.trim() !== '') {
        const toggleBtn = document.createElement("button");
        toggleBtn.className = "toggle-explanation btn";
        toggleBtn.textContent = "Xem lời giải";
        const expDiv = document.createElement("div");
        expDiv.className = "explanation hidden";
        // Áp dụng hàm convertLineBreaks
        expDiv.innerHTML = convertLineBreaks(processImagePlaceholders(parsedData.solution));
        toggleBtn.onclick = (e) => { e.stopPropagation(); expDiv.classList.toggle("hidden"); toggleBtn.textContent = expDiv.classList.contains("hidden") ? "Xem lời giải" : "Ẩn lời giải"; };
        questionDiv.appendChild(toggleBtn);
        questionDiv.appendChild(expDiv);
    }
    reviewDisplayArea.appendChild(questionDiv);
}
    // --- 4. Rendering & Other Utility Functions ---
    function renderQuestionPreview_GGGG(parsedData, index, correctKey) {
        const questionDiv = document.createElement("div");
        questionDiv.className = "question";
        questionDiv.id = `review-q-${index}`;
        const statementDiv = document.createElement("div");
        statementDiv.className = "question-statement";
        let questionContent = parsedData.statement.replace(/^(Câu\s*\d+\s*[:.]?\s*)/i, '').trim();
        const newQuestionTitle = `<span class="question-number-highlight">Câu ${index + 1}:</span>`;
        statementDiv.innerHTML = newQuestionTitle + " " + processImagePlaceholders(questionContent);
        questionDiv.appendChild(statementDiv);

        if (parsedData.type === 'MC') {
            const optionsContainer = document.createElement('div');
            optionsContainer.className = `mc-options mc-layout-${parsedData.layout}`;
            parsedData.options.forEach(opt => {
                const optionDiv = document.createElement("div");
                const isCorrect = correctKey && correctKey.toUpperCase() === opt.label.replace('.', '');
                optionDiv.className = isCorrect ? "mc-option correct-answer-preview" : "mc-option";
                optionDiv.innerHTML = `<span class="mc-option-label">${opt.label}</span><span class="mc-option-content">${processImagePlaceholders(opt.content)}</span>`;
                optionsContainer.appendChild(optionDiv);
            });
            questionDiv.appendChild(optionsContainer);
        } else if (parsedData.type === 'TABLE_TF') {
            const table = document.createElement('table');
            table.className = 'table-tf-container';
            table.innerHTML = `<thead><tr><th>Mệnh đề</th><th>Đúng</th><th>Sai</th></tr></thead><tbody>`;
            parsedData.options.forEach((opt, idx) => {
                if (correctKey && idx < correctKey.length) {
                    const isCorrectT = correctKey[idx] === 'T';
                    const tfClassT = isCorrectT ? 'table-tf-radio selected' : 'table-tf-radio';
                    const tfClassF = !isCorrectT ? 'table-tf-radio selected' : 'table-tf-radio';
                    table.innerHTML += `<tr><td>${opt.label}) ${processImagePlaceholders(opt.content)}</td><td><label class="${tfClassT}"></label></td><td><label class="${tfClassF}"></label></td></tr>`;
                } else {
                    table.innerHTML += `<tr><td>${opt.label}) ${processImagePlaceholders(opt.content)}</td><td><label class="table-tf-radio"></label></td><td><label class="table-tf-radio"></label></td></tr>`;
                }
            });
            table.innerHTML += `</tbody></table>`;
            questionDiv.appendChild(table);
        } else if (parsedData.type === 'NUMERIC') {
             const numDiv = document.createElement("div");
             numDiv.className = "numeric-option";
             numDiv.innerHTML = `<input type="text" placeholder="Đáp số: ${correctKey || 'N/A'}" disabled>`; 
             questionDiv.appendChild(numDiv);
        }
        if (parsedData.solution && parsedData.solution.trim() !== '') {
            const toggleBtn = document.createElement("button");
            toggleBtn.className = "toggle-explanation btn";
            toggleBtn.textContent = "Xem lời giải";
            const expDiv = document.createElement("div");
            expDiv.className = "explanation hidden";
            expDiv.innerHTML = processImagePlaceholders(parsedData.solution);
            toggleBtn.onclick = (e) => { e.stopPropagation(); expDiv.classList.toggle("hidden"); toggleBtn.textContent = expDiv.classList.contains("hidden") ? "Xem lời giải" : "Ẩn lời giải"; };
            questionDiv.appendChild(toggleBtn);
            questionDiv.appendChild(expDiv);
        }
        reviewDisplayArea.appendChild(questionDiv);
    }
    function processImagePlaceholders(text) {
        if (!text || typeof text !== 'string') return text;
        let processedText = text;
        processedText = processedText.replace(/sangnhc1\//g, 'https://gitlab.com/nguyensangnhc/pic4web/-/raw/main/Hinh/');
        processedText = processedText.replace(/sangnhc2\//g, 'https://gitlab.com/nguyensangnhc/tikz4web/-/raw/main/Hinh/');
        processedText = processedText.replace(/sangnhc3\//g, 'https://gitlab.com/nguyensangnhc/tikz2png/-/raw/main/Hinh/');
        processedText = processedText.replace(/sangnhc4\//g, 'https://gitlab.com/nguyensangnhc/png2link/-/raw/main/Hinh/');
        return processedText;
    }
    function renderKatexInElement(element) {
        if (window.renderMathInElement) {
            try {
                window.renderMathInElement(element, {
                    delimiters: [
                        {left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false},
                        {left: '\\(', right: '\\)', display: false}, {left: '\\[', right: '\\]', display: true}
                    ], throwOnError: false
                });
            } catch (error) { console.error("KaTeX rendering error:", error); }
        }
    }
    window.insertTextToEditor = (startTag, endTag, placeholderText = '') => {
        const editor = rawContentEditor;
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const textToInsert = (start !== end) ? startTag + editor.value.substring(start, end) + endTag : startTag + placeholderText + endTag;
        editor.value = editor.value.substring(0, start) + textToInsert + editor.value.substring(end);
        editor.focus();
        editor.selectionEnd = (start !== end) ? start + textToInsert.length : start + startTag.length + placeholderText.length;
        updateReview();
    };
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
    
    // --- 5. Event Listeners ---
    rawContentEditor.addEventListener('input', updateReview);
    
    clearEditorBtn.addEventListener('click', () => {
        Swal.fire({
            title: 'Xác nhận xóa?', text: 'Toàn bộ nội dung soạn thảo sẽ bị xóa.',
            icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33',
            cancelButtonText: 'Hủy', confirmButtonText: 'Vẫn xóa'
        }).then((result) => { if (result.isConfirmed) { rawContentEditor.value = ''; updateReview(); } });
    });
    
    if (copyContentBtn) {
        copyContentBtn.addEventListener('click', () => {
            const lines = rawContentEditor.value.split('\n');
            const cleanLines = lines.map(line => line.replace(/^\s*#(?![#])\s*/, ''));
            const content = cleanLines.join('\n');

            if (content.trim() === '') {
                Swal.fire('Chưa có nội dung', 'Vui lòng soạn thảo trước khi sao chép.', 'warning');
                return;
            }
            navigator.clipboard.writeText(content)
                .then(() => Swal.fire('Thành công!', 'Đã sao chép nội dung đề thi.', 'success'))
                .catch(err => Swal.fire('Lỗi', 'Không thể sao chép: ' + err, 'error'));
        });
    }
    
    // --- 6. Initial Load ---
    rawContentEditor.value = `Câu 1: Thủ đô của Pháp là gì?
A. London
B. Berlin
#C. Paris
D. Rome
##options-layout=2x2
\\begin{loigiai}
Paris là thủ đô và là thành phố lớn nhất của Pháp.
\\end{loigiai}

Câu 2: Kết quả của phép tính 5 x 5 là bao nhiêu?
#25
\\begin{loigiai}
5 x 5 = 25.
\\end{loigiai}

Câu 3: Đánh giá các mệnh đề sau:
#a) 2 là số chẵn.
b) Trái Đất hình vuông.
#c) Nước sôi ở 100 độ C.
d) hay
\\begin{loigiai}
Mệnh đề (a), (c) đúng. Mệnh đề (b) sai.
\\end{loigiai}
`;
    updateReview();
});