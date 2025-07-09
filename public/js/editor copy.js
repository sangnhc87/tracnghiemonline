// File: js/editor.js

// --- DOM Elements ---
const getEl = (id) => document.getElementById(id);
const rawContentEditor = getEl("raw-content-editor");
const reviewDisplayArea = getEl("review-display-area");
const copyToClipboardBtn = getEl("copy-to-clipboard-btn");
const clearEditorBtn = getEl("clear-editor-btn");

// Footer stats
const charCountSpan = getEl("char-count");
const lineCountSpan = getEl("line-count");
const questionCountSpan = getEl("question-count");

// --- Hàm tiện ích cho KaTeX (tái sử dụng từ main.js) ---
function renderKatexInElement(element) {
    if (window.renderMathInElement) { // renderMathInElement đến từ auto-render.min.js của KaTeX
        try {
            window.renderMathInElement(element, {
                delimiters: [
                    {left: '$$', right: '$$', display: true},
                    {left: '$', right: '$', display: false},
                    {left: '\\(', right: '\\)', display: false},
                    {left: '\\[', right: '\\]', display: true}
                ],
                throwOnError: false // Quan trọng để không dừng lại khi có lỗi công thức
            });
        } catch (error) { console.error("KaTeX rendering error:", error); }
    }
}

