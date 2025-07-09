// File: js/ex_converter_page.js
// PHIÊN BẢN HOÀN CHỈNH - ĐÃ SỬA LỖI, BẢO TOÀN 100% CHỨC NĂNG RENDER

document.addEventListener('DOMContentLoaded', () => {

    // --- 1. DOM ELEMENT CACHING ---
    const getEl = (id) => document.getElementById(id);
    const exEditorContainer = getEl('ex-editor-container');
    const addExBtn = getEl('add-ex-btn');
    const loadFileBtn = getEl('load-file-btn');
    const fileInputHidden = getEl('file-input-hidden');
    const clearInputBtn = getEl('clear-input-btn');
    const convertBtn = getEl('convert-btn');
    const outputArea = getEl('converter-output-area');
    const keysOutput = getEl('extracted-keys');
    const coresOutput = getEl('extracted-cores');
    const reviewArea = getEl('review-display-area');

    // --- 2. STATE MANAGEMENT ---
    let exQuestions = [];

    // --- 3. HELPER FUNCTIONS ---
    window.copyToClipboard = (btn, inputId) => {
        const inputElement = getEl(inputId);
        if (!inputElement || !inputElement.value) {
            Swal.fire({ icon: 'warning', title: 'Không có gì để sao chép!', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
            return;
        }
        navigator.clipboard.writeText(inputElement.value).then(() => {
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check"></i> Đã chép';
            setTimeout(() => { btn.innerHTML = originalText; }, 1500);
        }).catch(err => Swal.fire('Lỗi', `Không thể sao chép: ${err}`, 'error'));
    };

    function renderKatexInElement(element) {
        if (window.renderMathInElement) {
            try {
                window.renderMathInElement(element, { delimiters: [{left: '$$',right: '$$',display: true},{left: '$',right: '$',display: false},{left: '\\(',right: '\\)',display: false},{left: '\\[',right: '\\]',display: true}], throwOnError: false });
            } catch (error) { console.error("KaTeX rendering error:", error); }
        }
    }

    // --- 4. CORE UI RENDERING FOR EDITOR ---
    function renderExEditor() {
        exEditorContainer.innerHTML = '';
        exQuestions.forEach((questionText, index) => {
            const frame = document.createElement('div');
            frame.className = 'question-editor-frame';
            frame.dataset.index = index;
            frame.innerHTML = `
                <div class="frame-header">
                    <span class="frame-title">Câu ${index + 1}</span>
                    <div class="frame-actions">
                        <button class="collapse-btn" title="Thu gọn/Mở rộng"><i class="fas fa-chevron-down collapse-icon"></i></button>
                        <button class="delete-btn" title="Xóa câu"><i class="fas fa-trash-alt"></i></button>
                    </div>
                </div>
                <div class="frame-content"><textarea class="question-textarea"></textarea></div>`;
            frame.querySelector('.question-textarea').value = questionText;
            exEditorContainer.appendChild(frame);
        });
        attachFrameEventListeners();
    }

    function attachFrameEventListeners() {
        document.querySelectorAll('.question-editor-frame').forEach(frame => {
            const index = parseInt(frame.dataset.index, 10);
            const textarea = frame.querySelector('.question-textarea');
            textarea.addEventListener('input', () => { exQuestions[index] = textarea.value; });
            textarea.addEventListener('focus', () => {
                document.querySelectorAll('.question-editor-frame').forEach(f => f.classList.remove('is-focused'));
                frame.classList.add('is-focused');
            });
            frame.querySelector('.frame-header').addEventListener('click', e => {
                if (!e.target.closest('.delete-btn')) frame.classList.toggle('collapsed');
            });
            frame.querySelector('.delete-btn').addEventListener('click', () => {
                Swal.fire({
                    title: `Xóa Câu ${index + 1}?`, icon: 'warning', showCancelButton: true,
                    confirmButtonColor: '#d33', cancelButtonText: 'Hủy', confirmButtonText: 'Xóa'
                }).then(result => { if (result.isConfirmed) { exQuestions.splice(index, 1); renderExEditor(); } });
            });
        });
    }

    // --- 5. MAIN LOGIC & EVENT LISTENERS ---
    
    /**
     * [ĐÃ SỬA LỖI] Hàm xử lý chuyển đổi, giữ nguyên logic render gốc của bạn.
     */
    function handleConversion() {
        // Nối các câu hỏi lại thành một chuỗi lớn, y hệt như lấy từ textarea cũ
        const fullContent = exQuestions.join('\n\n');
        if (fullContent.trim() === '') {
            Swal.fire('Chưa có nội dung', 'Vui lòng soạn thảo hoặc tải file lên.', 'warning');
            return;
        }

        try {
            // ==========================================================
            // == BẢO TOÀN CHỨC NĂNG CỐT LÕI: GỌI HÀM CŨ NGUYÊN BẢN   ==
            // ==========================================================

            // Bước 1: Gọi hàm chuyển đổi chính từ ex-converter.js
            const result = convertExToStandardFormat(fullContent);
            
            // Bước 2: Điền kết quả vào các ô output
            outputArea.value = result.compiledContent;
            keysOutput.value = result.keys;
            coresOutput.value = result.cores;
            
            // Bước 3: [QUAN TRỌNG NHẤT] Gọi hàm render hiển thị làm bài từ quiz-parser.js
            // Đây chính là bước đã bị thiếu, gây ra lỗi render.
            if (typeof window.parseAndDisplayQuiz === 'function') {
                // Xóa nội dung cũ trước khi render mới
                reviewArea.innerHTML = ''; 
                // Gọi hàm "thần kỳ" của bạn
                window.parseAndDisplayQuiz(result.compiledContent, reviewArea);
                // Gọi lại KaTeX sau khi đã có cấu trúc HTML đúng
                renderKatexInElement(reviewArea); 
            } else {
                // Fallback nếu không tìm thấy hàm
                console.error("Lỗi: Không tìm thấy hàm `parseAndDisplayQuiz`. Hãy chắc chắn quiz-parser.js đã được nạp.");
                reviewArea.textContent = result.compiledContent; 
                renderKatexInElement(reviewArea);
            }
            
            Swal.fire({ icon: 'success', title: 'Chuyển đổi thành công!', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
        
        } catch (error) {
            Swal.fire('Lỗi chuyển đổi', `Đã xảy ra lỗi: ${error.message}`, 'error');
            console.error(error);
        }
    }

    function loadContentFromFile(content) {
        const exBlockRegex = /(\\begin\{(?:ex|bt)\}[\s\S]*?\\end\{(?:ex|bt)\})/ig;
        exQuestions = content.match(exBlockRegex) || [];
        if (exQuestions.length === 0) {
            Swal.fire('Không tìm thấy câu hỏi', 'File không chứa khối `\\begin{ex}...\\end{ex}` nào.', 'info');
        }
        renderExEditor();
    }
    
    // Gán sự kiện cho các nút chính
    convertBtn.addEventListener('click', handleConversion);

    addExBtn.addEventListener('click', () => {
        const newExTemplate = `\\begin{ex}\n  Câu ${exQuestions.length + 1}: \n  \\choice\n  {\\True }\n  {}\n  {}\n  {}\n  \\loigiai{\n    \n  }\n\\end{ex}`;
        exQuestions.push(newExTemplate);
        renderExEditor();
        const lastFrame = exEditorContainer.querySelector('.question-editor-frame:last-child');
        if (lastFrame) {
            lastFrame.scrollIntoView({ behavior: 'smooth' });
            lastFrame.querySelector('textarea').focus();
        }
    });

    loadFileBtn.addEventListener('click', () => fileInputHidden.click());
    fileInputHidden.addEventListener('change', event => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = e => loadContentFromFile(e.target.result);
            reader.readAsText(file);
        }
        event.target.value = '';
    });

    clearInputBtn.addEventListener('click', () => {
        Swal.fire({
            title: 'Xóa tất cả?', text: 'Toàn bộ các câu hỏi sẽ bị xóa vĩnh viễn.', icon: 'warning',
            showCancelButton: true, confirmButtonColor: '#d33', cancelButtonText: 'Hủy', confirmButtonText: 'Xóa'
        }).then(result => { if (result.isConfirmed) { exQuestions = []; renderExEditor(); } });
    });

    // --- 6. INITIAL LOAD ---
    function initialize() {
        const initialContent = `\\begin{ex}\n  Câu 1: Thủ đô của Pháp là gì?\n  \\choice\n  {London}\n  {Berlin}\n  {\\True Paris}\n  {Rome}\n  \\loigiai{\n    Paris là thủ đô và là thành phố lớn nhất của Pháp.\n  }\n\\end{ex}\n\n\\begin{ex}\n  Câu 2: Kết quả của phép tính $5 \\times 5$ là bao nhiêu?\n  \\shortans{25}\n  \\core{0.5}\n  \\loigiai{\n    $5 \\times 5 = 25$.\n  }\n\\end{ex}`;
        loadContentFromFile(initialContent);
    }
    initialize();
});