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
    function triggerAutoConversion() {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(runFullConversion, 500);
    }
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
                    // === BẮT ĐẦU THAY THẾ TỪ ĐÂY ===
            case 'MC': {
                const optionsContainer = document.createElement('div');
                optionsContainer.className = `mc-options mc-layout-${parsedData.layout}`;

                // Không trộn đáp án khi xem trước, giữ nguyên thứ tự
                let optionsToRender = parsedData.options;
                // Nhãn hiển thị luôn là A, B, C, D
                const displayLabels = ['A', 'B', 'C', 'D'];

                optionsToRender.forEach((opt, optIndex) => {
                    const optionDiv = document.createElement("div");
                    
                    // Lấy đáp án đúng cho câu hỏi này
                    const correctKeyForThisQuestion = (keysArray[index] || '').toUpperCase();

                    // Logic so sánh MỚI và ĐÚNG:
                    // So sánh đáp án đúng với nhãn GỐC của lựa chọn (opt.label)
                    // Đây chính là cách main.js hoạt động.
                    const isCorrect = correctKeyForThisQuestion && (correctKeyForThisQuestion === opt.label.toUpperCase());

                    optionDiv.className = `mc-option ${isCorrect ? 'correct-answer-preview' : ''}`;
                    
                    // Nhãn hiển thị là A, B, C, D tuần tự
                    const displayLabel = displayLabels[optIndex] || opt.label;

                    optionDiv.innerHTML = `<span class="mc-option-label">${displayLabel}</span><span class="mc-option-content">${opt.content}</span>`;
                    optionsContainer.appendChild(optionDiv);
                });
                questionDiv.appendChild(optionsContainer);
                break;
            }
            // === KẾT THÚC THAY THẾ TẠI ĐÂY ===

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

    // --- B. LOGIC TẢI FILE KẾT HỢP (UPLOAD ẢNH + TIỀN XỬ LÝ) ---

    function uploadFileToCloudinary(file) {
        const CLOUD_NAME = "dfprmep2p";
        const UPLOAD_PRESET = "up2web";
        return new Promise((resolve, reject) => {
            const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
            const formData = new FormData();
            formData.append('file', file);
            formData.append('upload_preset', UPLOAD_PRESET);
            fetch(url, { method: 'POST', body: formData })
                .then(response => response.ok ? response.json() : response.json().then(err => Promise.reject(err)))
                .then(data => resolve(data.secure_url))
                .catch(error => reject(error.error ? new Error(error.error.message) : error));
        });
    }

    async function processAndLoadTexFile(event) {
        const file = event.target.files[0];
        if (!file) return;
        event.target.value = '';

        // Đọc nội dung file thô
        let rawContent = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = e => reject(e);
            reader.readAsText(file);
        });

        // --- BƯỚC 1: XỬ LÝ UPLOAD ẢNH ---
        try {
            const imageRegex = /\\includegraphics(?:\[.*?\])?\{(.+?)\}/g;
            const matches = [...rawContent.matchAll(imageRegex)];
            const foundImages = matches.map(match => ({
                fullCommand: match[0], path: match[1].trim(), newUrl: null
            }));

            if (foundImages.length > 0) {
                // Nếu có ảnh, mở modal và đợi xử lý
                const updatedContent = await showImageUploadModal(foundImages, rawContent);
                // Cập nhật lại nội dung sau khi đã thay thế link ảnh
                rawContent = updatedContent; 
            }
        } catch (error) {
            Swal.fire('Lỗi xử lý ảnh', error.message, 'error');
            return; // Dừng lại nếu có lỗi
        }

        // --- BƯỚC 2: TIỀN XỬ LÝ VỚI replace.json ---
        try {
            const response = await fetch('/soanthao/replace.json');
            if (response.ok) {
                const rules = await response.json();
                if (typeof TextPreprocessor !== 'undefined' && typeof TextPreprocessor.process === 'function') {
                    console.log("Đang áp dụng quy tắc từ replace.json...");
                    rawContent = TextPreprocessor.process(rawContent, rules);
                } else {
                     console.warn("TextPreprocessor không được định nghĩa, bỏ qua bước tiền xử lý.");
                }
            }
        } catch (error) {
            console.warn("Không tải được file quy tắc replace.json, bỏ qua bước tiền xử lý.", error);
        }
        
        // --- BƯỚC 3: ĐƯA NỘI DUNG CUỐI CÙNG VÀO TRÌNH SOẠN THẢO ---
        populateQuestionsFromText(rawContent);
        Swal.fire('Thành công!', `Đã tải và xử lý xong tệp.`, 'success');
    }

    function showImageUploadModal(foundImages, originalContent) {
        return new Promise(async (resolve, reject) => {
            let modalHtml = `<p style="text-align: center; margin-bottom: 20px;">Phát hiện <strong>${foundImages.length}</strong> ảnh. Vui lòng tải lên các tệp tương ứng.</p><ul id="image-upload-list" style="list-style: none; padding: 0;">`;
            foundImages.forEach((img, index) => {
                modalHtml += `<li style="display: flex; align-items: center; justify-content: space-between; padding: 10px; border-bottom: 1px solid #eee;"><span style="font-family: monospace; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60%;" title="${img.path}">${img.path}</span><div id="upload-status-${index}"><input type="file" accept="image/*" class="swal-upload-input" data-index="${index}" style="display:none;"><button onclick="document.querySelector('.swal-upload-input[data-index=\\'${index}\\']').click()" class="swal2-styled">Chọn ảnh</button></div></li>`;
            });
            modalHtml += `</ul>`;

            const { value: isConfirmed } = await Swal.fire({
                title: 'Tải lên hình ảnh', html: modalHtml, width: '700px', showConfirmButton: true,
                confirmButtonText: 'Hoàn tất & Tiếp tục', allowOutsideClick: false,
                didOpen: () => { /* ... Gán sự kiện cho input như cũ ... */ },
                preConfirm: () => {
                    const notUploaded = foundImages.filter(img => !img.newUrl);
                    if (notUploaded.length > 0) {
                        Swal.showValidationMessage(`Vui lòng tải lên ${notUploaded.length} ảnh còn lại.`);
                        return false;
                    }
                    return true;
                }
            });

            if (isConfirmed) {
                let updatedContent = originalContent;
                foundImages.forEach(img => {
                    const newCommand = img.fullCommand.replace(img.path, img.newUrl);
                    updatedContent = updatedContent.replace(img.fullCommand, newCommand);
                });
                resolve(updatedContent); // Trả về nội dung đã được cập nhật
            } else {
                reject(new Error("Người dùng đã hủy bỏ quá trình upload ảnh.")); // Hủy nếu người dùng đóng modal
            }
        });
    }

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

    // loadFileBtn.addEventListener('click', () => {
    //     if (fileInputHidden) fileInputHidden.click();
    // });

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
    // if (fileInputHidden) {
    //     fileInputHidden.addEventListener('change', async (event) => { // Thêm async
    //         const file = event.target.files[0];
    //         if (!file) return;

    //         // 1. Tải quy tắc
    //         let rules = null;
    //         try {
    //             const response = await fetch('/soanthao/replace.json');
    //             if (!response.ok) throw new Error('Không tải được file quy tắc');
    //             rules = await response.json();
    //         } catch (error) {
    //             console.error("Lỗi tải replace.json:", error);
    //             Swal.fire('Lỗi', 'Không thể tải file quy tắc thay thế. Tệp sẽ được tải mà không tiền xử lý.', 'error');
    //         }

    //         // 2. Đọc file .tex
    //         const reader = new FileReader();
    //         reader.onload = (e) => {
    //             let content = e.target.result;
                
    //             // 3. Tiền xử lý nếu có quy tắc
    //             if (rules) {
    //                 console.log("Đang tiền xử lý nội dung file...");
    //                 content = TextPreprocessor.process(content, rules);
    //             }

    //             // 4. Gọi hàm gốc với nội dung đã (hoặc chưa) xử lý
    //             populateQuestionsFromText(content);
    //             Swal.fire('Thành công!', `Đã tải lên và tách thành ${questions.length} câu hỏi.`, 'success');
    //         };
    //         reader.readAsText(file);
    //         event.target.value = '';
    //     });
    // }
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

    // File: soanthao/ex_converter_page_V4.js

