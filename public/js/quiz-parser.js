
// File: public/js/quiz-parser.js (PHIÊN BẢN HOÀN CHỈNH TỐT NHẤT)

/**
 * Phân tích một khối văn bản thành một object câu hỏi có cấu trúc.
 * Hỗ trợ các loại: MC, TABLE_TF, NUMERIC.
 * Hỗ trợ các chỉ thị: ##2x2, ##1x4, ##4x1, ##no-shuffle.
 * Tự động tách lời giải và xử lý lựa chọn/mệnh đề đa dòng.
 *
 * @param {string} questionBlock - Khối văn bản chứa một câu hỏi duy nhất.
 * @returns {object|null} - Object câu hỏi hoặc null nếu không thể phân tích.
 */

function parseMCQuestion(questionBlock) {
    if (typeof questionBlock !== 'string' || !questionBlock.trim()) {
        return null;
    }

    // 1. Tách lời giải ra trước (quan trọng)
    let solution = '';
    const loigiaiRegex = /\\begin\{loigiai\}([\s\S]*?)\\end\{loigiai\}/i;
    const matchSolution = questionBlock.match(loigiaiRegex);
    if (matchSolution) {
        solution = matchSolution[1].trim();
        questionBlock = questionBlock.replace(loigiaiRegex, '').trim();
    }

    // 2. Khởi tạo
    const lines = questionBlock.trim().split('\n');
    let statementLines = [];
    const options = [];
    let questionType = null;
    let layoutHint = '2x2';
    let shouldShuffleOptions = true;

    // 3. Regex để nhận dạng
    const mcOptionRegex = /^\s*([A-D])\.\s+([\s\S]*)/;        // A. Nội dung
    const tableTfOptionRegex = /^\s*([a-h])\)\s+([\s\S]*)/;   // a) Nội dung
    const directiveRegex = /^##(1x4|2x2|4x1|no-shuffle)\s*$/i;

    // 4. Phân tích thông minh hơn để xử lý lựa chọn đa dòng
    let currentOption = null;

    for (const line of lines) {
        const trimmedLine = line.trim();
        
        const directiveMatch = trimmedLine.match(directiveRegex);
        if (directiveMatch) {
            const directive = directiveMatch[1].toLowerCase();
            if (directive === 'no-shuffle') {
                shouldShuffleOptions = false;
            } else {
                layoutHint = directive;
            }
            continue;
        }

        // Dùng `line` thay vì `trimmedLine` để giữ nguyên các thụt đầu dòng
        const mcMatch = line.match(mcOptionRegex);
        const tableTfMatch = line.match(tableTfOptionRegex);

        let isNewOption = false;
        if (mcMatch) {
            if (currentOption) options.push(currentOption); // Lưu lựa chọn cũ
            questionType = 'MC';
            currentOption = { label: mcMatch[1], content: mcMatch[2].trim() };
            isNewOption = true;
        } else if (tableTfMatch) {
            if (currentOption) options.push(currentOption); // Lưu lựa chọn cũ
            questionType = 'TABLE_TF';
            currentOption = { label: tableTfMatch[1], content: tableTfMatch[2].trim() };
            isNewOption = true;
        }

        if (!isNewOption) {
            if (currentOption) {
                // Nếu đang trong một lựa chọn, GỘP dòng này vào nội dung của nó
                currentOption.content += '\n' + line;
            } else {
                // Nếu không, nó thuộc về đề bài
                statementLines.push(line);
            }
        }
    }

    // Đừng quên lưu lựa chọn cuối cùng sau vòng lặp
    if (currentOption) {
        options.push(currentOption);
    }
    
    // Trim lại content của các option một lần cuối
    options.forEach(opt => opt.content = opt.content.trim());

    const statement = statementLines.join('\n').trim();

    // 5. Xác định loại câu hỏi cuối cùng
    if (!questionType) {
        if (statement) {
            questionType = 'NUMERIC';
        } else {
            console.warn("Could not parse question block (empty):", questionBlock);
            return null;
        }
    }
    
    return {
        statement,
        options,
        solution,
        layout: layoutHint,
        type: questionType,
        shouldShuffleOptions,
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