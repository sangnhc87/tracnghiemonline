// File: js/ex-converter.js (PHIÊN BẢN HOÀN THIỆN 100% - ĐÃ SỬA ĐIỂM CHOICE_TF & ĐÁNH DẤU SỬ DỤNG UTILS)

// Đảm bảo latex-string-utils.js được tải trước file này trong HTML!

/**
 * Hàm hỗ trợ để tìm tất cả các cặp ngoặc nhọn độc lập (non-overlapping) trong một chuỗi.
 * Chuỗi đầu vào dự kiến chỉ chứa các khối {content}{content}... và khoảng trắng, cùng với một số ký tự LaTeX thường gặp.
 * @param {string} text - Chuỗi cần phân tích, chỉ chứa các khối {content}{content}...
 * @returns {Array<string>} Mảng các nội dung bên trong cặp ngoặc nhọn.
 * @throws {Error} Nếu phát hiện lỗi ngoặc không khớp hoặc cú pháp không hợp lệ (ký tự không mong muốn giữa các ngoặc).
 */
function extractCurlyBraceContents(text) {
    let contents = [];
    let balance = 0; // Đếm số ngoặc mở trừ ngoặc đóng
    let currentBlockStart = -1; // Vị trí bắt đầu của khối nội dung hiện tại

    text = text.trim(); 

    for (let i = 0; i < text.length; i++) {
        let char = text[i];
        if (char === '{') {
            if (balance === 0) {
                currentBlockStart = i + 1;
            }
            balance++;
        } else if (char === '}') {
            balance--;
            if (balance === 0) {
                if (currentBlockStart === -1) {
                    throw new Error(`Dấu '}' bị thừa hoặc không khớp (ngoặc đóng trước ngoặc mở) tại vị trí ${i}.`);
                }
                contents.push(text.substring(currentBlockStart, i));
                currentBlockStart = -1; 
                
                // [CẢI TIẾN] Kiểm tra các ký tự nằm giữa các cặp ngoặc.
                // Cho phép khoảng trắng, dấu '{', '$', '&' hoặc '\' kế tiếp.
                if (i + 1 < text.length) {
                    let j = i + 1;
                    while (j < text.length) {
                        let charToCheck = text[j];
                        if (charToCheck === '{') {
                            break; // Tìm thấy ngoặc mở tiếp theo, hợp lệ.
                        }
                        // Cho phép khoảng trắng, các ký hiệu LaTeX phổ biến ($ & \) và dấu `[` và `]`.
                        if (/\s/.test(charToCheck) || charToCheck === '$' || charToCheck === '&' || charToCheck === '\\' || charToCheck === '[' || charToCheck === ']') {
                            j++; // Ký tự được cho phép, tiếp tục tìm.
                        } else {
                            // Gặp ký tự không hợp lệ sau dấu '}'
                            throw new Error(`Ký tự '${charToCheck}' không hợp lệ sau dấu '}' tại vị trí ${j}. Chỉ cho phép khoảng trắng, dấu '{', '$', '&', '\\', '[' hoặc ']' kế tiếp.`);
                        }
                    }
                    if (j < text.length && text[j] !== '{') {
                         throw new Error(`Cấu trúc ngoặc không hợp lệ. Mong đợi dấu '{' sau các ký tự được cho phép tại vị trí ${j}.`);
                    }
                }

            } else if (balance < 0) {
                throw new Error(`Dấu '}' bị thừa hoặc không khớp tại vị trí ${i}.`);
            }
        } else if (balance === 0 && char.trim() !== '') {
            if (currentBlockStart === -1) { 
                 throw new Error(`Ký tự '${char}' không hợp lệ nằm ngoài dấu ngoặc tại vị trí ${i}.`);
            }
        }
    }

    if (balance !== 0) {
        throw new Error(`Dấu ngoặc nhọn '{' không đóng hoặc bị thiếu. (Còn ${balance} ngoặc mở chưa đóng)`);
    }
    
    return contents;
}

