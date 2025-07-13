// File: js/ex_converter_page_V3.js
// PHIÊN BẢN ĐÃ SỬA LỖI VÀ TỔ CHỨC LẠI

document.addEventListener('DOMContentLoaded', () => {

    // ==========================================================
    // === 1. KHAI BÁO BIẾN VÀ LẤY CÁC PHẦN TỬ DOM ===
    // ==========================================================
    const getEl = (id) => document.getElementById(id);

    // Các phần tử giao diện chính
    const questionEditorContainer = getEl("question-editor-container");
    const converterOutputArea = getEl("converter-output-area");
    const reviewDisplayArea = getEl("review-display-area");
    const extractedKeysInput = getEl("extracted-keys");
    const extractedCoresInput = getEl("extracted-cores");
    
    // Các nút hành động chính
    const addQuestionBtn = getEl("add-question-btn");
    const loadFileBtn = getEl("load-file-btn");
    const fileInputHidden = getEl("file-input-hidden");
    const clearInputBtn = getEl("clear-input-btn");
    const copyOutputBtn = getEl("copy-output-btn");
    // ===> THÊM 2 DÒNG NÀY VÀO <===
    const copyKeysBtn = getEl("copy-keys-btn");
    const copyCoresBtn = getEl("copy-cores-btn");
    // ===============================
    // Các phần tử cho chức năng thay thế ảnh
    const imageLinksArea = getEl("image-links-area");
    const replaceImagesBtn = getEl("replace-images-btn");
    const linkTikzCounter = getEl("link-tikz-counter");
    
    // Kiểm tra các phần tử quan trọng, nếu thiếu thì không chạy tiếp
    if (!questionEditorContainer || !converterOutputArea || !reviewDisplayArea || !addQuestionBtn || !loadFileBtn) {
        console.error("Lỗi nghiêm trọng: Một hoặc nhiều phần tử HTML chính không được tìm thấy. Script không thể tiếp tục.");
        return;
    }

    // --- State của ứng dụng ---
    let questions = []; 
    let debounceTimeout; 

    // ==========================================================
    // === 2. ĐỊNH NGHĨA TẤT CẢ CÁC HÀM XỬ LÝ ===
    // ==========================================================

    /**
     * Cập nhật bộ đếm số link và số khối TikZ.
     */
    function updateCounters() {
        if (!imageLinksArea || !linkTikzCounter) return;

        const links = imageLinksArea.value.split('\n').filter(link => link.trim() !== '');
        const fullContent = questions.join('\n\n');
        const tikzRegex = /\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/gi;
        const tikzMatches = fullContent.match(tikzRegex) || [];

        linkTikzCounter.textContent = `Links: ${links.length} / TikZ: ${tikzMatches.length}`;
        const countsMatch = links.length > 0 && links.length === tikzMatches.length;
        linkTikzCounter.style.color = countsMatch ? 'var(--success-color, #10B981)' : 'var(--danger-color, #EF4444)';
    }

    /**
     * Thực hiện việc thay thế các khối TikZ bằng link ảnh.
     */
    function performImageReplacement() {
        if (!imageLinksArea) return;

        const links = imageLinksArea.value.split('\n').filter(link => link.trim() !== '');
        const tikzRegex = /\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/gi;
        
        let fullContent = questions.join('\n\n');
        const tikzMatches = fullContent.match(tikzRegex) || [];

        if (links.length === 0 && tikzMatches.length === 0) {
            Swal.fire('Thông tin', 'Không tìm thấy khối TikZ và cũng không có link ảnh nào.', 'info');
            return;
        }
        if (links.length !== tikzMatches.length) {
            Swal.fire('Số lượng không khớp!', `Tìm thấy ${tikzMatches.length} khối TikZ nhưng bạn đã cung cấp ${links.length} link ảnh.`, 'error');
            return;
        }

        let linkIndex = 0;
        const updatedContent = fullContent.replace(tikzRegex, () => {
            return `\\begin{center}\n    \\includegraphics[width=0.8\\textwidth]{${links[linkIndex++]}}\n\\end{center}`;
        });

        const questionBlockRegex = /(\\begin\{(?:ex|bt)\}[\s\S]*?\\end\{(?:ex|bt)\})/ig;
        const updatedBlocks = updatedContent.match(questionBlockRegex);
        
        if (updatedBlocks && updatedBlocks.length === questions.length) {
            questions = updatedBlocks;
            renderEditor();
            triggerAutoConversion();
            updateCounters();
            Swal.fire('Thành công!', `Đã thay thế thành công ${links.length} hình ảnh.`, 'success');
        } else {
            Swal.fire('Lỗi', 'Có lỗi xảy ra khi cập nhật lại câu hỏi sau khi thay thế.', 'error');
        }
    }

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
                    <textarea class="question-textarea" spellcheck="false"></textarea>
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
            
            textarea.addEventListener('input', () => {
                questions[index] = textarea.value;
                triggerAutoConversion(); 
                updateCounters();
            });

            textarea.addEventListener('focus', () => {
                document.querySelectorAll('.question-editor-frame').forEach(f => f.classList.remove('is-focused'));
                frame.classList.add('is-focused');
            });

            frame.querySelector('.delete-btn').addEventListener('click', () => {
                Swal.fire({
                    title: `Xác nhận xóa Câu ${index + 1}?`,
                    icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33',
                    cancelButtonText: 'Hủy', confirmButtonText: 'Vẫn xóa'
                }).then(result => { 
                    if (result.isConfirmed) {
                        questions.splice(index, 1);
                        renderEditor();
                        triggerAutoConversion();
                    }
                });
            });
        });
    }

    /**
     * Hàm trung gian, sử dụng debouncing để tối ưu hiệu năng.
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
            if (extractedKeysInput) extractedKeysInput.value = '';
            if (extractedCoresInput) extractedCoresInput.value = '';
            reviewDisplayArea.innerHTML = '<p style="text-align: center; color: #888;">Soạn thảo câu hỏi để xem trước.</p>';
            return;
        }

        if (typeof window.convertExToStandardFormat !== 'function') {
            return; // Lỗi đã được log ở nơi khác
        }
        
        try {
            const conversionResult = window.convertExToStandardFormat(fullInputContent);
            converterOutputArea.value = conversionResult.compiledContent;
            if (extractedKeysInput) extractedKeysInput.value = conversionResult.keys;
            if (extractedCoresInput) extractedCoresInput.value = conversionResult.cores;
            renderReview(conversionResult.compiledContent, conversionResult.keys);
        } catch (error) {
            reviewDisplayArea.innerHTML = `<div class="error-message" style="padding: 20px; text-align:center;"><strong>Lỗi cú pháp:</strong><br>${error.message}</div>`;
            converterOutputArea.value = `LỖI: ${error.message}`;
        }
    }
    
    /**
     * Render phần xem trước.
     */
    function renderReview_GOC(compiledContent, keysString) {
        if (typeof window.parseMCQuestion !== 'function') {
            return; // Lỗi đã được log ở nơi khác
        }
        
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
            
            if (!parsedData) return;

            const questionDiv = document.createElement("div");
            questionDiv.className = "question";
            questionDiv.innerHTML = `<div class="question-statement">${parsedData.statement}</div>`;

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
        /**
     * Render phần xem trước.
     */
    function renderReview(compiledContent, keysString) {
        if (typeof window.parseMCQuestion !== 'function') {
            return; // Lỗi đã được log ở nơi khác
        }
        
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
            
            if (!parsedData) return;

            const questionDiv = document.createElement("div");
            questionDiv.className = "question";
            
            // ==========================================================
            // === BẮT ĐẦU PHẦN THÊM VÀO ĐỂ LÀM ĐẸP "Câu XXX:" ===
            // Thay vì gán trực tiếp, chúng ta sẽ xử lý chuỗi statement
            // để tách phần "Câu số" ra và bọc nó trong một thẻ span riêng.
            // ==========================================================

            // 1. Tạo một div mới để chứa nội dung câu hỏi (thay cho gán innerHTML trực tiếp)
            const statementDiv = document.createElement("div");
            statementDiv.className = "question-statement";

            // 2. Dùng Regex để tìm và tách phần "Câu số:" ở đầu chuỗi
            const titleRegex = /^(Câu\s*\d+\s*[:.]?\s*)/i;
            const match = parsedData.statement.match(titleRegex);

            if (match) {
                // Nếu tìm thấy (ví dụ: khớp với "Câu 1: ")
                const questionTitle = match[1]; // Phần tiêu đề, ví dụ "Câu 1: "
                const questionContent = parsedData.statement.substring(questionTitle.length).trim(); // Phần nội dung còn lại
                
                // 3. Tạo ra HTML mới với thẻ span được định dạng riêng
                statementDiv.innerHTML = `<span class="question-number-highlight">${questionTitle}</span> ${questionContent}`;
            } else {
                // Nếu không tìm thấy "Câu số", giữ nguyên nội dung gốc để đảm bảo an toàn
                statementDiv.innerHTML = parsedData.statement;
            }
            
            // 4. Thêm div đã xử lý vào câu hỏi, thay thế cho dòng `questionDiv.innerHTML` cũ
            questionDiv.appendChild(statementDiv);

            // ==========================================================
            // === KẾT THÚC PHẦN THÊM VÀO ===
            // Dòng `questionDiv.innerHTML = ...` cũ đã được thay thế bằng logic ở trên.
            // ==========================================================


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
    /**
     * Hàm dùng để điền nội dung từ file vào các khung soạn thảo.
     */
    function populateQuestionsFromText(textContent) {
        const questionBlockRegex = /(\\begin\{(?:ex|bt)\}[\s\S]*?\\end\{(?:ex|bt)\})/ig;
        const matchedBlocks = textContent.match(questionBlockRegex);
        
        if (matchedBlocks && matchedBlocks.length > 0) {
            questions = matchedBlocks;
        } else {
            questions = [textContent];
            console.warn('Không tìm thấy khối câu hỏi, đã tải toàn bộ nội dung vào một khung.');
        }
        renderEditor();
        triggerAutoConversion();
    }


    // ==========================================================
    // === 3. GÁN SỰ KIỆN VÀ KHỞI TẠO ỨNG DỤNG ===
    // ==========================================================

    addQuestionBtn.addEventListener('click', () => {
        const newQuestionTemplate = `\\begin{ex}\n Nội dung câu ${questions.length + 1} \n  \\choice\n  {\\True}\n  {}\n  {} \n  {}\n  \\loigiai{\n Nội dung lời giải}\n\\end{ex}`;
        questions.push(newQuestionTemplate);
        renderEditor();
        triggerAutoConversion();
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

    loadFileBtn.addEventListener('click', () => {
        if (fileInputHidden) fileInputHidden.click();
    });

    // if (fileInputHidden) {
    //     fileInputHidden.addEventListener('change', (event) => {
    //         const file = event.target.files[0];
    //         if (!file) return;

    //         const reader = new FileReader();
    //         reader.onload = (e) => {
    //             populateQuestionsFromText(e.target.result);
    //             Swal.fire('Thành công!', `Đã tải lên và tách thành ${questions.length} câu hỏi.`, 'success');
    //         };
    //         reader.readAsText(file);
    //         event.target.value = '';
    //     });
    // }
// ==========================================================
    // === ĐÂY LÀ CHỖ DUY NHẤT CẦN SỬA TRONG FILE NÀY ===
    // ==========================================================
    if (fileInputHidden) {
        fileInputHidden.addEventListener('change', async (event) => { // Thêm async
            const file = event.target.files[0];
            if (!file) return;

            // 1. Tải quy tắc
            let rules = null;
            try {
                const response = await fetch('/soanthao/replace.json');
                if (!response.ok) throw new Error('Không tải được file quy tắc');
                rules = await response.json();
            } catch (error) {
                console.error("Lỗi tải replace.json:", error);
                Swal.fire('Lỗi', 'Không thể tải file quy tắc thay thế. Tệp sẽ được tải mà không tiền xử lý.', 'error');
            }

            // 2. Đọc file .tex
            const reader = new FileReader();
            reader.onload = (e) => {
                let content = e.target.result;
                
                // 3. Tiền xử lý nếu có quy tắc
                if (rules) {
                    console.log("Đang tiền xử lý nội dung file...");
                    content = TextPreprocessor.process(content, rules);
                }

                // 4. Gọi hàm gốc với nội dung đã (hoặc chưa) xử lý
                populateQuestionsFromText(content);
                Swal.fire('Thành công!', `Đã tải lên và tách thành ${questions.length} câu hỏi.`, 'success');
            };
            reader.readAsText(file);
            event.target.value = '';
        });
    }
    copyOutputBtn.addEventListener('click', () => {
        if (!converterOutputArea.value.trim()) {
            Swal.fire('Cảnh báo', 'Không có nội dung để sao chép.', 'warning');
            return;
        }
        navigator.clipboard.writeText(converterOutputArea.value)
            .then(() => Swal.fire('Thành công!', 'Đã sao chép nội dung Output.', 'success'));
    });
    // Gán sự kiện cho nút copy Keys
if (copyKeysBtn) {
    copyKeysBtn.addEventListener('click', () => {
        const textToCopy = extractedKeysInput.value;
        if (!textToCopy || !textToCopy.trim()) {
            Swal.fire('Cảnh báo', 'Không có Keys để sao chép.', 'warning');
            return;
        }
        navigator.clipboard.writeText(textToCopy)
            .then(() => Swal.fire('Thành công!', 'Đã sao chép Keys.', 'success'))
            .catch(err => {
                console.error('Lỗi sao chép Keys:', err);
                Swal.fire('Lỗi sao chép', 'Không thể sao chép. Hãy thử sao chép thủ công.', 'error');
            });
    });
}

// Gán sự kiện cho nút copy Cores
if (copyCoresBtn) {
    copyCoresBtn.addEventListener('click', () => {
        const textToCopy = extractedCoresInput.value;
        if (!textToCopy || !textToCopy.trim()) {
            Swal.fire('Cảnh báo', 'Không có Cores để sao chép.', 'warning');
            return;
        }
        navigator.clipboard.writeText(textToCopy)
            .then(() => Swal.fire('Thành công!', 'Đã sao chép Cores.', 'success'))
            .catch(err => {
                console.error('Lỗi sao chép Cores:', err);
                Swal.fire('Lỗi sao chép', 'Không thể sao chép. Hãy thử sao chép thủ công.', 'error');
            });
    });
}
    converterOutputArea.addEventListener('input', () => {
        const currentContent = converterOutputArea.value;
        const currentKeys = extractedKeysInput ? extractedKeysInput.value : '';
        renderReview(currentContent, currentKeys);
    });

    if (replaceImagesBtn) {
        replaceImagesBtn.addEventListener('click', performImageReplacement);
    }
    if (imageLinksArea) {
        imageLinksArea.addEventListener('input', updateCounters);
    }

    // --- Khởi tạo ứng dụng ---
    function initializeApp() {
        // Tạo đối tượng `app` và đưa nó ra `window` để script tích hợp có thể gọi
        window.app = {
            populateQuestionsFromText: populateQuestionsFromText
        };

        // Khởi tạo với 1 câu hỏi mẫu
        addQuestionBtn.click();
        updateCounters();
        console.log("Ứng dụng soạn thảo V3 đã khởi tạo thành công.");
    }
    
    initializeApp();

}); // Đóng listener DOMContentLoaded