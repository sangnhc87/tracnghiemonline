// File: js/ex_converter_page.js (Phiên bản Nâng cấp - Tô màu đáp án)

// --- DOM Elements ---
const getEl = (id) => document.getElementById(id);
let converterInputArea;
let converterOutputArea;
let convertBtn;
let copyOutputBtn;
let clearInputBtn;
let clearOutputBtn;
let reviewDisplayArea;
let extractedKeysInput;
let extractedCoresInput;
let loadFileBtn;
let fileInputHidden;

// --- Hàm tiện ích (không đổi) ---
function renderKatexInElement(element) {
    if (window.renderMathInElement) {
        try {
            window.renderMathInElement(element, {
                delimiters: [
                    {left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false},
                    {left: '\\(', right: '\\)', display: false}, {left: '\\[', right: '\\]', display: true}
                ],
                throwOnError: false
            });
        } catch (error) { console.error("KaTeX rendering error:", error); }
    }
}

function processImagePlaceholders(text) {
    if (!text || typeof text !== 'string') return text;
    let processedText = text.replace(/sangnhc[1-4]\//g, (match) => `https://gitlab.com/nguyensangnhc/${{'1':'pic4web','2':'tikz4web','3':'tikz2png','4':'png2link'}[match[7]]}/-/raw/main/Hinh/`);
    return processedText;
}

// --- Logic xử lý chuyển đổi và hiển thị review (ĐÃ NÂNG CẤP) ---
let conversionReviewTimeout; 

function performConversionAndRenderReview() {
    clearTimeout(conversionReviewTimeout);
    conversionReviewTimeout = setTimeout(() => {
        const inputContent = converterInputArea.value;
        
        extractedKeysInput.value = '';
        extractedCoresInput.value = '';
        reviewDisplayArea.innerHTML = '<p style="text-align: center; color: #888; padding: 20px;">Nội dung xem trước sẽ hiển thị ở đây.</p>';

        if (typeof window.convertExToStandardFormat !== 'function') {
            Swal.fire('Lỗi', 'Không tìm thấy hàm chuyển đổi (ex-converter.js).', 'error');
            return;
        }

        let conversionResult;
        try {
            conversionResult = window.convertExToStandardFormat(inputContent);
        } catch (error) {
            converterOutputArea.value = `Lỗi cú pháp: ${error.message}\nVui lòng kiểm tra lại cấu trúc input.`;
            reviewDisplayArea.innerHTML = `<p class="error-message">Lỗi cú pháp: ${error.message}</p>`;
            return; 
        }
        
        converterOutputArea.value = conversionResult.compiledContent;
        extractedKeysInput.value = conversionResult.keys;
        extractedCoresInput.value = conversionResult.cores;
        
        // Tách chuỗi keys thành mảng để sử dụng
        const keysArray = conversionResult.keys.split('|');

        if (typeof window.parseMCQuestion !== 'function') { 
            reviewDisplayArea.innerHTML = '<p class="error-message">Lỗi: Không tìm thấy quiz-parser.js.</p>';
            return;
        }

        const questionBlocks = conversionResult.compiledContent.split(/\n\s*\n/).filter(block => block.trim() !== '');
        reviewDisplayArea.innerHTML = ''; // Xóa nội dung mặc định

        if (questionBlocks.length > 0 && questionBlocks[0].trim() !== '') { 
            questionBlocks.forEach((block, index) => {
                const parsedData = window.parseMCQuestion(block);
                // Lấy đáp án đúng cho câu hỏi hiện tại
                const correctKey = keysArray[index] || ''; 
                
                if (parsedData) {
                    const questionDiv = document.createElement("div");
                    questionDiv.className = "question"; 
                    questionDiv.id = `review-q-${index}`; 

                    const statementDiv = document.createElement("div");
                    statementDiv.className = "question-statement";
                    
                    let questionContent = parsedData.statement.replace(/^(Câu\s*\d+\s*[:.]?\s*)/i, '').trim();
                    const newQuestionTitle = `<span class="question-number-highlight">Câu ${index + 1}:</span>`;
                    statementDiv.innerHTML = newQuestionTitle + " " + processImagePlaceholders(questionContent);
                    questionDiv.appendChild(statementDiv);

                    // ==========================================================
                    // ==             LOGIC RENDER ĐÃ NÂNG CẤP Ở ĐÂY           ==
                    // ==========================================================
                    if (parsedData.type === 'MC') {
                        const optionsContainer = document.createElement('div');
                        optionsContainer.className = `mc-options mc-layout-${parsedData.layout}`; 
                        parsedData.options.forEach(opt => {
                            const optionDiv = document.createElement("div");
                            const isCorrect = correctKey && correctKey.toUpperCase() === opt.label.replace('.', '');
                            optionDiv.className = isCorrect ? "mc-option correct-answer-preview" : "mc-option";
                            optionDiv.innerHTML = `<span class="mc-option-label">${opt.label}</span><span class="mc-option-content">${processImagePlaceholders(opt.content)}</span>`;
                            optionsContainer.appendChild(optionDiv);
                        });
                        questionDiv.appendChild(optionsContainer);
                    } else if (parsedData.type === 'TABLE_TF') {
                        const table = document.createElement('table');
                        table.className = 'table-tf-container'; 
                        table.innerHTML = `<thead><tr><th>Mệnh đề</th><th>Đúng</th><th>Sai</th></tr></thead><tbody>`;
                        parsedData.options.forEach((opt, idx) => {
                             if (correctKey && idx < correctKey.length) {
                                const isCorrectT = correctKey[idx].toUpperCase() === 'T';
                                const tfClassT = isCorrectT ? 'table-tf-radio selected' : 'table-tf-radio';
                                const tfClassF = !isCorrectT ? 'table-tf-radio selected' : 'table-tf-radio';
                                table.innerHTML += `<tr><td>${opt.label}) ${processImagePlaceholders(opt.content)}</td><td><label class="${tfClassT}"></label></td><td><label class="${tfClassF}"></label></td></tr>`;
                            } else {
                                table.innerHTML += `<tr><td>${opt.label}) ${processImagePlaceholders(opt.content)}</td><td><label class="table-tf-radio"></label></td><td><label class="table-tf-radio"></label></td></tr>`;
                            }
                        });
                        table.innerHTML += `</tbody></table>`;
                        questionDiv.appendChild(table);
                    } else if (parsedData.type === 'NUMERIC') {
                        const numDiv = document.createElement("div");
                        numDiv.className = "numeric-option"; 
                        // Hiển thị đáp án đúng trong placeholder
                        numDiv.innerHTML = `<input type="text" placeholder="Đáp số: ${correctKey || 'N/A'}" disabled>`; 
                        questionDiv.appendChild(numDiv);
                    }
                    // ==========================================================

                    if (parsedData.solution && parsedData.solution.trim() !== '') {
                        const toggleBtn = document.createElement("button");
                        toggleBtn.className = "toggle-explanation btn"; 
                        toggleBtn.textContent = "Xem lời giải";
                        toggleBtn.style.display = 'block'; 
                        
                        const expDiv = document.createElement("div");
                        expDiv.className = "explanation hidden"; 
                        expDiv.innerHTML = processImagePlaceholders(parsedData.solution);

                        toggleBtn.onclick = (event) => {
                            event.stopPropagation(); 
                            expDiv.classList.toggle("hidden");
                            toggleBtn.textContent = expDiv.classList.contains("hidden") ? "Xem lời giải" : "Ẩn lời giải";
                        };

                        questionDiv.appendChild(toggleBtn);
                        questionDiv.appendChild(expDiv);
                    }

                    reviewDisplayArea.appendChild(questionDiv);
                } else {
                    reviewDisplayArea.innerHTML += `<p class="error-message">[Lỗi phân tích một khối câu hỏi]</p><pre>${block.substring(0, 200)}...</pre>`;
                }
            });
            renderKatexInElement(reviewDisplayArea);
        }
    }, 500); // Debounce
}


// --- Event Listeners (Không đổi) ---
document.addEventListener('DOMContentLoaded', () => {
    // Gán các phần tử DOM
    converterInputArea = getEl("converter-input-area");
    converterOutputArea = getEl("converter-output-area");
    convertBtn = getEl("convert-btn");
    copyOutputBtn = getEl("copy-output-btn");
    clearInputBtn = getEl("clear-input-btn");
    clearOutputBtn = getEl("clear-output-btn");
    reviewDisplayArea = getEl("review-display-area");
    extractedKeysInput = getEl("extracted-keys");
    extractedCoresInput = getEl("extracted-cores");
    loadFileBtn = getEl("load-file-btn");
    fileInputHidden = getEl("file-input-hidden");

    // Gán sự kiện
    convertBtn.addEventListener('click', performConversionAndRenderReview); 
    converterInputArea.addEventListener('input', performConversionAndRenderReview); 

    copyOutputBtn.addEventListener('click', () => {
        const outputContent = converterOutputArea.value;
        if (outputContent.trim() === '') {
            Swal.fire('Cảnh báo', 'Không có nội dung để sao chép.', 'warning');
            return;
        }
        navigator.clipboard.writeText(outputContent)
            .then(() => Swal.fire('Đã sao chép!', 'Nội dung đã chuyển đổi được sao chép.', 'success'))
            .catch(err => Swal.fire('Lỗi', 'Không thể sao chép: ' + err, 'error'));
    });

    window.copyToClipboard = (element) => {
        if (!element || !element.value || element.value.trim() === '') {
            Swal.fire('Cảnh báo', 'Không có nội dung để sao chép.', 'warning');
            return;
        }
        navigator.clipboard.writeText(element.value)
            .then(() => Swal.fire('Đã sao chép!', 'Nội dung đã được sao chép.', 'success'))
            .catch(err => Swal.fire('Lỗi', 'Không thể sao chép: ' + err, 'error'));
    };

    clearInputBtn.addEventListener('click', () => {
        converterInputArea.value = '';
        performConversionAndRenderReview(); 
    });

    clearOutputBtn.addEventListener('click', () => {
        converterOutputArea.value = '';
        reviewDisplayArea.innerHTML = '<p style="text-align: center; color: #888;">Nội dung xem trước sẽ hiển thị ở đây.</p>';
        extractedKeysInput.value = '';
        extractedCoresInput.value = '';
    });

    loadFileBtn.addEventListener('click', () => {
        fileInputHidden.click(); 
    });

    fileInputHidden.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.name.endsWith('.tex') && !file.name.endsWith('.txt')) {
            Swal.fire('Lỗi', 'Vui lòng chọn file .tex hoặc .txt.', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            let fileContent = e.target.result;
            fileContent = fileContent.replace(/^([^\%]*?)(?<!\\)%.*$/gm, '$1').trim();
            converterInputArea.value = fileContent; 
            performConversionAndRenderReview(); 
        };
        reader.onerror = (e) => {
            Swal.fire('Lỗi', 'Không thể đọc file: ' + e.target.error.message, 'error');
        };
        reader.readAsText(file); 
    });

    // Nội dung mẫu khi tải trang
    converterInputArea.value = `\\begin{ex}
  Câu 1: Thủ đô của Pháp là gì?
  \\choice
  {London}
  {Berlin}
  {\\True Paris}
  {Rome}
  \\loigiai{
    Paris là thủ đô và là thành phố lớn nhất của Pháp.
  }
\\end{ex}

\\begin{ex}
  Câu 2: Đánh giá các mệnh đề sau.
  \\choiceTF
  {\\True 2 là số chẵn.}
  {Trái Đất hình vuông.}
  {\\True Nước sôi ở 100 độ C.}
  {Mặt Trời quay quanh Trái Đất.}
  \\loigiai{
    Lời giải câu 2.
  }
\\end{ex}

\\begin{bt}
  Câu 3: Kết quả của 5 x 5 là bao nhiêu?
  \\shortans{25}
\\end{bt}
`;
    performConversionAndRenderReview();
});