/**
 * Hàm hỗ trợ để tìm nội dung của một khối lệnh LaTeX có cặp ngoặc nhọn cân bằng.
 * Ví dụ: \command{content {nested} here}
 * @param {string} text - Chuỗi cần phân tích.
 * @param {string} commandName - Tên lệnh LaTeX (ví dụ: "loigiai", "shortans", "core").
 * @returns {object|null} { content: string, fullMatch: string, startIndex: number, endIndex: number } nếu tìm thấy, ngược lại null.
 * @throws {Error} Nếu ngoặc không cân bằng cho lệnh đã cho.
 */
function extractBalancedBraceContent(text, commandName) {
    const regex = new RegExp(`\\\\${commandName}\\s*(?:[^{]*?)?(\{)([\\s\\S]*)`, 'i'); 
    const match = text.match(regex);

    if (!match) {
        return null;
    }

    const commandStart = match.index; 
    const braceStartIndex = commandStart + match[0].length - match[2].length -1; 

    let balance = 1; 
    let contentEndIndex = -1; 

    for (let i = braceStartIndex + 1; i < text.length; i++) {
        let char = text[i];
        if (char === '{') {
            balance++;
        } else if (char === '}') {
            balance--;
        }
        if (balance === 0) {
            contentEndIndex = i; 
            break;
        }
    }

    if (contentEndIndex !== -1) {
        const content = text.substring(braceStartIndex + 1, contentEndIndex);
        const fullMatch = text.substring(commandStart, contentEndIndex + 1);
        return {
            content: content.trim(),
            fullMatch: fullMatch,
            startIndex: commandStart,
            endIndex: contentEndIndex + 1
        };
    } else {
        throw new Error(`Dấu ngoặc nhọn '{' của lệnh \\${commandName} không đóng hoặc bị thiếu.`);
    }
}


/**
 * Chuyển đổi một khối câu hỏi từ định dạng \begin{ex} sang định dạng tiêu chuẩn.
 * Đồng thời trích xuất đáp án đúng (key) và điểm (core) cho câu hỏi này.
 * @param {string} exBlock - Khối văn bản bắt đầu bằng \begin{ex} và kết thúc bằng \end{ex}.
 * @param {number} questionNumber - Số thứ tự của câu hỏi.
 * @returns {object} { convertedText: string, key: string, core: string }
 *                   Trả về chuỗi lỗi trong convertedText nếu có lỗi cú pháp nội bộ.
 */
