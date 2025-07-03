// File: js/ex_converter_page.js (Phiên bản hoàn chỉnh 100%)

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

// --- Hàm tiện ích cho KaTeX (tái sử dụng) ---
function renderKatexInElement(element) {
    if (window.renderMathInElement) {
        try {
            window.renderMathInElement(element, {
                delimiters: [
                    {left: '$$', right: '$$', display: true},
                    {left: '$', right: '$', display: false},
                    {left: '\\(', right: '\\)', display: false},
                    {left: '\\[', right: '\\]', display: true}
                ],
                throwOnError: false
            });
        } catch (error) { console.error("KaTeX rendering error:", error); }
    }
}

// --- Hàm tiện ích cho xử lý hình ảnh placeholders (tái sử dụng) ---
function processImagePlaceholders(text) {
    if (!text || typeof text !== 'string') return text;
    let processedText = text;
    processedText = processedText.replace(/sangnhc1\//g, 'https://gitlab.com/nguyensangnhc/pic4web/-/raw/main/Hinh/');
    processedText = processedText.replace(/sangnhc2\//g, 'https://gitlab.com/nguyensangnhc/tikz4web/-/raw/main/Hinh/');
    processedText = processedText.replace(/sangnhc3\//g, 'https://gitlab.com/nguyensangnhc/tikz2png/-/raw/main/Hinh/');
    processedText = processedText.replace(/sangnhc4\//g, 'https://gitlab.com/nguyensangnhc/png2link/-/raw/main/Hinh/');
    
    return processedText;
}

// --- Logic xử lý chuyển đổi và hiển thị review ---
let conversionReviewTimeout; 

function performConversionAndRenderReview() {
    clearTimeout(conversionReviewTimeout);
    conversionReviewTimeout = setTimeout(() => {
        const inputContent = converterInputArea.value;
        
        extractedKeysInput.value = '';
        extractedCoresInput.value = '';
        reviewDisplayArea.innerHTML = ''; 

        if (typeof window.convertExToStandardFormat === 'function') {
            let conversionResult;
            try {
                conversionResult = window.convertExToStandardFormat(inputContent);
            } catch (error) {
                converterOutputArea.value = `Lỗi cú pháp: ${error.message}\nVui lòng kiểm tra lại dấu ngoặc {} trong phần input.`;
                reviewDisplayArea.innerHTML = `<p style="color: red; padding: 10px;">Lỗi cú pháp: ${error.message}</p>`;
                return; 
            }
            
            converterOutputArea.value = conversionResult.compiledContent;
            extractedKeysInput.value = conversionResult.keys;
            extractedCoresInput.value = conversionResult.cores;

            if (typeof window.parseMCQuestion === 'function') { 
                const questionBlocks = conversionResult.compiledContent.split(/\n\s*\n/).filter(block => block.trim() !== '');
                
                if (questionBlocks.length > 0 && questionBlocks[0].trim() !== '') { 
                    questionBlocks.forEach((block, index) => {
                        const parsedData = window.parseMCQuestion(block);
                        
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

                            if (parsedData.type === 'MC') {
                                const optionsContainer = document.createElement('div');
                                optionsContainer.className = `mc-options mc-layout-${parsedData.layout}`; 
                                parsedData.options.forEach(opt => {
                                    const optionDiv = document.createElement("div");
                                    optionDiv.className = "mc-option"; 
                                    optionDiv.innerHTML = `<span class="mc-option-label">${opt.label}</span><span class="mc-option-content">${processImagePlaceholders(opt.content)}</span>`;
                                    optionsContainer.appendChild(optionDiv);
                                });
                                questionDiv.appendChild(optionsContainer);
                            } else if (parsedData.type === 'TABLE_TF') {
                                const table = document.createElement('table');
                                table.className = 'table-tf-container'; 
                                table.innerHTML = `<thead><tr><th>Mệnh đề</th><th>Đúng</th><th>Sai</th></tr></thead><tbody>`;
                                parsedData.options.forEach(opt => {
                                    // Đối với review, chỉ cần hiển thị nút, không cần selected
                                    const tfClassT = 'table-tf-radio'; // Không selected mặc định
                                    const tfClassF = 'table-tf-radio'; // Không selected mặc định
                                    
                                    table.innerHTML += `<tr><td>${opt.label}) ${processImagePlaceholders(opt.content)}</td><td><label class="${tfClassT}"></label></td><td><label class="${tfClassF}"></label></td></tr>`;
                                });
                                table.innerHTML += `</tbody></table>`;
                                questionDiv.appendChild(table);
                            } else if (parsedData.type === 'NUMERIC') {
                                const numDiv = document.createElement("div");
                                numDiv.className = "numeric-option"; 
                                numDiv.innerHTML = `<input type="text" placeholder="Đáp số: ${parsedData.correctAnswer}" disabled>`; 
                                questionDiv.appendChild(numDiv);
                            }

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
                            reviewDisplayArea.innerHTML += `<p style="color: red; padding: 10px;">[Lỗi phân tích một khối câu hỏi] Định dạng không hợp lệ hoặc thiếu nội dung.</p><pre style="white-space: pre-wrap; font-size: 0.8em; color: #555;">${block.substring(0, Math.min(block.length, 200))}...</pre>`;
                        }
                    });
                    renderKatexInElement(reviewDisplayArea);
                } else {
                    reviewDisplayArea.innerHTML = '<p style="text-align: center; color: #888; padding: 20px;">Nội dung xem trước sẽ hiển thị ở đây.</p>';
                }
            } else {
                reviewDisplayArea.innerHTML = '<p style="color: red; padding: 20px;">Lỗi: Không tìm thấy quiz-parser.js hoặc hàm parseMCQuestion. Vui lòng kiểm tra console.</p>';
            }
        } else {
            Swal.fire('Lỗi', 'Không tìm thấy hàm chuyển đổi (ex-converter.js). Vui lòng kiểm tra console.', 'error');
        }
    }, 500); // Debounce 500ms
}


// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    // === GÁN CÁC PHẦN TỬ DOM ===
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


    // Gán Event Listeners cho Converter
    convertBtn.addEventListener('click', performConversionAndRenderReview); 
    converterInputArea.addEventListener('input', performConversionAndRenderReview); 

    copyOutputBtn.addEventListener('click', () => {
        const outputContent = converterOutputArea.value;
        if (outputContent.trim() === '') {
            Swal.fire('Cảnh báo', 'Không có nội dung để sao chép từ khung Output.', 'warning');
            return;
        }
        navigator.clipboard.writeText(outputContent)
            .then(() => Swal.fire('Đã sao chép!', 'Nội dung đã chuyển đổi được sao chép vào clipboard.', 'success'))
            .catch(err => Swal.fire('Lỗi', 'Không thể sao chép nội dung: ' + err, 'error'));
    });

    // Hàm tiện ích sao chép chung (dùng cho các nút copy Keys/Cores)
    window.copyToClipboard = (element) => {
        if (!element || !element.value || element.value.trim() === '') {
            Swal.fire('Cảnh báo', 'Không có nội dung để sao chép!', 'warning');
            return;
        }
        navigator.clipboard.writeText(element.value)
            .then(() => Swal.fire('Đã sao chép!', 'Nội dung đã sao chép vào clipboard.', 'success'))
            .catch(err => Swal.fire('Lỗi', 'Không thể sao chép nội dung: ' + err, 'error'));
    };

    clearInputBtn.addEventListener('click', () => {
        converterInputArea.value = '';
        performConversionAndRenderReview(); 
    });

    clearOutputBtn.addEventListener('click', () => {
        converterOutputArea.value = '';
        reviewDisplayArea.innerHTML = '<p style="text-align: center; color: #888; padding: 20px;">Nội dung xem trước sẽ hiển thị ở đây.</p>';
        extractedKeysInput.value = '';
        extractedCoresInput.value = '';
    });

    // Xử lý tải file .tex
    loadFileBtn.addEventListener('click', () => {
        fileInputHidden.click(); 
    });

    fileInputHidden.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.name.endsWith('.tex') && !file.name.endsWith('.txt')) {
            Swal.fire('Lỗi', 'Vui lòng chọn file văn bản (.txt) hoặc file LaTeX (.tex).', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            let fileContent = e.target.result;
            
            // XÓA CÁC DÒNG COMMENT LATEX (%)
            fileContent = fileContent.replace(/^([^\%]*?)(?<!\\)%.*$/gm, '$1').trim();

            converterInputArea.value = fileContent; 
            performConversionAndRenderReview(); 
        };
        reader.onerror = (e) => {
            Swal.fire('Lỗi', 'Không thể đọc file: ' + e.target.error.message, 'error');
        };
        reader.readAsText(file); 
    });

    // Thêm nội dung mẫu và chạy chuyển đổi khi tải trang
    converterInputArea.value = `\\begin{ex}
  % Đây là một dòng comment và sẽ bị xóa
  Câu 1: Nội dung câu hỏi đầu tiên.
  \\choice
  {NÔI DUNG A}
  {\\True NÔI DUNG B } % Đáp án B là đúng
  {NÔI DUNG C}
  {NÔI DUNG D}
  \\loigiai{
    Lời giải câu 1.
  }
\\end{ex}

% Đây là một comment khác
\\begin{ex}
  Câu 2: Câu hỏi Đúng/Sai.
  \\choiceTF
  {\\True Mệnh đề 1} % Mệnh đề 1 đúng
  {Mệnh đề 2}
  {\\True Mệnh đề 3} % Mệnh đề 3 đúng
  {Mệnh đề 4}
  \\loigiai{
    Lời giải câu 2.
  }
\\end{ex}

\\begin{bt} % Môi trường BT
  Câu 3: Câu hỏi điền số.
  \\shortans{42}
  \\loigiai{
    Lời giải câu 3.
  }
\\end{bt}

Đây là một đoạn văn bản nằm ngoài môi trường ex/bt.
Nó cũng sẽ được coi là một câu hỏi nếu bạn muốn.

\\begin{ex}
  Câu 5: Câu hỏi chỉ có nội dung, không có options/shortans.
  \\loigiai{
    Lời giải câu 5.
  }
\\end{ex}
`;
    performConversionAndRenderReview();
});