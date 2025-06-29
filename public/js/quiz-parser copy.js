
function parseMCQuestion(questionBlock) {
    if (typeof questionBlock !== 'string' || !questionBlock.trim()) {
        return null;
    }

    const lines = questionBlock.trim().split('\n');
    let statement = '';
    const options = [];
    let solution = '';
    let inSolutionBlock = false;
    let layoutHint = '2x2';
    let questionType = null; // Sẽ là 'MC', 'TABLE_TF', hoặc 'NUMERIC'

    const mcOptionRegex = /^([A-D])\.\s*(.*)/;
    const tableTfOptionRegex = /^([a-d])\)\s*(.*)/;
    const layoutRegex = /^(##(1x4|2x2|4x1))$/i;

    // Loại bỏ lời giải trước khi phân tích statement và options
    const loigiaiRegex = /\\begin\{loigiai\}([\s\S]*?)\\end\{loigiai\}/i;
    const matchExplanation = questionBlock.match(loigiaiRegex);
    if (matchExplanation) {
        solution = matchExplanation[1].trim();
        questionBlock = questionBlock.replace(loigiaiRegex, '').trim(); // Cập nhật questionBlock sau khi tách lời giải
    }

    // Tái phân tích lines từ questionBlock đã loại bỏ lời giải
    const processedLines = questionBlock.split('\n');

    processedLines.forEach(line => {
        const trimmedLine = line.trim();

        if (layoutRegex.test(trimmedLine)) {
            layoutHint = trimmedLine.substring(2).toLowerCase(); return;
        }

        const mcMatch = trimmedLine.match(mcOptionRegex);
        const tableTfMatch = trimmedLine.match(tableTfOptionRegex);

        if (mcMatch) {
            // Nếu đã tìm thấy loại câu hỏi khác và nó không phải MC, thì có lỗi định dạng
            if (questionType && questionType !== 'MC') {
                 console.warn("Mixed question types detected. Falling back to null for:", questionBlock);
                 return null; // Hoặc xử lý lỗi khác
            }
            questionType = 'MC';
            options.push({ label: mcMatch[1], content: mcMatch[2].trim() });
        } else if (tableTfMatch) {
            // Nếu đã tìm thấy loại câu hỏi khác và nó không phải TABLE_TF, thì có lỗi định dạng
            if (questionType && questionType !== 'TABLE_TF') {
                console.warn("Mixed question types detected. Falling back to null for:", questionBlock);
                return null; // Hoặc xử lý lỗi khác
            }
            questionType = 'TABLE_TF';
            options.push({ label: tableTfMatch[1], content: tableTfMatch[2].trim() });
        } else {
            // Nếu không phải layout, không phải option, thì là một phần của statement
            statement += line + '\n';
        }
    });

    statement = statement.trim(); // Trim statement cuối cùng

    // Xác định loại câu hỏi nếu chưa rõ
    if (!questionType) {
        // Nếu không có options dạng A. B. C. D. hay a) b) c) d) nhưng có statement,
        // thì giả định đây là câu hỏi điền số (Numeric).
        if (statement) {
            questionType = 'NUMERIC';
        } else {
            // Không có statement và không có options dạng đã biết => không phân tích được
            return null;
        }
    }

    // Bọc "Câu N." bằng span cho đẹp
    const qNumRegex = /^(Câu\s*\d+\s*[:.]?\s*)/i;
    const qNumMatch = statement.match(qNumRegex);
    if (qNumMatch) {
        const matchedPart = qNumMatch[0];
        statement = statement.replace(qNumRegex, `<span class="statement-q-num">${matchedPart}</span>`);
    }

    return {
        statement: statement,
        options: options, // Có thể rỗng nếu là NUMERIC
        solution: solution,
        layout: layoutHint,
        type: questionType
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