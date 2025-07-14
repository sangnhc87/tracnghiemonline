// File: js/ex_converter_page_V4.js
// PHIÊN BẢN DUY NHẤT - ĐÃ HỢP NHẤT LOGIC VÀ SỬA LỖI CẤU TRÚC

document.addEventListener('DOMContentLoaded', () => {

    // ==========================================================
    // === 1. KHAI BÁO BIẾN VÀ LẤY CÁC PHẦN TỬ DOM ===
    // ==========================================================
    const getEl = (id) => document.getElementById(id);

    // Lấy tất cả các phần tử cần thiết ngay từ đầu
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
    const copyKeysBtn = getEl("copy-keys-btn");
    const copyCoresBtn = getEl("copy-cores-btn");
    const imageLinksArea = getEl("image-links-area");
    const replaceImagesBtn = getEl("replace-images-btn");
    const linkTikzCounter = getEl("link-tikz-counter");
    const createExamBtn = getEl("create-exam-btn");

    if (!questionEditorContainer || !addQuestionBtn || !loadFileBtn) {
        console.error("Lỗi: Các phần tử HTML cốt lõi không được tìm thấy. Script dừng lại.");
        return;
    }

    // --- State của ứng dụng ---
    let questions = []; 
    let debounceTimeout; 

    // ==========================================================
    // === 2. ĐỊNH NGHĨA TẤT CẢ CÁC HÀM XỬ LÝ ===
    // ==========================================================

    // --- A. CÁC HÀM RENDER VÀ TIỆN ÍCH CƠ BẢN ---
    // (Lưu ý: Bạn cần dán nội dung đầy đủ của các hàm này từ file gốc của bạn vào đây)
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

    function populateQuestionsFromText(textContent) {
        const questionBlockRegex = /(\\begin\{(?:ex|bt)\}[\s\S]*?\\end\{(?:ex|bt)\})/ig;
        const matchedBlocks = textContent.match(questionBlockRegex);
        questions = (matchedBlocks && matchedBlocks.length > 0) ? matchedBlocks : [textContent];
        renderEditor();
        triggerAutoConversion();
    }
    async function processIncludeGraphics(content) {
    if (!content) return Promise.resolve('');

    const imageRegex = /\\includegraphics(?:\[.*?\])?\{(.+?)\}/g;
    const matches = [...content.matchAll(imageRegex)];

    // Nếu không có \includegraphics, trả về nội dung ngay lập tức
    if (matches.length === 0) {
        return Promise.resolve(content);
    }
    
    // Nếu có, hiển thị modal upload
    try {
        Swal.update({
            title: `Phát hiện ${matches.length} ảnh cần upload...`,
            text: 'Vui lòng cung cấp các file ảnh.',
            showConfirmButton: false // Ẩn nút OK của alert loading
        });

        const foundImages = matches.map(match => ({ 
            fullCommand: match[0], 
            path: match[1].trim(), 
            newUrl: null 
        }));

        // Gọi hàm showImageUploadModal đã có sẵn trong file này
        const updatedContent = await showImageUploadModal(foundImages, content);
        return updatedContent;

    } catch (error) {
        // Nếu người dùng hủy hoặc có lỗi, ném lại lỗi để hàm gọi có thể xử lý
        throw error;
    }
}
    // --- B. LOGIC TẢI FILE KẾT HỢP (UPLOAD ẢNH + TIỀN XỬ LÝ) ---

/**
 * Thêm các thuộc tính biến đổi mặc định vào URL Cloudinary.
 * @param {string} url - URL gốc từ Cloudinary.
 * @returns {string} URL đã được thêm thuộc tính tối ưu.
 */
function applyCloudinaryTransforms(url) {
    if (!url || !url.includes('/upload/')) {
        return url; // Trả về url gốc nếu không hợp lệ
    }
    const transforms = "q_auto,f_auto,h_200"; // Thuộc tính tối ưu: chất lượng tự động, định dạng tự động, cao 200px
    return url.replace('/upload/', `/upload/${transforms}/`);
}

/**
 * Tải một file lên Cloudinary.
 * @param {File} file - File ảnh cần upload.
 * @returns {Promise<string>} - Promise trả về URL gốc của ảnh trên Cloudinary.
 */
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

/**
 * Hàm điều phối chính, xử lý toàn bộ luồng tải và xử lý tệp .tex.
 * @param {Event} event - Sự kiện 'change' từ input file.
 */
async function processAndLoadTexFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = ''; // Reset để có thể chọn lại cùng 1 file

    Swal.fire({ title: 'Đang xử lý tệp...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    let rawContent;
    try {
        rawContent = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = e => reject(e);
            reader.readAsText(file);
        });
    } catch (error) {
        Swal.fire('Lỗi', 'Không thể đọc nội dung tệp.', 'error');
        return;
    }

    // --- BƯỚC 1: XỬ LÝ UPLOAD ẢNH (NẾU CÓ) ---
    const imageRegex = /\\includegraphics(?:\[.*?\])?\{(.+?)\}/g;
    const matches = [...rawContent.matchAll(imageRegex)];
    if (matches.length > 0) {
        try {
            const foundImages = matches.map(match => ({ fullCommand: match[0], path: match[1].trim(), newUrl: null }));
            // Chờ modal xử lý xong và nhận lại nội dung đã được cập nhật
            rawContent = await showImageUploadModal(foundImages, rawContent);
        } catch (error) {
            if (error.message.includes("hủy bỏ")) {
                Swal.close(); // Chỉ đóng loading mà không báo lỗi nếu người dùng chủ động hủy
            } else {
                Swal.fire('Lỗi xử lý ảnh', error.message, 'error');
            }
            return; // Dừng toàn bộ quá trình
        }
    }
    
    // --- BƯỚC 2: TIỀN XỬ LÝ VỚI replace.json (NẾU CÓ) ---
    try {
        const response = await fetch('/soanthao/replace.json');
        if (response.ok) {
            const rules = await response.json();
            // Kiểm tra xem module TextPreprocessor có tồn tại không
            if (typeof TextPreprocessor !== 'undefined' && typeof TextPreprocessor.process === 'function') {
                console.log("Đang áp dụng quy tắc từ replace.json...");
                rawContent = TextPreprocessor.process(rawContent, rules);
            }
        }
    } catch (error) {
        console.warn("Không tải được/áp dụng được replace.json, bỏ qua bước này.", error);
    }
    
    // --- BƯỚC 3: ĐƯA NỘI DUNG CUỐI CÙNG VÀO TRÌNH SOẠN THẢO ---
    populateQuestionsFromText(rawContent);
    Swal.fire('Thành công!', `Đã tải và xử lý xong tệp.`, 'success');
}

/**
 * Hiển thị modal để người dùng upload ảnh và trả về nội dung đã được cập nhật.
 * Mỗi ảnh sẽ tự động được thay thế bằng thẻ <img class="inline-image img-center" ...>.
 * @param {Array} foundImages - Mảng các đối tượng ảnh đã tìm thấy.
 * @param {string} originalContent - Nội dung file .tex gốc.
 * @returns {Promise<string>} - Promise trả về nội dung đã được thay thế bằng thẻ <img>.
 */
function showImageUploadModal(foundImages, originalContent) {
    return new Promise(async (resolve, reject) => {
        let modalHtml = `<p style="text-align: center; margin-bottom: 20px;">Phát hiện <strong>${foundImages.length}</strong> ảnh. Vui lòng tải lên các tệp tương ứng.</p>
                         <ul id="image-upload-list" style="list-style: none; padding: 0;">`;
        
        foundImages.forEach((img, index) => {
            modalHtml += `
                <li style="display: flex; align-items: center; justify-content: space-between; padding: 12px 10px; border-bottom: 1px solid #eee;">
                    <!-- Tên file -->
                    <span style="font-family: monospace; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${img.path}">
                        ${img.path}
                    </span>
                    
                    <!-- Nút Upload -->
                    <div id="upload-status-${index}">
                        <input type="file" accept="image/*" class="swal-upload-input" data-index="${index}" style="display:none;">
                        <button onclick="document.querySelector('.swal-upload-input[data-index=\\'${index}\\']').click()" class="swal2-styled">Chọn ảnh</button>
                    </div>
                </li>`;
        });
        modalHtml += `</ul>`;

        const result = await Swal.fire({
            title: 'Tải lên hình ảnh',
            html: modalHtml,
            width: '700px',
            showConfirmButton: true,
            confirmButtonText: 'Hoàn tất & Thay thế',
            allowOutsideClick: false,
            showCancelButton: true,
            cancelButtonText: 'Hủy',
            didOpen: () => {
                document.querySelectorAll('.swal-upload-input').forEach(input => {
                    input.addEventListener('change', async (evt) => {
                        const fileToUpload = evt.target.files[0];
                        if (!fileToUpload) return;
                        
                        const index = evt.target.dataset.index;
                        const statusDiv = document.getElementById(`upload-status-${index}`);
                        statusDiv.innerHTML = '<i>Đang tải lên...</i>';

                        try {
                            const baseUrl = await uploadFileToCloudinary(fileToUpload);
                            const transformedUrl = applyCloudinaryTransforms(baseUrl);
                            foundImages[index].newUrl = transformedUrl;
                            statusDiv.innerHTML = '<span style="color: green; font-weight: bold;">✔ Đã tải lên</span>';
                        } catch (error) {
                            console.error(`Lỗi tải ảnh cho ${foundImages[index].path}:`, error);
                            statusDiv.innerHTML = `<span style="color: red;">Lỗi!</span> <button onclick="document.querySelector('.swal-upload-input[data-index=\\'${index}\\']').click()" class="swal2-styled swal2-deny">Thử lại</button>`;
                        }
                    });
                });
            },
            preConfirm: () => {
                const notUploaded = foundImages.filter(img => !img.newUrl);
                if (notUploaded.length > 0) {
                    Swal.showValidationMessage(`Vui lòng tải lên ${notUploaded.length} ảnh còn lại.`);
                    return false;
                }
                return true;
            }
        });

        if (result.isConfirmed) {
            let updatedContent = originalContent;
            
            foundImages.forEach(img => {
                // TẠO THẺ IMG VỚI CLASS MẶC ĐỊNH
                const newHtmlTag = `<img class="inline-image img-center" src='${img.newUrl}'>`;
                
                // Thay thế toàn bộ lệnh \includegraphics bằng thẻ <img> đã có class
                updatedContent = updatedContent.replace(img.fullCommand, newHtmlTag);
            });
            
            resolve(updatedContent); // Trả về nội dung đã cập nhật
        } else {
            reject(new Error("Người dùng đã hủy bỏ quá trình upload ảnh."));
        }
    });
}

    // --- C. HÀM XỬ LÝ TẠO ĐỀ THI FIREBASE ---
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
            const addExamFunction = functions.httpsCallable('addExamWithStorage');
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

    // ==========================================================
    // === 3. KHỞI TẠO ỨNG DỤNG VÀ GÁN SỰ KIỆN ===
    // ==========================================================
    
    // ==========================================================
// === 3. KHỞI TẠO ỨNG DỤNG VÀ GÁN SỰ KIỆN ===
// ==========================================================

function initializeApp() {
    console.log("Khởi tạo ứng dụng soạn thảo V4...");

    // Hàm helper để gán sự kiện an toàn
    const addSafeListener = (element, event, handler) => {
        if (element) {
            element.addEventListener(event, handler);
        } else {
            // Dòng console.warn này giúp bạn biết nếu có ID nào đó bị gõ sai trong HTML
            // console.warn(`Cảnh báo: Không tìm thấy phần tử để gán sự kiện '${event}'.`);
        }
    };

    // --- Gán sự kiện cho các nút hành động chính ---

    addSafeListener(addQuestionBtn, 'click', () => {
        const newQuestionTemplate = `\\begin{ex}\n Nội dung câu ${questions.length + 1} \n  \\choice\n  {\\True}\n  {}\n  {} \n  {}\n  \\loigiai{\n Nội dung lời giải}\n\\end{ex}`;
        questions.push(newQuestionTemplate);
        renderEditor();
        triggerAutoConversion();
        if (questionEditorContainer) {
            questionEditorContainer.scrollTop = questionEditorContainer.scrollHeight;
        }
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

    // --- Sự kiện quan trọng nhất: Tải file .tex ---
    addSafeListener(loadFileBtn, 'click', () => fileInputHidden.click());
    addSafeListener(fileInputHidden, 'change', processAndLoadTexFile);

    // --- Gán sự kiện cho các nút copy ---

    const createCopyHandler = (inputElement, type) => () => {
        if (!inputElement || !inputElement.value.trim()) {
            Swal.fire('Cảnh báo', `Không có ${type} để sao chép.`, 'warning');
            return;
        }
        navigator.clipboard.writeText(inputElement.value)
            .then(() => Swal.fire('Thành công!', `Đã sao chép ${type}.`, 'success'))
            .catch(err => {
                 console.error(`Lỗi sao chép ${type}:`, err);
                 Swal.fire('Lỗi', `Không thể sao chép ${type}. Vui lòng thử lại.`, 'error');
            });
    };
    addSafeListener(copyOutputBtn, 'click', createCopyHandler(converterOutputArea, 'nội dung Output'));
    addSafeListener(copyKeysBtn, 'click', createCopyHandler(extractedKeysInput, 'Keys'));
    addSafeListener(copyCoresBtn, 'click', createCopyHandler(extractedCoresInput, 'Cores'));

    // --- Gán sự kiện cho các tính năng phụ (TikZ, input...) ---

    addSafeListener(replaceImagesBtn, 'click', performImageReplacement);
    addSafeListener(imageLinksArea, 'input', updateCounters);
    
    // Sự kiện này giúp cập nhật phần review khi người dùng sửa tay nội dung output
    addSafeListener(converterOutputArea, 'input', () => {
        if (!converterOutputArea) return;
        const currentContent = converterOutputArea.value;
        const currentKeys = extractedKeysInput ? extractedKeysInput.value : '';
        renderReview(currentContent, currentKeys);
    });

    // --- Gán sự kiện cho chức năng Tạo Đề Thi (Firebase) ---
    addSafeListener(createExamBtn, 'click', showCreateExamDialog);


    // --- Logic khởi tạo ban đầu ---

    // Đưa các hàm cần thiết ra `window` nếu các script khác cần gọi
    window.app = {
        populateQuestionsFromText: populateQuestionsFromText,
    processIncludeGraphics: processIncludeGraphics
    };

    // Bắt đầu với một câu hỏi mẫu để người dùng không thấy trang trống
    if (addQuestionBtn) {
        addQuestionBtn.click();
    }
    
    console.log("Ứng dụng đã sẵn sàng.");
}

    // Chạy ứng dụng
    initializeApp();

});