function convertSingleExBlock(exBlock, questionNumber) {
    exBlock = exBlock.replace(/\\begin\{bt\}/g, '\\begin{ex}').replace(/\\end\{bt\}/g, '\\end{ex}');

    const mainContentMatch = exBlock.match(/\\begin\{ex\}([\s\S]*?)\\end\{ex\}/i);
    if (!mainContentMatch) {
        return { convertedText: exBlock, key: '', core: '' }; 
    }
    let contentInsideEx = mainContentMatch[1]; 

    let statement = '';
    let choicesText = '';
    let loigiaiText = '';
    let isChoiceTF = false; 
    let extractedKey = ''; 
    let extractedCore = ''; 
    
    let choiceContents = []; 

    // --- Bước 1: Trích xuất các thành phần theo thứ tự ưu tiên và loại bỏ chúng khỏi contentInsideEx ---

    // 1. Tách \loigiai{}
    const loigiaiResult = extractBalancedBraceContent(contentInsideEx, 'loigiai');
    if (loigiaiResult) {
        loigiaiText = loigiaiResult.content;
        contentInsideEx = contentInsideEx.replace(loigiaiResult.fullMatch, ''); 
    }

    // 2. Tách \shortans{}
    const shortansResult = extractBalancedBraceContent(contentInsideEx, 'shortans');
    if (shortansResult) {
        extractedKey = shortansResult.content.replace(/^\$/,'').replace(/\$$/,'');
        contentInsideEx = contentInsideEx.replace(shortansResult.fullMatch, '');
    }

    // 3. Tách \core{}
    const coreResult = extractBalancedBraceContent(contentInsideEx, 'core');
    if (coreResult) {
        extractedCore = coreResult.content;
        contentInsideEx = contentInsideEx.replace(coreResult.fullMatch, '');
    }
    
    // 4. Tách \choice hoặc \choiceTF
    const choiceCommandRegex = /(\\choiceTF|\\choice)/i;
    const choiceCommandMatch = contentInsideEx.match(choiceCommandRegex);

    if (choiceCommandMatch) {
        const commandType = choiceCommandMatch[1].toLowerCase();
        isChoiceTF = (commandType === '\\choicetf');

        let rawChoicesAndRemaining = contentInsideEx.substring(choiceCommandMatch.index + choiceCommandMatch[0].length);

        let tempChoicesAccumulator = [];
        let tempBalance = 0;
        let tempCurrentBlockStart = -1;

        for (let i = 0; i < rawChoicesAndRemaining.length; i++) {
            let char = rawChoicesAndRemaining[i];
            
            if (char === '{') {
                if (tempBalance === 0) { 
                    tempCurrentBlockStart = i; 
                }
                tempBalance++;
            } else if (char === '}') {
                tempBalance--;
                if (tempBalance === 0) { 
                    if (tempCurrentBlockStart !== -1) {
                        tempChoicesAccumulator.push(rawChoicesAndRemaining.substring(tempCurrentBlockStart, i + 1));
                        tempCurrentBlockStart = -1; 
                    }
                    let j = i + 1;
                    while (j < rawChoicesAndRemaining.length) {
                        let nextChar = rawChoicesAndRemaining[j];
                        if (nextChar === '{') {
                            break; 
                        }
                        if (/\s/.test(nextChar) || nextChar === '$' || nextChar === '&' || nextChar === '\\' || nextChar === '[' || nextChar === ']') {
                            j++; 
                        } else {
                            i = rawChoicesAndRemaining.length; 
                            break;
                        }
                    }
                    if (j < rawChoicesAndRemaining.length && rawChoicesAndRemaining[j] !== '{') {
                        i = rawChoicesAndRemaining.length; 
                        break;
                    }
                    i = j - 1; 
                } else if (tempBalance < 0) {
                     i = rawChoicesAndRemaining.length; 
                     break;
                }
            } else if (tempBalance === 0) { 
                if (!/\s/.test(char) && char !== '$' && char !== '&' && char !== '\\' && char !== '[' && char !== ']') { 
                    break;
                }
            }
        }

        choicesText = tempChoicesAccumulator.join(' '); 
        
        if (choicesText.trim() !== '') {
            try {
                choiceContents = extractCurlyBraceContents(choicesText);
            }
            // Không catch lỗi ở đây để nó được ném ra ngoài và hàm gọi (convertExToStandardFormat) xử lý
            // catch (error) { throw new Error(`Lỗi cú pháp ngoặc nhọn trong khối \\choice (hoặc \\choiceTF) của Câu ${questionNumber}: ${error.message}`); }
            catch (error) {
                // Thay vì ném lại lỗi ngay lập tức, ta gắn thông báo lỗi vào convertedText
                // để hàm convertExToStandardFormat có thể bắt và hiển thị
                return { convertedText: `Lỗi chuyển đổi: ${error.message} (Câu ${questionNumber})`, key: '', core: '' };
            }
        }
        
        let endOfChoicesInRaw = rawChoicesAndRemaining.length; 
        if (tempChoicesAccumulator.length > 0) {
            const lastBlockContent = tempChoicesAccumulator[tempChoicesAccumulator.length - 1];
            const lastBlockIndex = rawChoicesAndRemaining.lastIndexOf(lastBlockContent);
            if (lastBlockIndex !== -1) {
                endOfChoicesInRaw = lastBlockIndex + lastBlockContent.length;
            }
        }
        
        contentInsideEx = contentInsideEx.substring(0, choiceCommandMatch.index) + 
                          rawChoicesAndRemaining.substring(endOfChoicesInRaw);
        contentInsideEx = contentInsideEx.trim();

    } // Kết thúc if (choiceCommandMatch)

    // Cuối cùng, phần còn lại của contentInsideEx chính là statement
    statement = contentInsideEx.trim(); 
    
    // [ĐÁNH DẤU SỬ DỤNG LATEX_STRING_UTILS]: applyCommonLatexReplacements cho statement
    if (typeof LatexStringUtils !== 'undefined' && LatexStringUtils.applyCommonLatexReplacements) {
        statement = LatexStringUtils.applyCommonLatexReplacements(statement);
    }


    // --- Bước 2: Xây dựng lại định dạng tiêu chuẩn ---
    let standardOutput = `Câu ${questionNumber}: ${statement}`;

    if (choicesText && choiceContents.length > 0) { 
        let trueAnswerLabels = []; 
        choiceContents.forEach((content, index) => {
            const label = isChoiceTF ? String.fromCharCode(97 + index) : String.fromCharCode(65 + index);
            const separator = isChoiceTF ? ')' : '.'; 

            let cleanContent = content.trim().replace(/[\n\r]+/g, ' '); 
            // [ĐÁNH DẤU SỬ DỤNG LATEX_STRING_UTILS]: applyCommonLatexReplacements cho nội dung lựa chọn
            if (typeof LatexStringUtils !== 'undefined' && LatexStringUtils.applyCommonLatexReplacements) {
                cleanContent = LatexStringUtils.applyCommonLatexReplacements(cleanContent);
            }

            const trueRegex = /\\True/i; 
            
            if (cleanContent.match(trueRegex)) {
                trueAnswerLabels.push(label);
            }
            const finalContent = cleanContent.replace(trueRegex, '').trim(); 
            
            standardOutput += `\n${label}${separator} ${finalContent}`;
        });

        if (trueAnswerLabels.length > 0) {
            if (isChoiceTF) { 
                extractedKey = choiceContents.map((_, idx) => trueAnswerLabels.includes(String.fromCharCode(97 + idx)) ? 'T' : 'F').join('');
            } else { 
                extractedKey = trueAnswerLabels.join(''); 
            }
        }
    }

    // === TÍNH TOÁN ĐIỂM TỰ ĐỘNG ===
    // Ưu tiên cao nhất là \core nếu được định nghĩa
    if (coreResult) { 
        // extractedCore đã được gán từ coreResult.content ở bước 3
    } else if (shortansResult) { 
        extractedCore = '0.5'; 
    } else if (choiceCommandMatch && choiceContents.length > 0) { 
        if (isChoiceTF) { 
            const numMende = choiceContents.length; 
            // [CẢI TIẾN LOGIC ĐIỂM CHO CHOICETF]: Điểm tổng cố định theo số mệnh đề
            if (numMende === 1) extractedCore = '0.1,0.25,0.5,1';
            else if (numMende === 2) extractedCore = '0.1,0.25,0.5,1'; 
            else if (numMende === 3) extractedCore = '0.1,0.25,0.5,1'; 
            else if (numMende === 4) extractedCore = '0.1,0.25,0.5,1'; 
            else extractedCore = '0.1'; // Mặc định 0.1 cho các trường hợp khác
        } else { // Là \choice (MC)
            extractedCore = '0.5'; 
        }
    } else { // Mặc định cuối cùng nếu không có shortans/choice/choiceTF
        extractedCore = '0.2'; 
    }

    // Thêm lời giải vào cuối định dạng chuẩn
    if (loigiaiText) {
        // [ĐÁNH DẤU SỬ DỤNG LATEX_STRING_UTILS]: applyCommonLatexReplacements cho lời giải
        if (typeof LatexStringUtils !== 'undefined' && LatexStringUtils.applyCommonLatexReplacements) {
            loigiaiText = LatexStringUtils.applyCommonLatexReplacements(loigiaiText);
        }
        standardOutput += `\n\\begin{loigiai}\n${loigiaiText}\n\\end{loigiai}`;
    }
    
    return { convertedText: standardOutput, key: extractedKey, core: extractedCore };
}


