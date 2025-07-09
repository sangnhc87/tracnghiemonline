// File: js/ex_converter_page.js
// PHIÊN BẢN HOÀN THIỆN - AUTO RENDER & REAL-TIME PREVIEW

document.addEventListener('DOMContentLoaded', () => {

    // --- 1. DOM ELEMENT CACHING ---
    const getEl = (id) => document.getElementById(id);
    const questionEditorContainer = getEl("question-editor-container");
    const converterOutputArea = getEl("converter-output-area");
    const reviewDisplayArea = getEl("review-display-area");
    const extractedKeysInput = getEl("extracted-keys");
    const extractedCoresInput = getEl("extracted-cores");
    
    const addQuestionBtn = getEl("add-question-btn");
    const loadFileBtn = getEl("load-file-btn");
    const fileInputHidden = getEl("file-input-hidden");
    const clearInputBtn = getEl("clear-input-btn");
    const copyOutputBtn = getEl("copy-output-btn");

    // --- 2. STATE & DEBOUNCING ---
    let questions = []; // Nguồn dữ liệu chính, chứa nội dung của từng câu hỏi.
    let debounceTimeout; // Biến để quản lý debouncing, tối ưu hiệu năng.

    // --- 3. UI RENDERING & EVENT HANDLING ---

    /**
     * Vẽ lại toàn bộ các khung soạn thảo từ mảng `questions`.
     */
    function renderEditor() {
        questionEditorContainer.innerHTML = '';
        questions.forEach((questionText, index) => {
            const frame = document.createElement('div');
            frame.className = 'question-editor-frame';
            frame.dataset.index = index;
            frame.innerHTML = `
                <div class="frame-header">
                    <span class="frame-title">Câu ${index + 1}</span>
                    <div class="frame-actions">
                        <button class="delete-btn" title="Xóa câu này"><i class="fas fa-trash-alt"></i></button>
                    </div>
                </div>
                <div class="frame-content">
                    <textarea class="question-textarea"></textarea>
                </div>
            `;
            frame.querySelector('.question-textarea').value = questionText;
            questionEditorContainer.appendChild(frame);
        });
        attachFrameEventListeners();
    }

    /**
     * Gán các sự kiện cần thiết cho mỗi khung soạn thảo.
     */
    function attachFrameEventListeners() {
        document.querySelectorAll('.question-editor-frame').forEach(frame => {
            const index = parseInt(frame.dataset.index, 10);
            const textarea = frame.querySelector('.question-textarea');
            
            // Lắng nghe sự kiện gõ phím để cập nhật state và kích hoạt auto-render.
            textarea.addEventListener('input', () => {
                questions[index] = textarea.value;
                triggerAutoConversion(); 
            });

            // Thêm class 'is-focused' để Kho Snippet biết chèn vào đâu.
            textarea.addEventListener('focus', () => {
                document.querySelectorAll('.question-editor-frame').forEach(f => f.classList.remove('is-focused'));
                frame.classList.add('is-focused');
            });

            // Xử lý sự kiện xóa câu hỏi.
            frame.querySelector('.delete-btn').addEventListener('click', () => {
                Swal.fire({
                    title: `Xác nhận xóa Câu ${index + 1}?`,
                    icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33',
                    cancelButtonText: 'Hủy', confirmButtonText: 'Vẫn xóa'
                }).then(result => { 
                    if (result.isConfirmed) {
                        questions.splice(index, 1);
                        renderEditor(); // Vẽ lại các khung
                        triggerAutoConversion(); // Cập nhật lại kết quả
                    }
                });
            });
        });
    }

    // --- 4. CORE CONVERSION & REVIEW LOGIC ---
    
    /**
     * Hàm trung gian, sử dụng debouncing để tối ưu hiệu năng.
     * Chỉ gọi hàm chuyển đổi chính sau khi người dùng ngừng gõ 500ms.
     */
    function triggerAutoConversion() {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(runFullConversion, 500);
    }
    
    /**
     * Hàm chuyển đổi chính: Lấy dữ liệu từ state, chuyển đổi và cập nhật UI.
     */
    function runFullConversion() {
        const fullInputContent = questions.join('\n\n');

        if (fullInputContent.trim() === '') {
            converterOutputArea.value = '';
            extractedKeysInput.value = '';
            extractedCoresInput.value = '';
            reviewDisplayArea.innerHTML = '<p style="text-align: center; color: #888;">Soạn thảo câu hỏi vào khung bên trái để xem trước.</p>';
            return;
        }

        if (typeof window.convertExToStandardFormat !== 'function' || typeof window.parseMCQuestion !== 'function') {
            console.error("Lỗi: Thiếu các file script cần thiết (ex-converter.js, quiz-parser.js).");
            return;
        }
        
        let conversionResult;
        try {
            conversionResult = window.convertExToStandardFormat(fullInputContent);
        } catch (error) {
            reviewDisplayArea.innerHTML = `<div class="error-message" style="padding: 20px; text-align:center;">
                                                <strong>Lỗi cú pháp:</strong><br>${error.message}
                                           </div>`;
            converterOutputArea.value = `LỖI: ${error.message}`;
            return; 
        }
        
        converterOutputArea.value = conversionResult.compiledContent;
        extractedKeysInput.value = conversionResult.keys;
        extractedCoresInput.value = conversionResult.cores;
        
        renderReview(conversionResult.compiledContent, conversionResult.keys);
    }
    
    /**
     * Render toàn bộ phần xem trước từ nội dung đã được chuyển đổi.
     * Hỗ trợ đầy đủ các loại câu hỏi và 4 định dạng LaTeX.
     */
    function renderReview(compiledContent, keysString) {
        const keysArray = keysString.split('|');
        const questionBlocks = compiledContent.split(/(?=Câu\s*\d+\s*:)/).filter(block => block.trim() !== '');
        
        reviewDisplayArea.innerHTML = '';

        if (questionBlocks.length === 0) {
            reviewDisplayArea.innerHTML = '<p style="text-align: center; color: #888;">Không có nội dung để xem trước.</p>';
            return;
        }

        questionBlocks.forEach((block, index) => {
            const parsedData = window.parseMCQuestion(block);
            const correctKey = keysArray[index] || '';
            
            if (parsedData) {
                const questionDiv = document.createElement("div");
                questionDiv.className = "question";

                const statementDiv = document.createElement("div");
                statementDiv.className = "question-statement";
                statementDiv.innerHTML = parsedData.statement;
                questionDiv.appendChild(statementDiv);

                switch (parsedData.type) {
                    case 'MC': {
                        const optionsContainer = document.createElement('div');
                        optionsContainer.className = `mc-options mc-layout-${parsedData.layout}`;
                        parsedData.options.forEach(opt => {
                            const optionDiv = document.createElement("div");
                            const isCorrect = correctKey && correctKey.toUpperCase() === opt.label.replace('.', '');
                            optionDiv.className = `mc-option ${isCorrect ? 'correct-answer-preview' : ''}`;
                            optionDiv.innerHTML = `<span class="mc-option-label">${opt.label}</span><span class="mc-option-content">${opt.content}</span>`;
                            optionsContainer.appendChild(optionDiv);
                        });
                        questionDiv.appendChild(optionsContainer);
                        break;
                    }
                    case 'TABLE_TF': {
                        const table = document.createElement('table');
                        table.className = 'table-tf-container';
                        let tableBody = '<thead><tr><th>Mệnh đề</th><th>Đúng</th><th>Sai</th></tr></thead><tbody>';
                        parsedData.options.forEach((opt, idx) => {
                            const correctValue = (correctKey && idx < correctKey.length) ? correctKey[idx] : null;
                            const tfClassT = (correctValue === 'T') ? 'table-tf-radio selected' : 'table-tf-radio';
                            const tfClassF = (correctValue === 'F') ? 'table-tf-radio selected' : 'table-tf-radio';
                            tableBody += `<tr><td>${opt.label}) ${opt.content}</td><td><label class="${tfClassT}"></label></td><td><label class="${tfClassF}"></label></td></tr>`;
                        });
                        table.innerHTML = tableBody + '</tbody>';
                        questionDiv.appendChild(table);
                        break;
                    }
                    case 'NUMERIC': {
                        const numericDiv = document.createElement('div');
                        numericDiv.className = "numeric-option";
                        numericDiv.innerHTML = `<input type="text" placeholder="Đáp số: ${correctKey || 'N/A'}" disabled>`;
                        questionDiv.appendChild(numericDiv);
                        break;
                    }
                }

                if (parsedData.solution && parsedData.solution.trim() !== '') {
                    const toggleBtn = document.createElement("button");
                    toggleBtn.className = "toggle-explanation btn";
                    toggleBtn.textContent = "Xem lời giải";
                    const expDiv = document.createElement("div");
                    expDiv.className = "explanation hidden";
                    expDiv.innerHTML = parsedData.solution;
                    toggleBtn.onclick = (e) => { 
                        e.stopPropagation(); 
                        expDiv.classList.toggle("hidden");
                        toggleBtn.textContent = expDiv.classList.contains("hidden") ? "Xem lời giải" : "Ẩn lời giải"; 
                    };
                    questionDiv.appendChild(toggleBtn);
                    questionDiv.appendChild(expDiv);
                }
                reviewDisplayArea.appendChild(questionDiv);
            }
        });

        if (window.renderMathInElement) {
            try {
                window.renderMathInElement(reviewDisplayArea, {
                    delimiters: [
                        {left: '$$', right: '$$', display: true}, {left: '\\[', right: '\\]', display: true},
                        {left: '$', right: '$', display: false}, {left: '\\(', right: '\\)', display: false}
                    ],
                    throwOnError: false
                });
            } catch (error) {
                console.error("Lỗi render KaTeX:", error);
            }
        }
    }

    // --- 5. EVENT LISTENERS & INITIALIZATION ---

    addQuestionBtn.addEventListener('click', () => {
        const newQuestionTemplate = `\\begin{ex}\n Nội dung câu ${questions.length + 1} \n  \\choice\n  {\\True}\n  {}\n  {} \n  {}\n  \\loigiai{\n Nội dung lời giải}\n\\end{ex}`;
        questions.push(newQuestionTemplate);
        renderEditor();
        triggerAutoConversion(); // Cập nhật ngay khi thêm
        questionEditorContainer.scrollTop = questionEditorContainer.scrollHeight;
    });

    clearInputBtn.addEventListener('click', () => {
        Swal.fire({
            title: 'Xóa tất cả các câu hỏi?', icon: 'warning', showCancelButton: true, 
            confirmButtonColor: '#d33', cancelButtonText: 'Hủy', confirmButtonText: 'Vẫn xóa'
        }).then(result => { 
            if (result.isConfirmed) {
                questions = [];
                renderEditor();
                triggerAutoConversion();
            } 
        });
    });

    loadFileBtn.addEventListener('click', () => fileInputHidden.click());

    fileInputHidden.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const fileContent = e.target.result;
            const questionBlockRegex = /(\\begin\{(?:ex|bt)\}[\s\S]*?\\end\{(?:ex|bt)\})/ig;
            const matchedBlocks = fileContent.match(questionBlockRegex);
            
            if (matchedBlocks && matchedBlocks.length > 0) {
                questions = matchedBlocks;
                renderEditor();
                triggerAutoConversion(); // Cập nhật ngay sau khi tải file
                Swal.fire('Thành công!', `Đã tải lên và tách thành ${questions.length} câu hỏi.`, 'success');
            } else {
                Swal.fire('Không tìm thấy', 'Không tìm thấy khối câu hỏi \\begin{ex}...\\end{ex} nào trong file.', 'warning');
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    });

    copyOutputBtn.addEventListener('click', () => {
        if (!converterOutputArea.value.trim()) {
            Swal.fire('Cảnh báo', 'Không có nội dung để sao chép.', 'warning');
            return;
        }
        navigator.clipboard.writeText(converterOutputArea.value)
            .then(() => Swal.fire('Thành công!', 'Đã sao chép nội dung Output.', 'success'));
    });

    // Cho phép chỉnh sửa trực tiếp trên ô Output và cập nhật Review
    converterOutputArea.addEventListener('input', () => {
        const currentContent = converterOutputArea.value;
        const currentKeys = extractedKeysInput.value;
        renderReview(currentContent, currentKeys);
    });

    window.copyToClipboard = (element) => {
        if (!element || !element.value.trim()) return;
        navigator.clipboard.writeText(element.value)
            .then(() => Swal.fire('Đã sao chép!', 'Nội dung đã được sao chép.', 'success'));
    };

    // Khởi tạo ứng dụng với 1 câu hỏi mẫu.
    function initializeApp() {
        addQuestionBtn.click();
    }
    
    initializeApp();
});