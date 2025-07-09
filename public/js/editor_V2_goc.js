// PHIÊN BẢN HOÀN CHỈNH: Giao diện khung, Font Fira Code, Tải lên DOCX, Xử lý xuống dòng

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
    let questions = []; // Mảng chứa nội dung của từng câu hỏi (nguồn dữ liệu chính)

    // --- 3. HELPER & UI INTERACTION FUNCTIONS ---

    /**
     * *** NEW FUNCTION TO FIX THE ERROR ***
     * Chèn văn bản vào vị trí con trỏ của textarea đang được focus.
     * @param {string} startTag - Chuỗi ký tự chèn vào đầu.
     * @param {string} endTag - Chuỗi ký tự chèn vào cuối.
     * @param {string} placeholder - Văn bản được chọn mặc định sau khi chèn.
     */
    function insertTextToEditor(startTag, endTag, placeholder) {
        // Tìm textarea đang được focus (có class 'is-focused')
        const activeTextarea = document.querySelector('.question-editor-frame.is-focused .question-textarea');

        if (!activeTextarea) {
            Swal.fire({
                icon: 'info',
                title: 'Chưa chọn khung soạn thảo',
                text: 'Vui lòng nhấp vào một khung câu hỏi để bắt đầu chèn nội dung.',
                timer: 3000,
                timerProgressBar: true
            });
            return;
        }

        const start = activeTextarea.selectionStart;
        const end = activeTextarea.selectionEnd;
        const originalText = activeTextarea.value;
        const selectedText = originalText.substring(start, end);

        // Nếu người dùng đã bôi đen văn bản, dùng nó. Nếu không, dùng placeholder.
        const textToInsert = selectedText || placeholder;

        // Xây dựng chuỗi mới
        const newText =
            originalText.substring(0, start) +
            startTag +
            textToInsert +
            endTag +
            originalText.substring(end);

        // Cập nhật giá trị cho textarea
        activeTextarea.value = newText;

        // Đặt lại vị trí con trỏ để bôi đen phần placeholder/văn bản đã chèn
        activeTextarea.focus();
        const newSelectionStart = start + startTag.length;
        const newSelectionEnd = newSelectionStart + textToInsert.length;
        activeTextarea.setSelectionRange(newSelectionStart, newSelectionEnd);

        // Quan trọng: Kích hoạt sự kiện 'input' để ứng dụng cập nhật state và preview
        activeTextarea.dispatchEvent(new Event('input', { bubbles: true }));
    }


    /**
     * Thay thế '\\' bằng '<br>' nhưng KHÔNG can thiệp vào bên trong môi trường toán học.
     */
    function convertLineBreaks(text) {
        if (!text || typeof text !== 'string') return text;
        const mathBlocksRegex = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$[\s\S]*?\$|\\\([\s\S]*?\\\))/g;
        const parts = text.split(mathBlocksRegex);
        return parts.map((part, index) => {
            if (!part) return '';
            return (index % 2 === 0) ? part.replace(/\\\\/g, '<br>') : part;
        }).join('');
    }

    /**
     * Trích xuất đáp án và loại câu hỏi từ một khối văn bản.
     */
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

    
    /**
     * Thay thế các placeholder hình ảnh.
     */
    function processImagePlaceholders(text) {
        if (!text || typeof text !== 'string') return text;
        return text.replace(/sangnhc1\//g, 'https://gitlab.com/nguyensangnhc/pic4web/-/raw/main/Hinh/')
                   .replace(/sangnhc2\//g, 'https://gitlab.com/nguyensangnhc/tikz4web/-/raw/main/Hinh/')
                   .replace(/sangnhc3\//g, 'https://gitlab.com/nguyensangnhc/tikz2png/-/raw/main/Hinh/')
                   .replace(/sangnhc4\//g, 'https://gitlab.com/nguyensangnhc/png2link/-/raw/main/Hinh/');
    }

    /**
     * Gọi KaTeX để render toán học.
     */
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
                        <button class="collapse-btn" title="Thu gọn/Mở rộng"><i class="fas fa-chevron-down collapse-icon"></i></button>
                        <button class="delete-btn" title="Xóa câu này"><i class="fas fa-trash-alt"></i></button>
                    </div>
                </div>
                <div class="frame-content">
                    <textarea class="question-textarea"></textarea>
                </div>
            `;
            // Gán giá trị cho textarea bằng JS để xử lý ký tự đặc biệt tốt hơn
            frame.querySelector('.question-textarea').value = questionText;
            questionEditorContainer.appendChild(frame);
        });
        attachFrameEventListeners();
    }

    /**
     * Gán sự kiện cho các nút và textarea trong các khung vừa được render.
     */
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

    /**
     * Vẽ lại khung xem trước từ một đối tượng câu hỏi đã được phân tích.
     */
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
    function handleDocxUpload(event) {
        const file = event.target.files[0];
        if (!file || !file.name.endsWith('.docx')) {
            if(file) Swal.fire('File không hợp lệ', 'Vui lòng chỉ chọn file có định dạng .docx', 'error');
            return;
        }
        Swal.fire({ title: 'Đang xử lý file...', text: 'Vui lòng chờ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        const reader = new FileReader();
        reader.onload = e => {
            mammoth.extractRawText({ arrayBuffer: e.target.result })
                .then(result => {
                    const newQuestions = result.value.split(/(?=\n*Câu\s*\d+:\s*)/).filter(b => b.trim() !== '');
                    if (newQuestions.length === 0) throw new Error("Không tìm thấy câu hỏi nào trong file. Vui lòng đảm bảo mỗi câu bắt đầu bằng 'Câu X:'.");
                    
                    questions = newQuestions;
                    renderEditor();
                    updateReview();
                    Swal.fire('Thành công!', `Đã tải lên và xử lý ${questions.length} câu hỏi.`, 'success');
                })
                .catch(err => Swal.fire('Lỗi xử lý file', `Đã có lỗi xảy ra: ${err.message}`, 'error'));
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
    
    // --- 8. INITIAL LOAD ---
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
        questions = initialContent.split(/(?=\n*Câu\s*\d+:\s*)/).filter(block => block.trim() !== '');
        renderEditor();
        updateReview();
    }
    initializeEditor();

    // --- GLOBAL FUNCTIONS EXPOSURE ---
    // *** FIX: Expose the new function to the global scope (window) ***
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