/**
 * Hàm chính để chuyển đổi toàn bộ nội dung đề thi từ textarea sang định dạng tiêu chuẩn.
 * Nó sẽ duyệt qua tất cả các khối \begin{ex} và các đoạn văn bản khác.
 * @param {string} rawContent - Toàn bộ nội dung từ textarea.
 * @returns {object} { compiledContent: string, keys: string, cores: string }
 *                    compiledContent là chuỗi đề đã chuyển đổi hoàn chỉnh.
 *                    keys và cores là các chuỗi tổng hợp (ví dụ: "A|B|TFFT").
 * @throws {Error} Nếu có lỗi cú pháp nghiêm trọng trong quá trình chuyển đổi.
 */
function convertExToStandardFormat(rawContent) {
    if (typeof rawContent !== 'string' || !rawContent.trim()) {
        return { compiledContent: '', keys: '', cores: '' };
    }

    let finalCompiledBlocks = [];
    let allExtractedKeys = [];
    let allExtractedCores = [];
    let currentQuestionNumber = 1;

    // [CẢI TIẾN QUAN TRỌNG] Xóa TẤT CẢ các comment LaTeX (%), kể cả comment nằm cuối dòng,
    // nhưng KHÔNG XÓA ký tự '\%'.
    let cleanedContent = rawContent.split('\n')
        .map(line => {
            const commentIndex = line.search(/(?<!\\)%/); 
            if (commentIndex !== -1) {
                return line.substring(0, commentIndex); 
            }
            return line; 
        })
        .filter(line => line.trim() !== '') 
        .join('\n');
    
    // [QUAN TRỌNG] Lọc và chỉ giữ lại các môi trường \begin{ex}...\end{ex} (hoặc \begin{bt}...)
    let filteredContent = '';
    const exBtBlockRegex = /(\\begin\{(?:ex|bt)\}[\s\S]*?\\end\{(?:ex|bt)\})/ig; 
    let match;
    let tempBlocks = []; 

    exBtBlockRegex.lastIndex = 0; 
    while ((match = exBtBlockRegex.exec(cleanedContent)) !== null) {
        tempBlocks.push(match[0]); 
    }
    
    filteredContent = tempBlocks.join('\n\n');
    
    if (filteredContent.trim() === '') {
        return { compiledContent: '', keys: '', cores: '' }; 
    }

    const partsRegex = /(\\begin\{(?:ex|bt)\}[\s\S]*?\\end\{(?:ex|bt)\})/ig;
    partsRegex.lastIndex = 0; 
    const parts = filteredContent.split(partsRegex);

    parts.forEach(part => {
        if (part && part.trim() === '') return;

        if (part && (part.trim().startsWith('\\begin{ex}') || part.trim().startsWith('\\begin{bt}'))) {
            const result = convertSingleExBlock(part, currentQuestionNumber);
            
            // [ĐẶC BIỆT] Xử lý lỗi từ convertSingleExBlock: nếu nó trả về đối tượng lỗi, ném lỗi thật sự
            if (result && typeof result.convertedText === 'string' && result.convertedText.startsWith('Lỗi chuyển đổi:')) {
                throw new Error(result.convertedText); 
            }

            finalCompiledBlocks.push(result.convertedText);
            allExtractedKeys.push(result.key);
            allExtractedCores.push(result.core);
            currentQuestionNumber++;
        }
    });

    let finalKeys = allExtractedKeys.join('|');
    // [ĐÁNH DẤU SỬ DỤNG LATEX_STRING_UTILS]: processKeyNumericFormat cho finalKeys
    if (typeof LatexStringUtils !== 'undefined' && LatexStringUtils.processKeyNumericFormat) {
        finalKeys = LatexStringUtils.processKeyNumericFormat(finalKeys); 
    }

    return {
        compiledContent: finalCompiledBlocks.join('\n\n'),
        keys: finalKeys, 
        cores: allExtractedCores.join('|')
    };
}