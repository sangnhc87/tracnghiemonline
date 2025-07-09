
function parseMCQuestion(questionBlock) {
    // Kiểm tra đầu vào cơ bản
    if (typeof questionBlock !== 'string' || !questionBlock.trim()) {
        return null;
    }

    // 1. Tách lời giải ra trước tiên để không ảnh hưởng đến logic phân tích
    let solution = '';
    const loigiaiRegex = /\\begin\{loigiai\}([\s\S]*?)\\end\{loigiai\}/i;
    const matchSolution = questionBlock.match(loigiaiRegex);
    if (matchSolution) {
        solution = matchSolution[1].trim();
        // Cập nhật lại khối câu hỏi sau khi đã tách lời giải
        questionBlock = questionBlock.replace(loigiaiRegex, '').trim();
    }

    // 2. Khởi tạo các biến để lưu trữ kết quả
    const lines = questionBlock.trim().split('\n');
    let statement = '';
    const options = [];
    let questionType = null; // Sẽ được xác định trong quá trình lặp
    let layoutHint = '2x2'; // Mặc định là layout 2x2
    let shouldShuffleOptions = true; // Mặc định là luôn trộn đáp án

    // 3. Định nghĩa các biểu thức chính quy (Regular Expressions) để nhận dạng
    const mcOptionRegex = /^([A-D])\.\s*(.*)/;        // Ví dụ: "A. Đáp án 1"
    const tableTfOptionRegex = /^([a-h])\)\s*(.*)/;   // Ví dụ: "a) Mệnh đề 1" (hỗ trợ đến h)
    // [MỚI] Gộp các chỉ thị vào một regex duy nhất
    const directiveRegex = /^##(1x4|2x2|4x1|no-shuffle)$/i;

    // 4. Lặp qua từng dòng để phân tích
    lines.forEach(line => {
        const trimmedLine = line.trim();

        // Kiểm tra xem dòng có phải là một chỉ thị không
        const directiveMatch = trimmedLine.match(directiveRegex);
        if (directiveMatch) {
            const directive = directiveMatch[1].toLowerCase();
            if (directive === 'no-shuffle') {
                shouldShuffleOptions = false; // Nếu gặp ##no-shuffle, đặt cờ không trộn
            } else {
                layoutHint = directive; // Nếu là chỉ thị layout, cập nhật layout
            }
            return; // Dòng này là chỉ thị, không xử lý tiếp
        }

        // Kiểm tra xem dòng có phải là một lựa chọn không
        const mcMatch = trimmedLine.match(mcOptionRegex);
        const tableTfMatch = trimmedLine.match(tableTfOptionRegex);

        if (mcMatch) {
            questionType = 'MC';
            options.push({ label: mcMatch[1], content: mcMatch[2].trim() });
        } else if (tableTfMatch) {
            questionType = 'TABLE_TF';
            options.push({ label: tableTfMatch[1], content: tableTfMatch[2].trim() });
        } else {
            // Nếu không phải chỉ thị, không phải lựa chọn, thì nó là một phần của câu hỏi
            statement += line + '\n';
        }
    });

    statement = statement.trim();

    // 5. Xác định loại câu hỏi cuối cùng nếu chưa rõ
    if (!questionType) {
        // Nếu không tìm thấy lựa chọn nào nhưng có nội dung câu hỏi, coi đó là câu điền số
        if (statement) {
            questionType = 'NUMERIC';
        } else {
            // Không có nội dung, không có lựa chọn -> khối không hợp lệ
            console.warn("Could not parse question block:", questionBlock);
            return null;
        }
    }

    // 6. Bọc "Câu N." bằng thẻ span để có thể style riêng
    // statement = statement.replace(/^(Câu\s*\d+\s*[:.]?\s*)/i, `<span class="statement-q-num">$&</span>`);

    // 7. Trả về object kết quả hoàn chỉnh
    return {
        statement: statement,
        options: options, // Có thể là mảng rỗng nếu là câu NUMERIC
        solution: solution,
        layout: layoutHint,
        type: questionType,
        shouldShuffleOptions: shouldShuffleOptions // **QUAN TRỌNG**: Thuộc tính mới
    };
}
// File: js/quiz-parser.js

