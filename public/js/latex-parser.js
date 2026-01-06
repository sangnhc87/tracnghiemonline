// File: latex-parser.js (ĐÃ SỬA LỖI RENDER)

/**
 * Hàm hỗ trợ để tìm nội dung của một khối lệnh LaTeX có cặp ngoặc nhọn cân bằng.
 * (Không đổi)
 */
function extractBalancedBraceContent(text, commandName) {
    const regex = new RegExp(`\\\\${commandName}\\s*(\{)`);
    if (!text.match(regex)) return null;

    const match = text.match(regex);
    const commandStart = match.index;
    const braceStartIndex = commandStart + match[0].length - 1;
    let balance = 1;
    let contentEndIndex = -1;

    for (let i = braceStartIndex + 1; i < text.length; i++) {
        if (text[i] === '{') balance++;
        else if (text[i] === '}') balance--;
        if (balance === 0) {
            contentEndIndex = i;
            break;
        }
    }
    if (contentEndIndex !== -1) {
        return {
            content: text.substring(braceStartIndex + 1, contentEndIndex).trim(),
            fullMatch: text.substring(commandStart, contentEndIndex + 1),
        };
    }
    throw new Error(`Dấu ngoặc '{' của lệnh \\${commandName} không được đóng.`);
}

/**
 * Hàm hỗ trợ để tìm tất cả các cặp ngoặc nhọn độc lập.
 * (Không đổi)
 */
function extractCurlyBraceContents(text) {
    let contents = [];
    let balance = 0;
    let currentBlockStart = -1;
    text = text.trim();

    for (let i = 0; i < text.length; i++) {
        let char = text[i];
        if (char === '{') {
            if (balance === 0) currentBlockStart = i + 1;
            balance++;
        } else if (char === '}') {
            if (balance === 0) throw new Error(`Dấu '}' thừa tại vị trí ${i}.`);
            balance--;
            if (balance === 0) {
                contents.push(text.substring(currentBlockStart, i));
                currentBlockStart = -1;
            }
        } else if (balance === 0 && char.trim() !== '') {
            if (['$', '&', '\\'].includes(char)) continue;
            throw new Error(`Ký tự '${char}' không hợp lệ ngoài dấu ngoặc tại vị trí ${i}.`);
        }
    }
    if (balance !== 0) throw new Error("Dấu ngoặc '{' không khớp.");
    return contents;
}

function replaceDoubleBackslashExceptInAligned(text) {
    const placeholders = [];
    let counter = 0;

    // Regex nhận dạng nhiều môi trường toán
    const mathEnvs = ['aligned', 'align', 'array', 'cases', 'bmatrix'];
    const envPattern = mathEnvs.join('|');

    const regex = new RegExp(
        `\\\\begin\\{(${envPattern})\\}([\\s\\S]*?)\\\\end\\{\\1\\}`,
        'g'
    );

    // Thay thế từng khối môi trường bằng placeholder
    text = text.replace(regex, (match) => {
        const key = `__MATHENV_BLOCK_${counter}__`;
        placeholders.push({ key, value: match });
        counter++;
        return key;
    });

    // Thay \\ thành <br> trong phần còn lại
    text = text.replace(/\\\\/g, '<br>');

    // Khôi phục các khối môi trường
    placeholders.forEach(({ key, value }) => {
        text = text.replace(key, value);
    });

    return text;
}


/**
 * Chuyển đổi một khối câu hỏi từ định dạng \begin{ex} sang HTML.
 * *** PHIÊN BẢN SỬA LỖI TRIỆT ĐỂ ***
 */
