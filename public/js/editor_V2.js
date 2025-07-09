// PHIÊN BẢN HOÀN CHỈNH: Tích hợp Upload DOCX với ảnh lên Cloudinary

document.addEventListener('DOMContentLoaded', () => {

    // === START: CẤU HÌNH CLOUDINARY ===
    // THAY THẾ BẰNG THÔNG TIN CỦA BẠN (Lấy từ file sangnhc.html)
    const CLOUDINARY_CLOUD_NAME = "dfprmep2p"; // <--- THAY THẾ BẰNG TÊN CLOUD CỦA BẠN
    const CLOUDINARY_UPLOAD_PRESET = "up2web"; // <--- THAY THẾ BẰNG UPLOAD PRESET CỦA BẠN
    const CLOUDINARY_TRANSFORMS = "q_auto,f_auto,h_200"; // <-- Các thuộc tính bạn muốn thêm
    // === END: CẤU HÌNH CLOUDINARY ===


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

    // Hàm chèn text vào toolbar
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
        const newText = originalText.substring(0, start) + startTag + selectedText + endTag + originalText.substring(end);
        activeTextarea.value = newText;
        activeTextarea.focus();
        const newSelectionStart = start + startTag.length;
        const newSelectionEnd = newSelectionStart + selectedText.length;
        activeTextarea.setSelectionRange(newSelectionStart, newSelectionEnd);
        activeTextarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Hàm thay thế '\\' bằng '<br>'
    function convertLineBreaks(text) {
        if (!text || typeof text !== 'string') return text;
        const mathBlocksRegex = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$[\s\S]*?\$|\\\([\s\S]*?\\\))/g;
        const parts = text.split(mathBlocksRegex);
        return parts.map((part, index) => (index % 2 === 0) ? (part || '').replace(/\\\\/g, '<br>') : part).join('');
    }

    // Hàm thay thế placeholder ảnh cũ và hiển thị ảnh từ URL đầy đủ
    function processImagePlaceholders(text) {
        if (!text || typeof text !== 'string') return text;
        let processedText = text;
        // Xử lý placeholder cũ
        processedText = processedText.replace(/sangnhc1\//g, 'https://gitlab.com/nguyensangnhc/pic4web/-/raw/main/Hinh/')
            .replace(/sangnhc2\//g, 'https://gitlab.com/nguyensangnhc/tikz4web/-/raw/main/Hinh/')
            .replace(/sangnhc3\//g, 'https://gitlab.com/nguyensangnhc/tikz2png/-/raw/main/Hinh/')
            .replace(/sangnhc4\//g, 'https://gitlab.com/nguyensangnhc/png2link/-/raw/main/Hinh/');

        // Tự động chuyển các URL ảnh (kể cả Cloudinary) thành thẻ <img>
        // Regex này tìm các URL kết thúc bằng .png, .jpg, .jpeg, .gif, .webp
        const imageUrlRegex = /(https?:\/\/[^\s]+?\.(?:png|jpg|jpeg|gif|webp|svg))/gi;
        processedText = processedText.replace(imageUrlRegex, (url) => `<img src="${url}" alt="image" class="inline-image">`);
        
        return processedText;
    }


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


    // --- 4. CORE UI RENDERING ---
    // ... (Toàn bộ các hàm renderEditor, attachFrameEventListeners, renderQuestionPreview giữ nguyên) ...
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
                        <button class="collapse-btn" title="Thu gọn/Mở rộng"><i class="fas fa-chevron-down collapse-icon"></i></button>
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
    function attachFrameEventListeners() {
        document.querySelectorAll('.question-editor-frame').forEach(frame => {
            const index = parseInt(frame.dataset.index, 10);
            const textarea = frame.querySelector('.question-textarea');
            const header = frame.querySelector('.frame-header');
            const deleteBtn = frame.querySelector('.delete-btn');
            
            textarea.addEventListener('input', () => {
                questions[index] = textarea.value;
                updateReview();
            });
            textarea.addEventListener('focus', () => {
                document.querySelectorAll('.question-editor-frame').forEach(f => f.classList.remove('is-focused'));
                frame.classList.add('is-focused');
            });
            header.addEventListener('click', e => {
                if (!e.target.closest('.delete-btn')) frame.classList.toggle('collapsed');
            });
            deleteBtn.addEventListener('click', () => {
                Swal.fire({
                    title: `Xóa Câu ${index + 1}?`, text: 'Hành động này không thể hoàn tác.',
                    icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33',
                    cancelButtonText: 'Hủy', confirmButtonText: 'Vẫn xóa'
                }).then(result => { 
                    if (result.isConfirmed) {
                        questions.splice(index, 1);
                        renderEditor();
                        updateReview();
                    }
                });
            });
        });
    }
    function renderQuestionPreview(parsedData, index, correctKey) {
        const questionDiv = document.createElement("div");
        questionDiv.className = "question";
        questionDiv.id = `review-q-${index}`;
        
        const statementDiv = document.createElement("div");
        statementDiv.className = "question-statement";
        let questionContent = parsedData.statement.replace(/^(Câu\s*\d+\s*[:.]?\s*)/i, '').trim();
        const newQuestionTitle = `<span class="question-number-highlight">Câu ${index + 1}:</span>`;
        statementDiv.innerHTML = newQuestionTitle + " " + convertLineBreaks(processImagePlaceholders(questionContent));
        questionDiv.appendChild(statementDiv);

        if (parsedData.type === 'MC') {
            const optionsContainer = document.createElement('div');
            optionsContainer.className = `mc-options mc-layout-${parsedData.layout}`;
            parsedData.options.forEach(opt => {
                const optionDiv = document.createElement("div");
                const isCorrect = correctKey && correctKey.toUpperCase() === opt.label.replace('.', '');
                optionDiv.className = isCorrect ? "mc-option correct-answer-preview" : "mc-option";
                optionDiv.innerHTML = `<span class="mc-option-label">${opt.label}</span><span class="mc-option-content">${convertLineBreaks(processImagePlaceholders(opt.content))}</span>`;
                optionsContainer.appendChild(optionDiv);
            });
            questionDiv.appendChild(optionsContainer);
        } 
        else if (parsedData.type === 'TABLE_TF') {
            const table = document.createElement('table');
            table.className = 'table-tf-container';
            table.innerHTML = `<thead><tr><th>Mệnh đề</th><th>Đúng</th><th>Sai</th></tr></thead><tbody>`;
            parsedData.options.forEach((opt, idx) => {
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
        else if (parsedData.type === 'NUMERIC') {
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
            expDiv.innerHTML = convertLineBreaks(processImagePlaceholders(parsedData.solution));
            toggleBtn.onclick = (e) => { e.stopPropagation(); expDiv.classList.toggle("hidden"); toggleBtn.textContent = expDiv.classList.contains("hidden") ? "Xem lời giải" : "Ẩn lời giải"; };
            questionDiv.appendChild(toggleBtn);
            questionDiv.appendChild(expDiv);
        }
        reviewDisplayArea.appendChild(questionDiv);
    }
    
    // --- 5. MAIN LOGIC FLOW ---
    // ... (Hàm updateReview giữ nguyên) ...
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

    // --- 6. DOCX UPLOAD LOGIC (PHẦN QUAN TRỌNG NHẤT) ---

    /**
 * Hàm tải một file (dưới dạng base64 data URI) lên Cloudinary.
 * @param {string} base64Data - Dữ liệu ảnh dạng data:image/png;base64,...
 * @returns {Promise<string>} - Promise trả về URL của ảnh đã upload VÀ ĐÃ BIẾN ĐỔI.
 */
function uploadImageToCloudinary(base64Data) {
    return new Promise((resolve, reject) => {
        const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
        const formData = new FormData();
        formData.append('file', base64Data);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

        fetch(url, { method: 'POST', body: formData })
            .then(response => {
                if (!response.ok) {
                    return response.json().then(err => { throw new Error(err.error.message || 'Lỗi không xác định từ Cloudinary'); });
                }
                return response.json();
            })
            .then(data => {
                // *** SỬA ĐỔI Ở ĐÂY ***
                // Lấy URL gốc
                const originalUrl = data.secure_url;
                // Chèn các thuộc tính biến đổi vào URL
                const transformedUrl = originalUrl.replace('/upload/', `/upload/${CLOUDINARY_TRANSFORMS}/`);
                // Trả về URL đã biến đổi
                resolve(transformedUrl);
            })
            .catch(error => reject(error));
    });
}


   // --- 6. DOCX UPLOAD LOGIC (PHẦN QUAN TRỌNG NHẤT) ---

/**
 * Hàm tải một file (dưới dạng base64 data URI) lên Cloudinary.
 * @param {string} base64Data - Dữ liệu ảnh dạng data:image/png;base64,...
 * @returns {Promise<string>} - Promise trả về URL của ảnh đã upload.
 */
function uploadImageToCloudinary(base64Data) {
    return new Promise((resolve, reject) => {
        const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
        const formData = new FormData();
        formData.append('file', base64Data);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

        fetch(url, { method: 'POST', body: formData })
            .then(response => {
                if (!response.ok) {
                    return response.json().then(err => { throw new Error(err.error.message || 'Lỗi không xác định từ Cloudinary'); });
                }
                return response.json();
            })
            .then(data => resolve(data.secure_url))
            .catch(error => reject(error));
    });
}

// **BẮT ĐẦU KHỐI CODE THAY THẾ**

/**
 * Chuyển đổi HTML do Mammoth.js tạo ra thành văn bản thuần túy.
 * Thẻ <img> sẽ được thay thế bằng URL bọc trong cú pháp [center]...[/center].
 * @param {string} html - Chuỗi HTML đầu vào.
 * @returns {string} - Văn bản thuần túy đã được xử lý.
 */
function convertMammothHtmlToPlainText(html) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    // Thay thế tất cả thẻ <img> bằng URL được bọc trong cú pháp căn giữa mặc định.
    tempDiv.querySelectorAll('img').forEach(img => {
        const wrappedUrlNode = document.createTextNode(`\n[center]${img.src}[/center]\n`);
        img.parentNode.replaceChild(wrappedUrlNode, img);
    });

    tempDiv.querySelectorAll('p').forEach(p => {
        const br = document.createTextNode('\n');
        p.appendChild(br);
    });
    
    let plainText = tempDiv.textContent || tempDiv.innerText || '';

    plainText = plainText
        .replace(/^[ \t]*\n/gm, '\n') 
        .replace(/(\n\s*){3,}/g, '\n\n'); 

    return plainText.trim();
}

/**
 * Xử lý văn bản từ textarea để hiển thị trong khung preview.
 * Hàm này sẽ tìm cú pháp [align]...[/align] và chuyển nó thành thẻ <img class="img-align">.
 * @param {string} text - Văn bản từ textarea.
 * @returns {string} - Chuỗi HTML sẵn sàng để hiển thị.
 */
function processImagePlaceholders(text) {
    if (!text || typeof text !== 'string') return text;
    
    // Tạo bản sao để không thay đổi chuỗi gốc
    let processedText = text;

    // Regex mới để tìm cú pháp [align]url[/align]
    // Group 1: (center|left|right) -> tên class căn chỉnh
    // Group 2: (https?://...) -> URL của ảnh
    const alignmentRegex = /\[(center|left|right)\]\s*(https?:\/\/[^\]\s]+)\s*\[\/\1\]/gi;
    
    processedText = processedText.replace(alignmentRegex, (match, alignment, url) => {
        // Tạo thẻ img với class tương ứng, ví dụ: "img-center"
        return `<img src="${url}" alt="image" class="inline-image img-${alignment}">`;
    });

    return processedText;
}

// **KẾT THÚC KHỐI CODE THAY THẾ**

/**
 * Xử lý file DOCX được tải lên, trích xuất ảnh, upload và chèn lại link.
 */
async function handleDocxUpload(event) {
    const file = event.target.files[0];
    if (!file || !file.name.endsWith('.docx')) {
        if (file) Swal.fire('File không hợp lệ', 'Vui lòng chỉ chọn file có định dạng .docx', 'error');
        return;
    }

    Swal.fire({
        title: 'Đang xử lý file...',
        html: 'Vui lòng chờ. Quá trình này có thể mất vài phút tùy thuộc vào số lượng và kích thước ảnh.',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    const reader = new FileReader();
    reader.onload = async e => {
        try {
            const arrayBuffer = e.target.result;
            let imageCounter = 0;
            let uploadedCount = 0;

            const imageHandler = async (image) => {
                imageCounter++;
                Swal.update({
                    html: `Đã tìm thấy ${imageCounter} ảnh. Đang tải lên ảnh ${uploadedCount + 1}/${imageCounter}...`
                });

                const base64 = await image.read("base64");
                const src = `data:${image.contentType};base64,${base64}`;

                try {
                    const cloudinaryUrl = await uploadImageToCloudinary(src);
                    uploadedCount++;
                     Swal.update({
                        html: `Đã tải lên thành công ${uploadedCount}/${imageCounter} ảnh...`
                    });
                    return { src: cloudinaryUrl };
                } catch (uploadError) {
                    console.error('Cloudinary Upload Error:', uploadError);
                    // Dừng lại và báo lỗi nếu có ảnh không upload được
                    throw new Error(`Không thể tải ảnh thứ ${uploadedCount + 1} lên Cloudinary: ${uploadError.message}`);
                }
            };

            const mammothOptions = { convertImage: mammoth.images.inline(imageHandler) };
            const result = await mammoth.convertToHtml({ arrayBuffer }, mammothOptions);
            const htmlContent = result.value;

            // **SỬ DỤNG HÀM MỚI Ở ĐÂY**
            const plainTextContent = convertMammothHtmlToPlainText(htmlContent);

            const newQuestions = plainTextContent.split(/(?=Câu\s*\d+[:.]?\s*)/)
                .map(q => q.trim())
                .filter(b => b.trim() !== '');

            if (newQuestions.length === 0) {
                throw new Error("Không tìm thấy câu hỏi nào trong file. Vui lòng đảm bảo mỗi câu bắt đầu bằng 'Câu X:'.");
            }

            questions = newQuestions;
            renderEditor();
            updateReview();
            Swal.fire('Thành công!', `Đã tải lên và xử lý ${questions.length} câu hỏi. ${uploadedCount} ảnh đã được chèn link vào nội dung.`, 'success');

        } catch (err) {
            Swal.fire('Lỗi xử lý file', `Đã có lỗi xảy ra: ${err.message}`, 'error');
        }
    };

    reader.onerror = () => Swal.fire('Lỗi đọc file', 'Không thể đọc file đã chọn.', 'error');
    reader.readAsArrayBuffer(file);
    event.target.value = '';
}


    // --- 7. EVENT LISTENERS ---
    addQuestionBtn.addEventListener('click', () => {
        const newQuestionTemplate = `Câu ${questions.length + 1}: \nA. \nB. \nC. \nD. \n\\begin{loigiai}\n\n\\end{loigiai}`;
        questions.push(newQuestionTemplate);
        renderEditor();
        updateReview();
        questionEditorContainer.scrollTop = questionEditorContainer.scrollHeight;
    });

    clearEditorBtn.addEventListener('click', () => {
        Swal.fire({
            title: 'Xóa tất cả?', text: 'Toàn bộ các câu hỏi sẽ bị xóa vĩnh viễn.', icon: 'warning',
            showCancelButton: true, confirmButtonColor: '#d33', cancelButtonText: 'Hủy', confirmButtonText: 'Vẫn xóa'
        }).then(result => {
            if (result.isConfirmed) { questions = []; renderEditor(); updateReview(); }
        });
    });

    copyContentBtn.addEventListener('click', () => {
        const fullContent = questions.join('\n\n');
        const cleanContent = fullContent.replace(/^\s*#(?![#])\s*/gm, '');
        if (cleanContent.trim() === '') {
            Swal.fire('Chưa có nội dung', 'Vui lòng soạn thảo trước khi sao chép.', 'warning'); return;
        }
        navigator.clipboard.writeText(cleanContent)
            .then(() => Swal.fire('Thành công!', 'Đã sao chép nội dung đề thi.', 'success'))
            .catch(err => Swal.fire('Lỗi', 'Không thể sao chép: ' + err, 'error'));
    });

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

    // --- GLOBAL FUNCTIONS EXPOSURE ---
    window.insertTextToEditor = insertTextToEditor; // Cho phép HTML gọi
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