function parseMCQuestionGGGG(questionBlock) {
    if (typeof questionBlock !== 'string' || !questionBlock.trim()) {
        return null;
    }

    // Tách lời giải ra trước
    let solution = '';
    const loigiaiRegex = /\\begin\{loigiai\}([\s\S]*?)\\end\{loigiai\}/i;
    const matchSolution = questionBlock.match(loigiaiRegex);
    if (matchSolution) {
        solution = matchSolution[1].trim();
        questionBlock = questionBlock.replace(loigiaiRegex, '').trim();
    }

    // Khởi tạo các biến
    const lines = questionBlock.trim().split('\n');
    let statement = '';
    const options = [];
    let questionType = null;
    let layoutHint = '2x2';
    let shouldShuffleOptions = true;

    // Định nghĩa các biểu thức chính quy
    const mcOptionRegex = /^\s*([A-D])\.\s*(.*)/;
    const tableTfOptionRegex = /^\s*([a-h])\)\s*(.*)/;
    const directiveRegex = /^##(1x4|2x2|4x1|no-shuffle|options-layout=.*|shuffle-options=.*)$/i;

    // Lặp qua từng dòng để phân tích
    lines.forEach(line => {
        const trimmedLine = line.trim();

        // Kiểm tra chỉ thị trước tiên
        const directiveMatch = trimmedLine.match(directiveRegex);
        if (directiveMatch) {
            const directive = directiveMatch[0].toLowerCase(); // Lấy toàn bộ chỉ thị
            if (directive.includes('no-shuffle')) {
                shouldShuffleOptions = false;
            } else if (directive.includes('options-layout=')) {
                layoutHint = directive.split('=')[1];
            } else if (['##1x4', '##2x2', '##4x1'].includes(directive)) {
                 layoutHint = directive.replace('##','');
            }
            return; // Đã xử lý, bỏ qua dòng này
        }

        // Kiểm tra lựa chọn
        const mcMatch = trimmedLine.match(mcOptionRegex);
        if (mcMatch) {
            questionType = 'MC';
            options.push({ label: mcMatch[1], content: mcMatch[2].trim() });
            return;
        }

        const tableTfMatch = trimmedLine.match(tableTfOptionRegex);
        if (tableTfMatch) {
            questionType = 'TABLE_TF';
            options.push({ label: tableTfMatch[1], content: tableTfMatch[2].trim() });
            return;
        }

        // Nếu không phải chỉ thị hay lựa chọn, nó là một phần của câu hỏi
        statement += line + '\n';
    });

    statement = statement.trim();

    // Xác định loại câu hỏi cuối cùng
    if (!questionType) {
        if (statement) {
            questionType = 'NUMERIC';
        } else {
            return null;
        }
    }

    return {
        statement: statement,
        options: options,
        solution: solution,
        layout: layoutHint,
        type: questionType,
        shouldShuffleOptions: shouldShuffleOptions
    };
}
function renderNewMCOptions(parsedQuestion, questionIndex) {
    let optionsHTML = `<div class="mc-options mc-layout-${parsedQuestion.layout}" data-question-index="${questionIndex}">`;
    parsedQuestion.options.forEach(opt => {
        optionsHTML += `
            <div 
                class="mc-option" 
                data-value="${opt.label}"
                onclick="selectMCOption(this, ${questionIndex})">
                <span class="mc-option-label">${opt.label}</span>
                <span class="mc-option-content">${opt.content}</span>
            </div>
        `;
    });
    optionsHTML += `</div>`;
    return optionsHTML;
}


function selectMCOption(selectedElement, questionIndex) {
    const optionsContainer = document.querySelector(`.mc-options[data-question-index="${questionIndex}"]`);
    if (!optionsContainer) return;
    optionsContainer.querySelectorAll('.mc-option').forEach(el => el.classList.remove('selected'));
    selectedElement.classList.add('selected');
}

function renderNewMCResult(parsedQuestion, resultForQ) {
    let optionsHTML = '<div class="mc-options mc-layout-' + parsedQuestion.layout + '">';
    parsedQuestion.options.forEach(opt => {
        let optionClasses = "mc-option";
        if (resultForQ.userAnswer === opt.label) {
            optionClasses += ' selected';
            if (resultForQ.userAnswer !== resultForQ.correctAnswer) {
                optionClasses += ' incorrect-answer-highlight';
            }
        }
        if (resultForQ.correctAnswer === opt.label) {
            optionClasses += ' correct-answer-highlight';
        }
        optionsHTML += `<div class="${optionClasses}"><span class="mc-option-label">${opt.label}</span><span class="mc-option-content">${opt.content}</span></div>`;
    });
    optionsHTML += '</div>';
    return optionsHTML;
}