function parseSingleExBlockToHtml(exBlock, questionNumber) {
    const mainContentMatch = exBlock.match(/\\begin{ex}([\s\S]*?)\\end{ex}/i);
    if (!mainContentMatch) return '';

    let content = mainContentMatch[1].trim();
    let questionBody = '';
    let choicesArray = [];
    let solutionContent = '';
    let syntaxError = null; // Biến để lưu trữ lỗi cú pháp nếu có

    // --- 1. Tách lời giải ---
    try {
        const loigiaiResult = extractBalancedBraceContent(content, 'loigiai');
        if (loigiaiResult) {
            // solutionContent = loigiaiResult.content.replace(/\\\\/g, '<br>');
            solutionContent = replaceDoubleBackslashExceptInAligned(loigiaiResult.content);
            content = content.replace(loigiaiResult.fullMatch, '').trim();
        }
    } catch (error) {
        syntaxError = `Lỗi cú pháp \\loigiai: ${error.message}`;
    }

    // --- 2. Tách câu hỏi và đáp án ---
    const choiceMatch = content.match(/\\choice/i);
    if (choiceMatch) {
        questionBody = content.substring(0, choiceMatch.index).trim();
        let choicesText = content.substring(choiceMatch.index + '\\choice'.length).trim();
        try {
            // Chỉ thực hiện nếu chưa có lỗi từ trước
            if (!syntaxError) {
                choicesArray = extractCurlyBraceContents(choicesText);
            }
        } catch (error) {
            syntaxError = `Lỗi cú pháp đáp án: ${error.message}`;
        }
    } else {
        // Nếu không có \choice, toàn bộ là nội dung câu hỏi
        questionBody = content;
    }
    
    // --- 3. Dựng HTML ---
    let html = '<div class="question-block">';
    
    // Luôn hiển thị đề bài
    html += `<p class="question-title"><strong>Câu ${questionNumber}.</strong> ${questionBody}</p>`;
    
    // Hiển thị lỗi nếu có
    if (syntaxError) {
        html += `<p class="error-text">${syntaxError}</p>`;
    } 
    // Nếu không có lỗi, hiển thị các lựa chọn
    else if (choicesArray.length > 0) {
        let optionsHtml = '<ul class="options-list">';
        let optionLetterCode = 65; // 'A'
        
        choicesArray.forEach(choice => {
            const isTrue = /\\True/.test(choice);
            const choiceText = choice.replace(/\\True/, '').trim();
            const optionLetter = String.fromCharCode(optionLetterCode++);
            optionsHtml += `<li class="${isTrue ? 'correct-answer' : ''}" data-option="${optionLetter}.">${choiceText}</li>`;
        });
        optionsHtml += '</ul>';
        html += optionsHtml;
    }

    // Luôn hiển thị lời giải nếu có
    if (solutionContent) {
        html += `<a href="#" class="solution-link">Lời giải</a><div class="solution-content">${solutionContent}</div>`;
    }

    html += '</div>';
    return html;
}


/**
 * Hàm chính để chuyển đổi toàn bộ nội dung LaTeX sang HTML để render.
 * (Không đổi)
 */
function convertLatexToHtml(rawContent) {
    if (typeof rawContent !== 'string' || !rawContent.trim()) {
        return { html: '<p>Chưa có nội dung.</p>', count: 0 };
    }

    let cleanedContent = rawContent.split('\n')
        .map(line => {
            const commentIndex = line.search(/(?<!\\)%/);
            return commentIndex !== -1 ? line.substring(0, commentIndex) : line;
        }).join('\n');

    const exBlockRegex = /(\\begin{ex}[\s\S]*?\\end{ex})/ig;
    const parts = cleanedContent.split(exBlockRegex);
    
    let finalHtml = '';
    let questionCount = 0;
    
    parts.forEach(part => {
        if (!part || part.trim() === '') return;
        if (part.trim().startsWith('\\begin{ex}')) {
            questionCount++;
            finalHtml += parseSingleExBlockToHtml(part, questionCount);
        }
    });

    return {
        html: finalHtml || '<p>Không tìm thấy khối `\\begin{ex}` nào.</p>',
        count: questionCount
    };
}