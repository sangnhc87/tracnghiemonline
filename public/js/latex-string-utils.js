// File: js/latex-string-utils.js (ĐÃ CẬP NHẬT: ITEMIZE/ENUMERATE, BREAK LINE)

/**
 * Xử lý các thay thế chuỗi cụ thể trong nội dung LaTeX
 * để chuẩn bị cho việc hiển thị hoặc các mục đích khác.
 */
const LatexStringUtils = {

    /**
     * Chuyển đổi lệnh \vec thành \overrightarrow.
     * @param {string} text - Chuỗi cần xử lý.
     * @returns {string} Chuỗi đã thay thế.
     */
    replaceVecToOverrightarrow: function(text) {
        if (!text) return text;
        return text.replace(/(?:\\vec)\s*(\{[\s\S]*?\})/g, '\\overrightarrow$1');
    },

    /**
     * Chuyển đổi lệnh \textbf{...} thành thẻ HTML <strong>...</strong>.
     * @param {string} text - Chuỗi cần xử lý.
     * @returns {string} Chuỗi đã thay thế.
     */
    replaceTextbfToStrong: function(text) {
        if (!text) return text;
        return text.replace(/(?:\\textbf)\s*(\{([\s\S]*?)\})/g, (match, fullBraceContent, innerContent) => {
            return `<strong>${innerContent.trim()}</strong>`;
        });
    },

    /**
     * Hàm xử lý định dạng số trong chuỗi keys (ví dụ: chuyển 73{,}4 thành 73.4)
     * @param {string} keyString - Chuỗi keys cần xử lý.
     * @returns {string} Chuỗi keys đã xử lý.
     */
    processKeyNumericFormat: function(keyString) {
        if (!keyString) return '';
        let processed = keyString.replace(/\{\s*,\s*\}/g, ''); 
        processed = processed.replace(/\\,/g, ''); 
        processed = processed.replace(/,/g, '.'); 
        return processed;
    },

    /**
     * Xóa môi trường \begin{center}...\end{center} và giữ lại nội dung.
     * @param {string} text - Chuỗi cần xử lý.
     * @returns {string} Chuỗi đã thay thế.
     */
    removeCenterEnvironment: function(text) {
        if (!text) return text;
        return text.replace(/\\begin\{center\}([\s\S]*?)\\end\{center\}/gi, '$1');
    },

    /**
     * Xóa môi trường \begin{tikz}...\end{tikz} và thay thế bằng "HÌNH Ở ĐÂY".
     * @param {string} text - Chuỗi cần xử lý.
     * @returns {string} Chuỗi đã thay thế.
     */
    replaceTikzEnvironment: function(text) {
        if (!text) return text;
        return text.replace(/\\begin\{tikzpicture\}([\s\S]*?)\\end\{tikzpicture\}/gi, '<span style="color:red;">HÌNH Ở ĐÂY</span>');
    },

    /**
     * Chuyển đổi môi trường \begin{tabular}{...}...\end{tabular} sang HTML <table>...</table>.
     * (Chỉ là chuyển đổi cơ bản, không xử lý đầy đủ tất cả tùy chọn phức tạp của tabular).
     * @param {string} text - Chuỗi cần xử lý.
     * @returns {string} Chuỗi HTML table.
     */
    replaceTabularToHtmlTable: function(text) {
        if (!text) return text;

        return text.replace(/\\begin\{tabular\}\s*(\{.*?\}\s*)?([\s\S]*?)\\end\{tabular\}/gi, (match, alignmentSpec, tableContent) => {
            let htmlTable = '<table>';
            const rows = tableContent.split('\\\\').map(row => row.trim()).filter(row => row !== '');

            rows.forEach(row => {
                row = row.replace(/\\hline/g, '').trim(); // Loại bỏ \hline
                const cols = row.split('&').map(col => col.trim());
                
                htmlTable += '<tr>';
                cols.forEach(col => {
                    col = col.replace(/\\centering|\\raggedright|\\raggedleft/g, '').trim();
                    // Gọi lại applyCommonLatexReplacements để xử lý các lệnh khác trong ô
                    col = LatexStringUtils.applyCommonLatexReplacements(col); 
                    htmlTable += `<td>${col}</td>`;
                });
                htmlTable += '</tr>';
            });

            htmlTable += '</table>';
            return htmlTable;
        });
    },

    /**
     * Chuyển đổi môi trường \begin{itemize}/\begin{enumerate} thành HTML <ul>/<ol>.
     * Xử lý cả các môi trường lồng nhau.
     * @param {string} text - Chuỗi cần xử lý.
     * @returns {string} Chuỗi HTML list.
     */
    replaceListEnvironments: function(text) {
        if (!text) return text;

        // Hàm đệ quy để xử lý các danh sách lồng nhau
        const processList = (listText) => {
            // Khớp với môi trường itemize hoặc enumerate
            return listText.replace(/\\begin\{(itemize|enumerate)\}([\s\S]*?)\\end\{(itemize|enumerate)\}/gi, (match, listType, listContent) => {
                const htmlListTag = (listType.toLowerCase() === 'itemize') ? 'ul' : 'ol';
                let htmlListContent = '';

                // Tách từng \item
                const items = listContent.split('\\item').slice(1); // slice(1) để bỏ phần trước \item đầu tiên
                items.forEach(item => {
                    item = item.trim();
                    if (item === '') return;

                    // Xử lý các danh sách lồng nhau bên trong mỗi item
                    item = processList(item); // Gọi đệ quy

                    // Áp dụng các thay thế chung cho nội dung item
                    item = LatexStringUtils.applyCommonLatexReplacementsWithoutListProcessing(item); 

                    htmlListContent += `<li>${item}</li>`;
                });

                return `<${htmlListTag}>${htmlListContent}</${htmlListTag}>`;
            });
        };

        // Gọi hàm đệ quy ban đầu
        return processList(text);
    },

    /**
     * Thay thế '\\' bằng '<br>' nhưng không trong môi trường toán học ($...$ hoặc $$...$$).
     * @param {string} text - Chuỗi cần xử lý.
     * @returns {string} Chuỗi đã thay thế.
     */
    replaceDoubleBackslashToBrGGG: function(text) {
        if (!text) return text;

        // Sử dụng một hàm thay thế để xử lý các đoạn text bên ngoài môi trường toán học.
        // Regex: Tìm các khối toán học $...$ hoặc $$...$$
        // hoặc tìm các đoạn text bên ngoài toán học.
        // \\s*?        - bất kỳ khoảng trắng nào (non-greedy)
        // (\$\$[\s\S]*?\$\$) - Group 1: Khớp $$...$$
        // (\$[\s\S]*?\$)    - Group 2: Khớp $...$
        // ([\s\S]*?)       - Group 3: Khớp bất kỳ văn bản nào không phải toán học (non-greedy)
        const mathAndTextRegex = /(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)|\B(\\\\)\B|([\s\S])/g;
        
        // The regex `\B(\\\\)\B` aims to match `\\` only when it's not at a word boundary,
        // which helps avoid matching `\\` within math mode (where it's usually `\\[...]`)
        // However, a more robust way is to split the string into math/non-math blocks.

        let result = '';
        let lastIndex = 0;

        // Chia chuỗi thành các phần toán học và không phải toán học
        // Regex: match `$$...$$` OR `$..$` OR `\\(`..`\\)` OR `\\[`..`\\]`
        const fullMathBlockRegex = /(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$\\|\\[[\s\S]*?\\]|\\\([\s\S]*?\\\))/g;
        let match;
        
        while ((match = fullMathBlockRegex.exec(text)) !== null) {
            // Phần văn bản trước khối toán học hiện tại
            let nonMathPart = text.substring(lastIndex, match.index);
            // Thay thế \\ bằng <br> trong phần không phải toán học này
            nonMathPart = nonMathPart.replace(/\\\\/g, '<br>');
            result += nonMathPart;
            
            // Thêm khối toán học nguyên vẹn
            result += match[0];
            lastIndex = fullMathBlockRegex.lastIndex;
        }

        // Xử lý phần văn bản còn lại sau khối toán học cuối cùng
        let remainingNonMathPart = text.substring(lastIndex);
        remainingNonMathPart = remainingNonMathPart.replace(/\\\\/g, '<br>');
        result += remainingNonMathPart;

        return result;
    },
// File: js/latex-string-utils.js

// ... (Các hàm khác giữ nguyên) ...

    /**
     * Thay thế '\\' bằng '<br>' nhưng KHÔNG can thiệp vào bên trong MỌI môi trường toán học
     * ($...$, $$...$$, \(...\), \[...\]). Đây là phiên bản đã sửa lỗi và hoạt động ổn định.
     * @param {string} text - Chuỗi cần xử lý.
     * @returns {string} Chuỗi đã thay thế.
     */
    replaceDoubleBackslashToBr: function(text) {
        if (!text) return text;
        const mathBlocksRegex = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$[\s\S]*?\$|\\\([\s\S]*?\\\))/g;
        const parts = text.split(mathBlocksRegex);
        const processedParts = parts.map((part, index) => {
            // Nếu `part` không tồn tại (thường là do split), trả về chuỗi rỗng
            if (!part) {
                return '';
            }
            if (index % 2 === 0) {
                // Đây là phần VĂN BẢN, ta có thể an toàn thay thế `\\` bằng `<br>`.
                return part.replace(/\\\\/g, '<br>');
            } else {
                // Đây là phần TOÁN HỌC, ta phải GIỮ NGUYÊN nó.
                return part;
            }
        });
        return processedParts.join('');
    },
    /**
     * Áp dụng tất cả các hàm thay thế LaTeX chung.
     * @param {string} text - Chuỗi cần xử lý.
     * @returns {string} Chuỗi đã được xử lý.
     */
    applyCommonLatexReplacements: function(text) {
        if (!text) return text;
        let processedText = text;
        processedText = this.replaceListEnvironments(processedText); // Xử lý list trước
        processedText = this.replaceDoubleBackslashToBr(processedText); // Xử lý xuống dòng
        processedText = this.replaceVecToOverrightarrow(processedText);
        processedText = this.replaceTextbfToStrong(processedText);
        processedText = this.removeCenterEnvironment(processedText); 
        processedText = this.replaceTikzEnvironment(processedText); 
        processedText = this.replaceTabularToHtmlTable(processedText); 
        // Các thay thế khác có thể được thêm ở đây
        return processedText;
    },

    /**
     * Hàm hỗ trợ cho replaceListEnvironments để tránh vòng lặp vô hạn khi gọi applyCommonLatexReplacements
     * bên trong, bằng cách loại trừ việc xử lý list/line break lại lần nữa.
     * @param {string} text - Chuỗi cần xử lý.
     * @returns {string} Chuỗi đã được xử lý.
     */
    applyCommonLatexReplacementsWithoutListProcessing: function(text) {
        if (!text) return text;
        let processedText = text;
        // Không gọi this.replaceListEnvironments(processedText); ở đây
        // Không gọi this.replaceDoubleBackslashToBr(processedText); ở đây
        processedText = this.replaceVecToOverrightarrow(processedText);
        processedText = this.replaceTextbfToStrong(processedText);
        processedText = this.removeCenterEnvironment(processedText); 
        processedText = this.replaceTikzEnvironment(processedText); 
        processedText = this.replaceTabularToHtmlTable(processedText); 
        return processedText;
    }
};