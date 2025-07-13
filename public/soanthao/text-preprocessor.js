
const TextPreprocessor = (function() {
        
    function processTabular(text) {
        return text;
    const tabularRegex = /\\begin\{tabular\}(\{[^}]*\})?([\s\S]*?)\\end\{tabular\}/g;

    return text.replace(tabularRegex, (match, alignment, content) => {
        let html = '<table border="1" style="border-collapse: collapse; margin: auto;">\n';
        content = content.replace(/\\hline/g, '');

        const rows = content.split(/\\\\/); // ← KHÔNG dùng <br> ở đây!

        for (let rawRow of rows) {
            let row = rawRow.trim();
            if (!row) continue;
            html += '  <tr>';
            const cells = row.split(/&/);
            for (let cell of cells) {
                html += `<td style="text-align: center; padding: 4px;">${cell.trim()}</td>`;
            }
            html += '</tr>\n';
        }

        html += '</table>';
        return html;
    });
}

    function findMatchingBrace(str, startPos) {
        let depth = 1;
        for (let i = startPos; i < str.length; i++) {
            if (str[i] === '{') depth++;
            else if (str[i] === '}') {
                depth--;
                if (depth === 0) return i;
            }
        }
        return -1;
    }
    /**
     * Chuyển \immini{...}{...} thành:
     * nội dung\n\tikzpicture
     * Hỗ trợ dấu {} lồng nhau.
     */
    function processImminiToPlain(text) {
        const imminiRegex = /\\immini(?:\s*\[[^\]]*?\])?/g;
        let result = "";
        let lastIndex = 0;
        let match;

        while ((match = imminiRegex.exec(text)) !== null) {
            const startIndex = match.index;

            // Tìm { của block 1
            const brace1Start = text.indexOf('{', imminiRegex.lastIndex);
            if (brace1Start === -1) break;

            const brace1End = findMatchingBrace(text, brace1Start + 1);
            if (brace1End === -1) break;

            // Tìm { của block 2
            const brace2Start = text.indexOf('{', brace1End + 1);
            if (brace2Start === -1) break;

            const brace2End = findMatchingBrace(text, brace2Start + 1);
            if (brace2End === -1) break;

            // Nội dung
            const content1 = text.slice(brace1Start + 1, brace1End).trim();
            const content2 = text.slice(brace2Start + 1, brace2End).trim();

            // Ghép vào kết quả
            result += text.slice(lastIndex, startIndex);
            result += `${content1}\n${content2}`;

            lastIndex = brace2End + 1;
            imminiRegex.lastIndex = lastIndex;
        }

        result += text.slice(lastIndex);
        return result;
    }

    /**
     * Hàm xử lý chính, nhận văn bản và bộ quy tắc.
     * @param {string} text - Văn bản LaTeX đầu vào.
     * @param {object} rules - Đối tượng chứa các quy tắc thay thế.
     * @returns {string} - Văn bản đã được xử lý.
     */
    function _process(text, rules) {
        if (!rules) {
            console.warn("Text Preprocessor: Không có quy tắc nào được cung cấp.");
            return text;
        }
        
        // let processedText = text;
        let processedText = text;

// Xử lý \immini{...}{...}
processedText = processImminiToPlain(processedText);
// Xử lý tabular thành HTML
processedText = processTabular(processedText);

        // BƯỚC 1: Xử lý các thay thế đơn giản (Simple Replacements)
        // Đây là nơi `[thm]` và `eqnarray*` của bạn được xử lý.
        if (rules.simpleReplacements) {
            for (const [find, replace] of Object.entries(rules.simpleReplacements)) {
                // Phải thoát các ký tự đặc biệt trong 'find' để tạo regex
                const escapedFind = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                processedText = processedText.replace(new RegExp(escapedFind, 'g'), replace);
            }
        }
        
        // BƯỚC 2: Xử lý các lệnh có tham số (Command Replacements)
        if (rules.commandReplacements) {
            for (const [command, config] of Object.entries(rules.commandReplacements)) {
                const { start: startTag, end: endTag } = config;
                const commandRegex = new RegExp(`\\\\${command}\\s*\\{`, 'g');
                
                let tempResult = "";
                let lastIndex = 0;
                let match;

                // Thao tác trên một bản sao để tránh lỗi
                const currentText = processedText; 
                
                while ((match = commandRegex.exec(currentText)) !== null) {
                    const openBraceIndex = commandRegex.lastIndex;
                    const closeBraceIndex = findMatchingBrace(currentText, openBraceIndex);
                    
                    if (closeBraceIndex !== -1) {
                        tempResult += currentText.substring(lastIndex, match.index);
                        const content = currentText.substring(openBraceIndex, closeBraceIndex);
                        tempResult += `${startTag}${content}${endTag}`;
                        lastIndex = closeBraceIndex + 1;
                        commandRegex.lastIndex = lastIndex;
                    } else {
                        commandRegex.lastIndex = openBraceIndex;
                    }
                }
                tempResult += currentText.substring(lastIndex);
                processedText = tempResult; // Cập nhật kết quả sau khi vòng lặp hoàn tất
            }
        }

        // BƯỚC 3: Xử lý các thay thế bằng Regex (Regex Replacements)
        // Đây là bước quan trọng cần phải hoạt động.
        if (rules.regexReplacements) {
            for (const rule of rules.regexReplacements) {
                try {
                    const regex = new RegExp(rule.find, rule.flags || 'g');
                    processedText = processedText.replace(regex, rule.replace);
                } catch (e) {
                    console.error(`Lỗi Regex trong file replace.json: `, rule.find, e);
                }
            }
        }
        
        // Lưu ý: environmentReplacements và tabular đã được loại bỏ theo yêu cầu của bạn.

        return processedText;
    }

    return {
        process: _process
    };

})();