// ==========================================================
// === 3. GÁN SỰ KIỆN VÀ KHỞI TẠO ỨNG DỤNG (PHIÊN BẢN AN TOÀN) ===
// ==========================================================

// Hàm helper để gán sự kiện an toàn
function addSafeListener(element, event, handler) {
    if (element) {
        element.addEventListener(event, handler);
    }
}

// Gán sự kiện cho các nút luôn tồn tại
addSafeListener(addQuestionBtn, 'click', () => {
    const newQuestionTemplate = `\\begin{ex}\n Nội dung câu ${questions.length + 1} \n  \\choice\n  {\\True}\n  {}\n  {} \n  {}\n  \\loigiai{\n Nội dung lời giải}\n\\end{ex}`;
    questions.push(newQuestionTemplate);
    renderEditor();
    triggerAutoConversion();
    questionEditorContainer.scrollTop = questionEditorContainer.scrollHeight;
});

addSafeListener(clearInputBtn, 'click', () => {
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

// addSafeListener(loadFileBtn, 'click', () => {
//     if (fileInputHidden) fileInputHidden.click();
// });

addSafeListener(fileInputHidden, 'change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    let rules = null;
    try {
        const response = await fetch('/soanthao/replace.json');
        if (response.ok) rules = await response.json();
    } catch (error) {
        console.warn("Không tải được file quy tắc replace.json:", error);
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        let content = e.target.result;
        if (rules) {
            content = TextPreprocessor.process(content, rules);
        }
        populateQuestionsFromText(content);
        Swal.fire('Thành công!', `Đã tải lên và tách thành ${questions.length} câu hỏi.`, 'success');
    };
    reader.readAsText(file);
    event.target.value = '';
});

addSafeListener(copyOutputBtn, 'click', () => {
    if (!converterOutputArea.value.trim()) {
        Swal.fire('Cảnh báo', 'Không có nội dung để sao chép.', 'warning');
        return;
    }
    navigator.clipboard.writeText(converterOutputArea.value)
        .then(() => Swal.fire('Thành công!', 'Đã sao chép nội dung Output.', 'success'));
});

addSafeListener(copyKeysBtn, 'click', () => {
    const textToCopy = extractedKeysInput.value;
    if (!textToCopy || !textToCopy.trim()) {
        Swal.fire('Cảnh báo', 'Không có Keys để sao chép.', 'warning');
        return;
    }
    navigator.clipboard.writeText(textToCopy)
        .then(() => Swal.fire('Thành công!', 'Đã sao chép Keys.', 'success'));
});

addSafeListener(copyCoresBtn, 'click', () => {
    const textToCopy = extractedCoresInput.value;
    if (!textToCopy || !textToCopy.trim()) {
        Swal.fire('Cảnh báo', 'Không có Cores để sao chép.', 'warning');
        return;
    }
    navigator.clipboard.writeText(textToCopy)
        .then(() => Swal.fire('Thành công!', 'Đã sao chép Cores.', 'success'));
});

addSafeListener(converterOutputArea, 'input', () => {
    const currentContent = converterOutputArea.value;
    const currentKeys = extractedKeysInput ? extractedKeysInput.value : '';
    renderReview(currentContent, currentKeys);
});


// Gán sự kiện cho các nút CÓ THỂ không tồn tại (replace image)
// Đây chính là phần sửa lỗi cốt lõi
addSafeListener(replaceImagesBtn, 'click', performImageReplacement);
addSafeListener(imageLinksArea, 'input', updateCounters);


// --- Khởi tạo ứng dụng ---
// Hàm này bây giờ sẽ chứa logic tích hợp tạo đề thi
function initializeApp() {
    // Tạo đối tượng `app` và đưa nó ra `window` để script tích hợp có thể gọi
    window.app = {
        populateQuestionsFromText: populateQuestionsFromText
    };
    addSafeListener(loadFileBtn, 'click', () => fileInputHidden.click());
    // if (fileInputHidden) {
    //     // Chỉ cần trỏ sự kiện 'change' vào hàm xử lý chính của chúng ta
    //     fileInputHidden.addEventListener('change', handleTexFileUpload);
    // }

    // Khởi tạo với 1 câu hỏi mẫu
    if (addQuestionBtn) {
        addQuestionBtn.click();
    }
    updateCounters();
    console.log("Ứng dụng soạn thảo đã khởi tạo thành công.");

    // --- BẮT ĐẦU PHẦN TÍCH HỢP CHỨC NĂNG TẠO ĐỀ THI ---
    const createExamBtn = getEl("create-exam-btn");

    
    async function showCreateExamDialog() {
        // 1. Kiểm tra đăng nhập trước
        const user = firebase.auth().currentUser;
        if (!user) {
            Swal.fire("Chưa đăng nhập", "Bạn cần đăng nhập để tạo đề thi.", "error");
            return;
        }

        // 2. Lấy dữ liệu từ các ô input
        const content = getEl("converter-output-area").value.trim();
        const keysString = getEl("extracted-keys").value.trim();
        const coresString = getEl("extracted-cores").value.trim();

        if (!content) {
            Swal.fire("Thiếu nội dung!", "Phần nội dung đề thi không được để trống.", "warning");
            return;
        }
        
        const keys = keysString.split('|');
        const cores = coresString.split('|');
        const questionCount = questions.length; // `questions` là mảng state toàn cục

        // ==========================================================
        // === BẮT ĐẦU KHỐI VALIDATION MỚI ===
        // ==========================================================
        
        // 3. Kiểm tra số lượng có khớp không
        if (keys.length !== questionCount) {
            Swal.fire({
                icon: 'error',
                title: 'Số lượng Keys không khớp!',
                html: `Bạn có <b>${questionCount}</b> câu hỏi nhưng chỉ cung cấp <b>${keys.length}</b> đáp án (Keys).<br>Vui lòng kiểm tra lại.`,
            });
            return;
        }

        if (cores.length !== questionCount) {
            Swal.fire({
                icon: 'error',
                title: 'Số lượng Cores không khớp!',
                html: `Bạn có <b>${questionCount}</b> câu hỏi nhưng chỉ cung cấp <b>${cores.length}</b> thang điểm (Cores).<br>Vui lòng kiểm tra lại.`,
            });
            return;
        }

        // 4. Kiểm tra xem có Key nào bị bỏ trống không
        const emptyKeyIndices = [];
        for (let i = 0; i < keys.length; i++) {
            // Nếu key sau khi trim là một chuỗi rỗng
            if (keys[i].trim() === '') {
                // Thêm số thứ tự của câu hỏi (bắt đầu từ 1)
                emptyKeyIndices.push(i + 1);
            }
        }
        
        // Nếu tìm thấy Key rỗng, hiển thị cảnh báo chi tiết
        if (emptyKeyIndices.length > 0) {
            Swal.fire({
                icon: 'warning',
                title: 'Phát hiện đáp án bị bỏ trống!',
                html: `Vui lòng nhập đáp án cho các câu sau: <br><b>Câu ${emptyKeyIndices.join(', ')}</b>`,
            });
            return;
        }
        
        // ==========================================================
        // === KẾT THÚC KHỐI VALIDATION ===
        // ==========================================================

        // 5. Nếu tất cả đều hợp lệ, hiển thị hộp thoại cuối cùng để nhập thông tin
        const { value: formValues } = await Swal.fire({
            title: `Hoàn tất thông tin đề thi`,
            html: `
                <p style="margin-bottom: 1rem;">Tài khoản: <strong>${user.displayName || user.email}</strong></p>
                <input id="swal-exam-code" class="swal2-input" placeholder="Mã đề thi (ví dụ: T001)">
                <input id="swal-exam-time" type="number" class="swal2-input" placeholder="Thời gian (phút)" value="90">
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'Lưu vào Hệ Thống',
            cancelButtonText: 'Hủy',
            preConfirm: () => {
                const examCode = getEl('swal-exam-code').value;
                const timeLimit = getEl('swal-exam-time').value;
                if (!examCode || !timeLimit) {
                    Swal.showValidationMessage(`Vui lòng nhập đầy đủ Mã đề và Thời gian`);
                }
                return { examCode, timeLimit };
            }
        });

        // 6. Nếu người dùng xác nhận, gọi Cloud Function
        if (formValues) {
            // Gọi hàm lưu với chuỗi gốc, backend sẽ xử lý
            saveExamToFirebase(formValues.examCode, formValues.timeLimit, content, keysString, coresString);
        }
    }
    async function saveExamToFirebase(examCode, timeLimit, content, keys, cores) {
        Swal.fire({
            title: 'Đang lưu đề thi...',
            html: 'Vui lòng chờ trong giây lát.',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });

        try {
            const addExamFunction = firebase.functions().httpsCallable('addExamWithStorage');
            const examData = {
                examType: 'TEXT',
                examCode: examCode,
                timeLimit: parseInt(timeLimit, 10),
                content: content,
                keys: keys,
                cores: cores,
            };
            const result = await addExamFunction({ examData });
            Swal.fire({ icon: 'success', title: 'Thành công!', text: result.data.message });
        } catch (error) {
            console.error("Lỗi khi lưu đề thi:", error);
            Swal.fire({ icon: 'error', title: 'Lưu thất bại!', text: error.message });
        }
    }

    addSafeListener(createExamBtn, 'click', showCreateExamDialog);
}


    
    initializeApp();

}); // Đóng listener DOMContentLoaded