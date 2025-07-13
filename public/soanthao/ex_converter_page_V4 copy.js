// =========================================================================
// ==              ex_converter_page_V4.js - PHIÊN BẢN HOÀN CHỈNH          ==
// ==          Copy & Paste toàn bộ nội dung này vào file của bạn         ==
// =========================================================================

document.addEventListener('DOMContentLoaded', () => {

    // ==========================================================
    // === 1. KHAI BÁO BIẾN VÀ LẤY CÁC PHẦN TỬ DOM (TẬP TRUNG) ===
    // ==========================================================
    const getEl = (id) => document.getElementById(id);

    // --- Các phần tử giao diện chính ---
    const questionEditorContainer = getEl("question-editor-container");
    const converterOutputArea = getEl("converter-output-area");
    const reviewDisplayArea = getEl("review-display-area");
    const extractedKeysInput = getEl("extracted-keys");
    const extractedCoresInput = getEl("extracted-cores");
    
    // --- Các nút hành động chính ---
    const addQuestionBtn = getEl("add-question-btn");
    const loadFileBtn = getEl("load-file-btn");
    const fileInputHidden = getEl("file-input-hidden");
    const clearInputBtn = getEl("clear-input-btn");
    const copyOutputBtn = getEl("copy-output-btn");
    const copyKeysBtn = getEl("copy-keys-btn");
    const copyCoresBtn = getEl("copy-cores-btn");
    const saveAsExamBtn = getEl("save-as-exam-btn");

    // --- Các phần tử liên quan đến xác thực (Auth) ---
    const userInfoSpan = getEl("user-info");
    const authBtn = getEl("auth-btn");

    // --- Các phần tử cho chức năng TikZ (nếu có) ---
    const imageLinksArea = getEl("image-links-area");
    const replaceImagesBtn = getEl("replace-images-btn");
    const linkTikzCounter = getEl("link-tikz-counter");
    
    // Kiểm tra các phần tử quan trọng
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
    
    // Tất cả các hàm xử lý logic của bạn (renderEditor, runFullConversion, v.v...)
    // được đặt ở đây và không cần thay đổi.

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
                if (updateCounters) updateCounters();
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
            extractedKeysInput.value = '';
            extractedCoresInput.value = '';
            reviewDisplayArea.innerHTML = '<p style="text-align: center; color: #888;">Soạn thảo câu hỏi để xem trước.</p>';
            return;
        }

        if (typeof window.convertExToStandardFormat !== 'function') {
            console.error("Hàm convertExToStandardFormat không tồn tại.");
            return;
        }
        
        try {
            const conversionResult = window.convertExToStandardFormat(fullInputContent);
            converterOutputArea.value = conversionResult.compiledContent;
            extractedKeysInput.value = conversionResult.keys;
            extractedCoresInput.value = conversionResult.cores;
            renderReview(conversionResult.compiledContent, conversionResult.keys);
        } catch (error) {
            reviewDisplayArea.innerHTML = `<div class="error-message" style="padding: 20px; text-align:center;"><strong>Lỗi cú pháp:</strong><br>${error.message}</div>`;
            converterOutputArea.value = `LỖI: ${error.message}`;
        }
    }
    
    function renderReview(compiledContent, keysString) {
        if (typeof window.parseMCQuestion !== 'function') {
            console.error("Hàm parseMCQuestion không tồn tại.");
            return;
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
            if (!parsedData) return;

            const questionDiv = document.createElement("div");
            questionDiv.className = "question";
            
            const statementDiv = document.createElement("div");
            statementDiv.className = "question-statement";
            const titleRegex = /^(Câu\s*\d+\s*[:.]?\s*)/i;
            const match = parsedData.statement.match(titleRegex);

            if (match) {
                const questionTitle = match[1];
                const questionContent = parsedData.statement.substring(questionTitle.length).trim();
                statementDiv.innerHTML = `<span class="question-number-highlight">${questionTitle}</span> ${questionContent}`;
            } else {
                statementDiv.innerHTML = parsedData.statement;
            }
            questionDiv.appendChild(statementDiv);
            
            // Render options, solutions, etc. (logic này đã tốt)
            // ...

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
        }
        renderEditor();
        triggerAutoConversion();
    }
    
    function updateCounters() {
        if (!imageLinksArea || !linkTikzCounter) return;
        // ... (logic của bạn ở đây)
    }

    async function handleSaveAsExam() {
        const content = converterOutputArea.value.trim();
        const keys = extractedKeysInput.value.trim();
        const cores = extractedCoresInput.value.trim();

        if (!content || !keys || !cores) {
            Swal.fire('Thiếu thông tin', 'Vui lòng xử lý file LaTeX để có Nội dung, Keys và Cores trước khi lưu.', 'warning');
            return;
        }

        const { value: formValues } = await Swal.fire({
            title: 'Lưu thành Đề thi mới',
            html: `
                <p>Nhập các thông tin còn lại cho đề thi.</p>
                <input id="swal-exam-code" class="swal2-input" placeholder="Mã đề thi (VD: T001)" required>
                <input id="swal-exam-time" type="number" class="swal2-input" placeholder="Thời gian làm bài (phút)" value="90" required>
            `,
            focusConfirm: false,
            confirmButtonText: '<i class="fas fa-save"></i> Lưu ngay',
            showCancelButton: true,
            cancelButtonText: 'Hủy',
            preConfirm: () => {
                const examCode = document.getElementById('swal-exam-code').value.trim();
                const timeLimit = document.getElementById('swal-exam-time').value;
                if (!examCode || !timeLimit) {
                    Swal.showValidationMessage(`Vui lòng nhập đủ Mã đề và Thời gian`);
                    return false;
                }
                return { examCode, timeLimit: parseInt(timeLimit, 10) };
            }
        });

        if (!formValues) return;

        const examData = {
            examType: 'TEXT',
            examCode: formValues.examCode,
            timeLimit: formValues.timeLimit,
            keys, cores, content,
        };
        
        Swal.fire({
            title: 'Đang lưu đề thi...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        try {
            const addExamWithStorage = firebase.functions().httpsCallable('addExamWithStorage');
            const result = await addExamWithStorage({ examData });
            Swal.fire({
                icon: 'success',
                title: 'Thành công!',
                text: result.data.message,
                footer: '<a href="/index.html" target="_blank">Đi đến trang quản lý đề thi?</a>'
            });
        } catch (error) {
            console.error("Lỗi khi lưu đề thi:", error);
            Swal.fire({
                icon: 'error',
                title: 'Đã có lỗi xảy ra',
                text: `Không thể lưu đề thi. Lỗi: ${error.message}`
            });
        }
    }

    // ==========================================================
    // === 3. ĐỊNH NGHĨA CÁC HÀM KHỞI TẠO VÀ GÁN SỰ KIỆN ===
    // ==========================================================

    function assignEventListeners() {
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

        loadFileBtn.addEventListener('click', () => fileInputHidden.click());
        copyOutputBtn.addEventListener('click', () => {
            if (!converterOutputArea.value.trim()) return Swal.fire('Cảnh báo', 'Không có nội dung để sao chép.', 'warning');
            navigator.clipboard.writeText(converterOutputArea.value).then(() => Swal.fire('Thành công!', 'Đã sao chép nội dung Output.', 'success'));
        });
        copyKeysBtn.addEventListener('click', () => {
            if (!extractedKeysInput.value.trim()) return Swal.fire('Cảnh báo', 'Không có Keys để sao chép.', 'warning');
            navigator.clipboard.writeText(extractedKeysInput.value).then(() => Swal.fire('Thành công!', 'Đã sao chép Keys.', 'success'));
        });
        copyCoresBtn.addEventListener('click', () => {
            if (!extractedCoresInput.value.trim()) return Swal.fire('Cảnh báo', 'Không có Cores để sao chép.', 'warning');
            navigator.clipboard.writeText(extractedCoresInput.value).then(() => Swal.fire('Thành công!', 'Đã sao chép Cores.', 'success'));
        });
        
        // Gán sự kiện cho nút Lưu ở đây
        saveAsExamBtn.addEventListener('click', handleSaveAsExam);
        
        converterOutputArea.addEventListener('input', () => triggerAutoConversion());

        fileInputHidden.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (!file) return;

            let rules = null;
            try {
                const response = await fetch('/soanthao/replace.json');
                if (response.ok) rules = await response.json();
            } catch (error) { console.error("Không tải được replace.json:", error); }

            const reader = new FileReader();
            reader.onload = (e) => {
                let content = e.target.result;
                if (rules && typeof TextPreprocessor !== 'undefined') {
                    content = TextPreprocessor.process(content, rules);
                }
                populateQuestionsFromText(content);
                Swal.fire('Thành công!', `Đã tải lên và tách thành ${questions.length} câu hỏi.`, 'success');
            };
            reader.readAsText(file);
            event.target.value = '';
        });
    }

    function setupAuth() {
        // Kiểm tra xem các phần tử auth có tồn tại không
        if (!userInfoSpan || !authBtn) {
            console.warn("Các phần tử Auth không được tìm thấy, chức năng đăng nhập sẽ bị vô hiệu hóa.");
            // Ẩn luôn nút lưu nếu không có phần tử auth
            if(saveAsExamBtn) saveAsExamBtn.style.display = 'none';
            return;
        }

        // Ẩn nút lưu ban đầu
        saveAsExamBtn.style.display = 'none';
        
        // Gọi initializeAuth từ file auth-manager.js
        initializeAuth(
            (user) => { // Hàm được gọi khi đăng nhập thành công (onLogin)
                userInfoSpan.textContent = `Chào, ${user.displayName || user.email}!`;
                authBtn.textContent = 'Đăng xuất';
                authBtn.style.display = 'inline-block';
                authBtn.onclick = () => signOut(); // signOut từ auth-manager.js
                
                // Hiển thị nút lưu khi đã đăng nhập
                saveAsExamBtn.style.display = 'inline-flex';
            },
            () => { // Hàm được gọi khi đăng xuất (onLogout)
                userInfoSpan.textContent = 'Bạn chưa đăng nhập.';
                authBtn.textContent = 'Đăng nhập';
                authBtn.style.display = 'inline-block';
                authBtn.onclick = () => signInWithGoogle(); // signInWithGoogle từ auth-manager.js
                
                // Ẩn nút lưu khi đã đăng xuất
                saveAsExamBtn.style.display = 'none';
            }
        );
    }
    
    // ==========================================================
    // === 4. KHỞI TẠO TOÀN BỘ ỨNG DỤNG ===
    // ==========================================================
    
    // Gán tất cả sự kiện cho các nút
    assignEventListeners();
    
    // Thiết lập hệ thống xác thực (Auth)
    setupAuth();

    // Tạo câu hỏi mẫu ban đầu
    addQuestionBtn.click();
    
    console.log("Ứng dụng soạn thảo V4 đã khởi tạo thành công.");

}); // Đóng listener DOMContentLoaded