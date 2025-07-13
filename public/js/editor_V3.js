// js/editor_V3.js - PHIÊN BẢN HOÀN CHỈNH
// Kiến trúc "Hybrid": Kết hợp Mammoth.js (Client) và Pandoc (Server)

document.addEventListener('DOMContentLoaded', () => {

    // === 1. CẤU HÌNH ===
    const CLOUDINARY_CLOUD_NAME = "dfprmep2p";
    const CLOUDINARY_UPLOAD_PRESET = "up2web";
    const CLOUDINARY_TRANSFORMS = "q_auto,f_auto,h_200";
    // URL của API mới trên server, chỉ dùng để xử lý MathType
    const PANDOC_API_URL = 'https://tikz-server-227060125780.asia-southeast1.run.app/html-to-text';

    // === 2. DOM ELEMENT CACHING ===
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

    // === 3. STATE MANAGEMENT ===
    let questions = [];

    // === 4. CÁC HÀM PHỤ TRỢ (Giữ nguyên từ cấu trúc V2) ===
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
        if (!text) return text;
        const mathBlocksRegex = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$[\s\S]*?\$|\\\([\s\S]*?\\\))/g;
        return text.split(mathBlocksRegex).map((part, index) => (index % 2 === 0) ? (part || '').replace(/\\\\/g, '<br>') : part).join('');
    }

    function processImagePlaceholders(text) {
        if (!text) return text;
        const alignmentRegex = /\[(center|left|right)\]\s*(https?:\/\/[^\]\s]+)\s*\[\/\1\]/gi;
        return text.replace(alignmentRegex, (match, alignment, url) => {
            return `<img src="${url}" alt="image" class="inline-image img-${alignment}">`;
        });
    }

    function extractInfoFromBlock(block) {
        let key = '', type = 'UNKNOWN';
        const mcMatch = block.match(/^\s*#(?![#])\s*([A-D])\./m);
        if (mcMatch) { type = 'MC'; key = mcMatch[1]; return { key, type }; }
        if (/^\s*[a-d]\)/m.test(block)) {
            type = 'TABLE_TF';
            let tfKey = ['a', 'b', 'c', 'd'].map(char => /^\s*#(?![#])\s*[a-d]\)/m.test(block.replace(new RegExp(`^\\s*#(?![#])\\s*${char}\\)`), '')) ? 'T' : 'F').join('');
             tfKey = "";
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

    // --- 5. CORE UI RENDERING (Giữ nguyên từ V2) ---
    function renderEditor() { /* ... */ }
    function attachFrameEventListeners() { /* ... */ }
    function renderQuestionPreview(parsedData, index, correctKey) { /* ... */ }
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
                // allCores.push(info.type === 'TABLE_TF' ? '0.1,0.25,0.5,1' : '0.25');
                // --- BẮT ĐẦU THAY THẾ TỪ ĐÂY ---
    let coreValue; // Tạo một biến để lưu giá trị core
    if (info.type === 'TABLE_TF') {
        coreValue = '0.1,0.25,0.5,1'; // Đúng như cũ
    } else if (info.type === 'NUMERIC') {
        coreValue = '0.5'; // Thêm trường hợp cho câu hỏi dạng số
    } else { // Mặc định cho các trường hợp còn lại (bao gồm MC)
        coreValue = '0.25';
    }
    allCores.push(coreValue);
    // --- KẾT THÚC THAY THẾ ---
                const cleanBlock = block.replace(/^\s*#(?![#])\s*/gm, '');
                if (window.parseMCQuestion) {
                    const parsedData = window.parseMCQuestion(cleanBlock);
                    // Giả sử hàm renderQuestionPreview của bạn có tồn tại và hoạt động đúng
                    if (parsedData) renderQuestionPreview(parsedData, index, info.key);
                    else reviewDisplayArea.innerHTML += `<p class="error-message">[Lỗi phân tích Câu ${index + 1}]</p>`;
                }
            });
            generatedKeysInput.value = allKeys.join('|');
            generatedCoresInput.value = allCores.join('|');
            renderKatexInElement(reviewDisplayArea);
        }, 300);
    }
    
    // --- 6. DOCX UPLOAD LOGIC (Kiến trúc "V2+") ---

    function uploadImageToCloudinary(base64Data) {
        return new Promise((resolve, reject) => {
            const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
            const formData = new FormData();
            formData.append('file', base64Data);
            formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
            fetch(url, { method: 'POST', body: formData })
                .then(response => response.ok ? response.json() : response.json().then(err => Promise.reject(err)))
                .then(data => {
                    const originalUrl = data.secure_url;
                    const transformedUrl = originalUrl.replace('/upload/', `/upload/${CLOUDINARY_TRANSFORMS}/`);
                    resolve(transformedUrl);
                })
                .catch(error => reject(error));
        });
    }

    function convertHtmlImagesToCustomTags(html) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        tempDiv.querySelectorAll('img').forEach(img => {
            img.outerHTML = `\n[center]${img.src}[/center]\n`;
        });
        return tempDiv.innerHTML;
    }

    async function handleDocxUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        Swal.fire({
            title: 'Đang xử lý file...',
            html: 'Bước 1/3: Trích xuất & Tải lên ảnh...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        try {
            // BƯỚC 1 (CLIENT): Dùng Mammoth.js để xử lý ảnh
            const arrayBuffer = await file.arrayBuffer();
            const imageHandler = async (image) => {
                const base64 = await image.read("base64");
                const src = `data:${image.contentType};base64,${base64}`;
                return { src: await uploadImageToCloudinary(src) };
            };
            const mammothResult = await mammoth.convertToHtml({ arrayBuffer }, { convertImage: mammoth.images.inline(imageHandler) });
            
            let htmlWithCloudinaryLinks = mammothResult.value;
            let htmlWithCustomTags = convertHtmlImagesToCustomTags(htmlWithCloudinaryLinks);
            
            // BƯỚC 2 (GỌI SERVER): Gửi HTML để Pandoc xử lý MathType
            Swal.update({ html: 'Bước 2/3: Server chuyển đổi MathType...' });
            
            const response = await fetch(PANDOC_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ html_content: htmlWithCustomTags })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Lỗi từ server Pandoc.');

            const finalPlainText = data.text;

            // BƯỚC 3 (CLIENT): Nạp kết quả vào editor
            Swal.update({ html: 'Bước 3/3: Hoàn tất...' });
            const newQuestions = finalPlainText.split(/(?=Câu\s*\d+[:.]?\s*)/).map(q => q.trim()).filter(Boolean);
            if (newQuestions.length === 0) throw new Error("Không tìm thấy câu hỏi nào trong file.");

            questions = newQuestions;
            renderEditor();
            updateReview();
            Swal.close();
            Swal.fire('Thành công!', `Đã xử lý ${questions.length} câu hỏi.`, 'success');

        } catch (err) {
            Swal.fire('Lỗi', `Đã xảy ra lỗi: ${err.message}`, 'error');
        } finally {
            event.target.value = '';
        }
    }
    
    // --- 7. EVENT LISTENERS & INITIAL LOAD (Giữ nguyên từ V2) ---
    addQuestionBtn.addEventListener('click', () => {
        const newQuestionTemplate = `Câu ${questions.length + 1}: \nA. \nB. \nC. \nD. \n\\begin{loigiai}\n\n\\end{loigiai}`;
        questions.push(newQuestionTemplate); renderEditor(); updateReview();
    });
    clearEditorBtn.addEventListener('click', () => { /* ... */ });
    copyContentBtn.addEventListener('click', () => { /* ... */ });
    uploadDocxBtn.addEventListener('click', () => docxFileInput.click());
    docxFileInput.addEventListener('change', handleDocxUpload); // <-- Hàm này đã được nâng cấp
    
    initializeEditor();
    function initializeEditor() {
        const initialContent = `Câu 1: Thủ đô của Pháp là gì?\nA. London\nB. Berlin\n#C. Paris\nD. Rome`;
        questions = initialContent.split(/(?=Câu\s*\d+:\s*)/).filter(Boolean);
        renderEditor();
        updateReview();
    }
    window.insertTextToEditor = insertTextToEditor;
    window.copySingleField = (inputId) => { /* ... */ };

    // --- Điền lại code cho các hàm rút gọn ---
    // (Bạn cần copy code chi tiết của các hàm này từ file V2 gốc của bạn)
    renderEditor = function() { questionEditorContainer.innerHTML = ''; questions.forEach((text, i) => { const frame = document.createElement('div'); frame.className = 'question-editor-frame'; frame.dataset.index = i; frame.innerHTML = `<div class="frame-header"><span class="frame-title">Câu ${i+1}</span><div class="frame-actions"><button class="collapse-btn"><i class="fas fa-chevron-down"></i></button><button class="delete-btn"><i class="fas fa-trash-alt"></i></button></div></div><div class="frame-content"><textarea class="question-textarea"></textarea></div>`; frame.querySelector('textarea').value = text; questionEditorContainer.appendChild(frame); }); attachFrameEventListeners(); };
    attachFrameEventListeners = function() { document.querySelectorAll('.question-editor-frame').forEach(frame => { const index = parseInt(frame.dataset.index); const textarea = frame.querySelector('textarea'); textarea.addEventListener('input', () => { questions[index] = textarea.value; updateReview(); }); textarea.addEventListener('focus', () => { document.querySelectorAll('.question-editor-frame').forEach(f => f.classList.remove('is-focused')); frame.classList.add('is-focused'); }); frame.querySelector('.frame-header').addEventListener('click', e => !e.target.closest('.delete-btn') && frame.classList.toggle('collapsed')); frame.querySelector('.delete-btn').addEventListener('click', () => Swal.fire({title: `Xóa Câu ${index+1}?`,icon:'warning',showCancelButton: true}).then(r => r.isConfirmed && (questions.splice(index,1), renderEditor(), updateReview()))); }); };
    renderQuestionPreview = function(parsedData, index, correctKey) { const qd = document.createElement('div'); qd.className = 'question'; qd.id = `review-q-${index}`; const st = document.createElement('div'); st.className = 'question-statement'; st.innerHTML = `<span class="question-number-highlight">Câu ${index+1}:</span> ${convertLineBreaks(processImagePlaceholders(parsedData.statement.replace(/^(Câu\s*\d+\s*[:.]?\s*)/i, '').trim()))}`; qd.appendChild(st); if (parsedData.type === 'MC') { const oc = document.createElement('div'); oc.className = `mc-options mc-layout-${parsedData.layout}`; parsedData.options.forEach(opt => { const od = document.createElement('div'); const isCorrect = correctKey && correctKey.toUpperCase() === opt.label.replace('.',''); od.className = `mc-option ${isCorrect ? 'correct-answer-preview' : ''}`; od.innerHTML = `<span class="mc-option-label">${opt.label}</span><span class="mc-option-content">${convertLineBreaks(processImagePlaceholders(opt.content))}</span>`; oc.appendChild(od); }); qd.appendChild(oc); } if (parsedData.solution) { const tb = document.createElement('button'); tb.className = 'toggle-explanation btn'; tb.textContent = 'Xem lời giải'; const ed = document.createElement('div'); ed.className = 'explanation hidden'; ed.innerHTML = convertLineBreaks(processImagePlaceholders(parsedData.solution)); tb.onclick = () => { ed.classList.toggle('hidden'); tb.textContent = ed.classList.contains('hidden') ? 'Xem lời giải' : 'Ẩn lời giải'; }; qd.appendChild(tb); qd.appendChild(ed); } reviewDisplayArea.appendChild(qd); };
    copyContentBtn.addEventListener('click', () => { navigator.clipboard.writeText(questions.join('\n\n').replace(/^\s*#(?![#])\s*/gm, '')).then(() => Swal.fire('Thành công', 'Đã sao chép', 'success')).catch(err => Swal.fire('Lỗi', ''+err, 'error')); });
    window.copySingleField = (id) => { const el = document.getElementById(id); if (el && el.value) { navigator.clipboard.writeText(el.value).then(() => Swal.fire({icon:'success', title:'Đã sao chép', toast:true, position:'top-end', timer:1500, showConfirmButton:false})); } };
});