// --- Hàm tiện ích cho xử lý hình ảnh placeholders (tái sử dụng từ main.js) ---
function processImagePlaceholders(text) {
    if (!text || typeof text !== 'string') return text;
    let processedText = text;
    // Đảm bảo các đường dẫn này khớp với các đường dẫn bạn đã thiết lập trong main.js
    processedText = processedText.replace(/sangnhc1\//g, 'https://gitlab.com/nguyensangnhc/pic4web/-/raw/main/Hinh/');
    processedText = processedText.replace(/sangnhc2\//g, 'https://gitlab.com/nguyensangnhc/tikz4web/-/raw/main/Hinh/');
    processedText = processedText.replace(/sangnhc3\//g, 'https://gitlab.com/nguyensangnhc/tikz2png/-/raw/main/Hinh/');
    processedText = processedText.replace(/sangnhc4\//g, 'https://gitlab.com/nguyensangnhc/png2link/-/raw/main/Hinh/');
    return processedText;
}

// --- Hàm chính để cập nhật review ---
let updateReviewTimeout; // Dùng để debounce việc cập nhật review

function updateReview() {
    clearTimeout(updateReviewTimeout);
    updateReviewTimeout = setTimeout(() => {
        const rawContent = rawContentEditor.value;
        reviewDisplayArea.innerHTML = ''; // Xóa nội dung cũ
        
        // Cập nhật thống kê footer
        charCountSpan.textContent = rawContent.length;
        lineCountSpan.textContent = rawContent.split('\n').length;
        
        // Phân tích nội dung thô bằng quiz-parser.js
        if (typeof window.parseMCQuestion === 'function') { // Đảm bảo quiz-parser.js đã nạp
            const questionBlocks = rawContent.split(/(?=\n*Câu\s*\d+:\s*)/).filter(block => block.trim() !== '');
            
            if (questionBlocks.length > 0 && questionBlocks[0].trim() !== '') { 
                questionCountSpan.textContent = questionBlocks.length;
                
                questionBlocks.forEach((block, index) => {
                    const parsedData = window.parseMCQuestion(block);
                    
                    if (parsedData) {
                        const questionDiv = document.createElement("div");
                        questionDiv.className = "question"; // Sử dụng class của câu hỏi gốc để render giống bài thi
                        questionDiv.id = `review-q-${index}`; 

                        const statementDiv = document.createElement("div");
                        statementDiv.className = "question-statement"; // Class từ style.css
                        
                        // Xử lý tiêu đề câu hỏi (tương tự loadQuiz trong main.js)
                        let questionContent = parsedData.statement.replace(/^(Câu\s*\d+\s*[:.]?\s*)/i, '').trim();
                        const newQuestionTitle = `<span class="question-number-highlight">Câu ${index + 1}:</span>`;
                        statementDiv.innerHTML = newQuestionTitle + " " + processImagePlaceholders(questionContent);
                        questionDiv.appendChild(statementDiv);

                        // Xử lý các options (tương tự loadQuiz)
                        if (parsedData.type === 'MC') {
                            const optionsContainer = document.createElement('div');
                            optionsContainer.className = `mc-options mc-layout-${parsedData.layout}`; // Class từ style.css
                            parsedData.options.forEach(opt => {
                                const optionDiv = document.createElement("div");
                                optionDiv.className = "mc-option"; // Class từ style.css
                                optionDiv.innerHTML = `<span class="mc-option-label">${opt.label}</span><span class="mc-option-content">${processImagePlaceholders(opt.content)}</span>`;
                                optionsContainer.appendChild(optionDiv);
                            });
                            questionDiv.appendChild(optionsContainer);
                        } else if (parsedData.type === 'TABLE_TF') {
                            const table = document.createElement('table');
                            table.className = 'table-tf-container'; // Class từ style.css
                            table.innerHTML = `<thead><tr><th>Mệnh đề</th><th>Đúng</th><th>Sai</th></tr></thead><tbody>`;
                            parsedData.options.forEach(opt => {
                                const tfClassT = opt.correctAnswer === 'T' ? 'table-tf-radio selected' : 'table-tf-radio';
                                const tfClassF = opt.correctAnswer === 'F' ? 'table-tf-radio selected' : 'table-tf-radio';
                                
                                table.innerHTML += `<tr><td>${opt.label}) ${processImagePlaceholders(opt.content)}</td><td><label class="${tfClassT}"></label></td><td><label class="${tfClassF}"></label></td></tr>`;
                            });
                            table.innerHTML += `</tbody></table>`;
                            questionDiv.appendChild(table);
                        } else if (parsedData.type === 'NUMERIC') {
                            const numDiv = document.createElement("div");
                            numDiv.className = "numeric-option"; // Class từ style.css
                            numDiv.innerHTML = `<input type="text" placeholder="Đáp số: ${parsedData.correctAnswer}" disabled>`; 
                            questionDiv.appendChild(numDiv);
                        }

                        // Lời giải (hiển thị luôn trong review)
                        if (parsedData.solution && parsedData.solution.trim() !== '') {
                            const toggleBtn = document.createElement("button");
                            toggleBtn.className = "toggle-explanation btn"; // Class từ style.css
                            toggleBtn.textContent = "Xem lời giải";
                            toggleBtn.style.display = 'block'; // Luôn hiển thị nút trong editor
                            
                            const expDiv = document.createElement("div");
                            expDiv.className = "explanation hidden"; // Mặc định ẩn, sẽ được toggle
                            expDiv.innerHTML = processImagePlaceholders(parsedData.solution);

                            // Gán sự kiện toggle cho nút lời giải
                            toggleBtn.onclick = (event) => {
                                // Ngăn sự kiện click lan ra div cha
                                event.stopPropagation(); 
                                expDiv.classList.toggle("hidden");
                                toggleBtn.textContent = expDiv.classList.contains("hidden") ? "Xem lời giải" : "Ẩn lời giải";
                            };

                            questionDiv.appendChild(toggleBtn);
                            questionDiv.appendChild(expDiv);
                        }

                        reviewDisplayArea.appendChild(questionDiv);
                    } else {
                        // Báo lỗi nếu parser không hiểu câu hỏi
                        reviewDisplayArea.innerHTML += `<p style="color: red; padding: 10px;">[Lỗi phân tích Câu ${index + 1}] Định dạng không hợp lệ hoặc thiếu nội dung.</p>`;
                    }
                });
                // Render KaTeX cho toàn bộ vùng review
                renderKatexInElement(reviewDisplayArea);
            } else {
                // Không có câu hỏi nào được phân tích
                questionCountSpan.textContent = '0';
                reviewDisplayArea.innerHTML = '<p style="text-align: center; color: #888; padding: 20px;">Nội dung xem trước sẽ hiển thị ở đây khi bạn soạn thảo.</p>';
            }
        } else {
            reviewDisplayArea.innerHTML = '<p style="color: red; padding: 20px;">Lỗi: Không tìm thấy quiz-parser.js hoặc hàm parseMCQuestion. Vui lòng kiểm tra console.</p>';
            questionCountSpan.textContent = '0';
        }
    }, 500); // Debounce 500ms
}

// Chèn văn bản vào vị trí con trỏ trong textarea
window.insertTextToEditor = (startTag, endTag, placeholderText = '') => {
    const editor = rawContentEditor;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const currentText = editor.value;

    let textToInsert = '';
    // Nếu có văn bản được chọn, bọc nó. Nếu không, chèn placeholder.
    if (start !== end) { 
        textToInsert = startTag + currentText.substring(start, end) + endTag;
    } else {
        textToInsert = startTag + placeholderText + endTag;
    }

    editor.value = currentText.substring(0, start) + textToInsert + currentText.substring(end, currentText.length);
    editor.focus();
    
    // Đặt con trỏ vào đúng vị trí sau khi chèn
    if (start !== end) { // Nếu có chọn text, con trỏ ở cuối phần chèn
        editor.selectionEnd = start + textToInsert.length;
    } else { // Nếu không chọn text, con trỏ ở cuối placeholder
        editor.selectionEnd = start + startTag.length + placeholderText.length;
    }
    
    updateReview(); // Cập nhật review sau khi chèn
};

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    rawContentEditor.addEventListener('input', updateReview); // Cập nhật review khi gõ

    clearEditorBtn.addEventListener('click', () => {
        Swal.fire({
            title: 'Xác nhận xóa tất cả?',
            text: 'Bạn có chắc chắn muốn xóa toàn bộ nội dung soạn thảo?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonText: 'Hủy',
            confirmButtonText: 'Xóa!'
        }).then((result) => {
            if (result.isConfirmed) {
                rawContentEditor.value = '';
                updateReview();
                Swal.fire('Đã xóa!', 'Nội dung soạn thảo đã được xóa.', 'success');
            }
        });
    });

    copyToClipboardBtn.addEventListener('click', () => {
        const content = rawContentEditor.value;
        if (content.trim() === '') {
            Swal.fire('Cảnh báo', 'Không có nội dung để sao chép!', 'warning');
            return;
        }
        navigator.clipboard.writeText(content)
            .then(() => Swal.fire('Đã sao chép!', 'Nội dung đề thi đã được sao chép vào clipboard. Bạn có thể dán vào form Tạo đề.', 'success'))
            .catch(err => Swal.fire('Lỗi', 'Không thể sao chép nội dung: ' + err, 'error'));
    });

    // Thêm nội dung mẫu và cập nhật review khi tải lần đầu
    rawContentEditor.value = `Câu 1: Nội dung câu hỏi đầu tiên.
A. Đáp án A
B. Đáp án B
C. Đáp án C
D. Đáp án D
\\begin{loigiai}
Lời giải câu 1
<img src="sangnhc2/20250617051323_VeDich_lg_ex_1.png">
\\end{loigiai}

Câu 2: Nội dung câu hỏi thứ hai có công thức LaTeX: $E=mc^2$ và 
a) Đáp án A
b) Đáp án B
c) Đáp án C
d) Đáp án D
\\begin{loigiai}
Lời giải câu 2
<img src="sangnhc2/20250617051323_VeDich_lg_ex_1.png">
\\end{loigiai}

Câu 3: Nội dung câu hỏi thứ hai có công thức LaTeX: $E=mc^2$ và 
\\begin{loigiai}
Lời giải câu 3
<img src="sangnhc2/20250617051323_VeDich_lg_ex_1.png">
\\end{loigiai}
`;
    updateReview(); 

// File: js/editor.js

// ... (các hàm và Event Listeners hiện có của bạn) ...

// === LOGIC CHO PHẦN CHUYỂN ĐỔI \begin{ex} SANG CHUẨN ===
// Khai báo các phần tử DOM cho Converter
const converterInputArea = getEl("converter-input-area");
const converterOutputArea = getEl("converter-output-area");
const convertBtn = getEl("convert-btn");
const copyConvertedBtn = getEl("copy-converted-btn");
const clearConverterInputBtn = getEl("clear-converter-input-btn");
const clearConverterOutputBtn = getEl("clear-converter-output-btn");

// Gán Event Listeners cho Converter
convertBtn.addEventListener('click', () => {
    const inputContent = converterInputArea.value;
    if (inputContent.trim() === '') {
        Swal.fire('Cảnh báo', 'Vui lòng dán nội dung vào khung Input để chuyển đổi.', 'warning');
        return;
    }
    // Gọi hàm convert chính từ ex-converter.js
    if (typeof window.convertExToStandardFormat === 'function') {
        const convertedContent = window.convertExToStandardFormat(inputContent);
        converterOutputArea.value = convertedContent;
    } else {
        Swal.fire('Lỗi', 'Không tìm thấy hàm chuyển đổi (ex-converter.js). Vui lòng kiểm tra console.', 'error');
    }
});

copyConvertedBtn.addEventListener('click', () => {
    const outputContent = converterOutputArea.value;
    if (outputContent.trim() === '') {
        Swal.fire('Cảnh báo', 'Không có nội dung để sao chép từ khung Output.', 'warning');
        return;
    }
    navigator.clipboard.writeText(outputContent)
        .then(() => Swal.fire('Đã sao chép!', 'Nội dung đã chuyển đổi được sao chép vào clipboard.', 'success'))
        .catch(err => Swal.fire('Lỗi', 'Không thể sao chép nội dung: ' + err, 'error'));
});

clearConverterInputBtn.addEventListener('click', () => {
    converterInputArea.value = '';
    converterOutputArea.value = ''; // Xóa luôn output
});

clearConverterOutputBtn.addEventListener('click', () => {
    converterOutputArea.value = '';
});

// Thêm nội dung mẫu vào converter input khi tải trang
converterInputArea.value = `\\begin{ex}
  Câu 1: Nội dung câu hỏi đầu tiên.
  \\choice
  {NÔI DUNG A NHIỀU DÒNG}
  {NÔI DUNG B NHIỀU DÒNG}
  {NÔI DUNG C NHIỀU DÒNG}
  {NÔI DUNG D NHIỀU DÒNG}
  \\loigiai{
    Lời giải câu 1 (có thể chứa $LaTeX$ hoặc <img src="sangnhc2/image_name_1.png">)
  }
\\end{ex}

\\begin{ex}
  Câu 2: Nội dung câu hỏi thứ hai có công thức LaTeX: $E=mc^2$ và <img src="sangnhc3/image_name_2.png">.
  \\loigiai{
    Lời giải câu 2 (có thể chứa $\\alpha + \\beta$)
  }
\\end{ex}
`;
// Update output ngay khi tải trang
if (typeof window.convertExToStandardFormat === 'function') {
    converterOutputArea.value = window.convertExToStandardFormat(converterInputArea.value);
}

});