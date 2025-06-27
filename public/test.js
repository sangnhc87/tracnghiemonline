document.addEventListener('DOMContentLoaded', () => {
    const optionsInput = document.getElementById('optionsInput');
    const generateBtn = document.getElementById('generateBtn');
    const quizOptionsContainer = document.getElementById('quizOptionsContainer');
    const layoutControlButtons = document.querySelectorAll('.layout-controls button');
    
    // Nội dung mặc định cho textarea
    optionsInput.value = `A. $2x$
B. $x$
C. $x^2$
D. $2$

##2x2
A) Phương án A cho bố cục 2x2, có thể hơi dài một chút.
B) Phương án B cho bố cục 2x2.
C) Phương án C cho bố cục 2x2.
D) Phương án D cho bố cục 2x2.

##4x1
a. Phương án A rất rất rất dài, ép nó xuống 1 cột.
b. Phương án B cũng cực kỳ dài, để hiển thị trên 1 cột.
c. Phương án C này là ví dụ của nội dung rất dài.
d. Phương án D cũng có nội dung dài.

A. Phương án mặc định thứ hai 1
B. Phương án mặc định thứ hai 2
C. Phương án mặc định thứ hai 3
D. Phương án mặc định thứ hai 4`;

    // Biến để theo dõi lựa chọn bố cục hiện tại của người dùng (auto / 1x4 / 2x2 / 4x1)
    let currentGlobalLayoutSelection = 'auto'; // Mặc định là 'auto' (dựa vào input)

    // Hàm cập nhật trạng thái active của nút bố cục
    const updateActiveLayoutButton = (layout) => {
        layoutControlButtons.forEach(btn => {
            btn.classList.remove('active');
        });
        const activeButton = document.querySelector(`.layout-controls button[data-layout="${layout}"]`);
        if (activeButton) {
            activeButton.classList.add('active');
        } else {
            // Nếu không tìm thấy nút cụ thể (ví dụ: khi layout được tự động xác định là 1x4,2x2,4x1
            // nhưng global selection vẫn là 'auto'), active nút 'Tự động'
            document.querySelector('.layout-controls button[data-layout="auto"]').classList.add('active');
        }
    };

    // Hàm áp dụng bố cục vào container của một khối Flexbox
    const applyLayoutClass = (element, layout) => {
        element.classList.remove('flex-layout-1x4', 'flex-layout-2x2', 'flex-layout-4x1');
        element.classList.add(`flex-layout-${layout}`);
    };

    // Hàm phân tích input và render các khối phương án
    const generateOptions = () => {
        const allLines = optionsInput.value.split('\n');
        let parsedBlocks = [];
        let currentBlock = { layout: '1x4', options: [] }; // Khối hiện tại đang được xây dựng

        // Regex để nhận dạng các định dạng A. B. C. D. hoặc a) b) c) d) v.v.
        // ^([a-dA-D]): Bắt đầu bằng A, B, C, D hoặc a, b, c, d (ghi nhớ)
        // [\.\)]: Tiếp theo là dấu chấm (.) hoặc dấu đóng ngoặc đơn ) (không ghi nhớ)
        // \s*(.*): Khoảng trắng tùy chọn và phần còn lại là nội dung (ghi nhớ)
        // Dấu $ để match cuối dòng (nếu cần, nhưng không bắt buộc ở đây)
        const optionRegex = /^([a-dA-D])[\.\)]\s*(.*)/;
        const layoutRegex = /^(##(2x2|4x1))$/i; // ##2x2 hoặc ##4x1

        // Bước 1: Phân tách input thành các khối logic
        allLines.forEach((line) => {
            const trimmedLine = line.trim();

            if (trimmedLine === '') {
                // Nếu gặp dòng trống, kết thúc khối hiện tại và bắt đầu khối mới
                if (currentBlock.options.length > 0) {
                    parsedBlocks.push(currentBlock);
                }
                currentBlock = { layout: '1x4', options: [] }; // Bắt đầu khối mới với layout mặc định
            } else if (layoutRegex.test(trimmedLine)) {
                // Nếu gặp ký tự đặc biệt bố cục
                if (currentBlock.options.length > 0) {
                    parsedBlocks.push(currentBlock); // Đẩy khối cũ nếu có options
                }
                const detectedLayout = trimmedLine.substring(2).toLowerCase();
                currentBlock = { layout: detectedLayout, options: [] }; // Bắt đầu khối mới với layout này
            } else {
                // Đây là một dòng nội dung, cố gắng phân tích làm phương án
                const match = trimmedLine.match(optionRegex);
                if (match) {
                    const originalLabelChar = match[1].charAt(0); // Lấy ký tự gốc: 'A', 'a', 'B', 'b'
                    const processedLabelChar = originalLabelChar.toUpperCase(); // Dùng cho logic so sánh (A, B, C, D)
                    const content = (match[2] || '').trim(); // Đảm bảo content là chuỗi

                    // Chỉ lấy 4 phương án đầu tiên (A, B, C, D) cho mỗi khối
                    if (processedLabelChar === 'A' || processedLabelChar === 'B' || processedLabelChar === 'C' || processedLabelChar === 'D') {
                        // Nếu đây là phương án A và khối hiện tại đã có options (nghĩa là A này bắt đầu một nhóm mới),
                        // thì đẩy khối hiện tại vào parsedBlocks và tạo khối mới.
                        // Điều này xử lý trường hợp không có dòng trống/ký tự đặc biệt giữa các nhóm phương án
                        // mà chỉ có A. B. C. D. A. B. C. D.
                        // Thêm kiểm tra để đảm bảo chỉ tách khi phương án cuối cùng của block hiện tại là D
                        if (processedLabelChar === 'A' && currentBlock.options.length > 0 && 
                            currentBlock.options[currentBlock.options.length - 1].processedLabel === 'D') {
                                parsedBlocks.push(currentBlock);
                                currentBlock = { layout: '1x4', options: [] }; // Layout mặc định cho khối mới
                        }
                        // Chỉ thêm vào nếu chưa có đủ 4 phương án cho khối hiện tại
                        if (currentBlock.options.length < 4) {
                            currentBlock.options.push({ 
                                processedLabel: processedLabelChar, // Dùng cho logic nội bộ
                                originalLabel: originalLabelChar, // Dùng để hiển thị trong vòng tròn
                                content: content 
                            });
                        }
                    }
                } else {
                    // Nếu không phải layout specifier và không phải format phương án,
                    // và nếu có phương án cuối cùng, thì nối vào phương án đó (multiline option)
                    if (currentBlock.options.length > 0) {
                        // Đảm bảo thuộc tính 'content' tồn tại và là chuỗi trước khi nối
                        if (typeof currentBlock.options[currentBlock.options.length - 1].content !== 'string') {
                            currentBlock.options[currentBlock.options.length - 1].content = ''; // Khởi tạo nếu không phải chuỗi
                        }
                        currentBlock.options[currentBlock.options.length - 1].content += ' ' + trimmedLine;
                    }
                    // Nếu không có phương án nào trước đó, dòng này sẽ bị bỏ qua
                }
            }
        });

        // Đẩy khối cuối cùng nếu có options
        if (currentBlock.options.length > 0) {
            parsedBlocks.push(currentBlock);
        }

        // Bước 2: Render các khối phương án
        quizOptionsContainer.innerHTML = ''; // Xóa nội dung cũ
        if (parsedBlocks.length === 0) {
            quizOptionsContainer.innerHTML = '<p style="text-align: center; color: #888; padding: 20px;">Không tìm thấy phương án nào để hiển thị. Vui lòng nhập nội dung.</p>';
            updateActiveLayoutButton(currentGlobalLayoutSelection);
            return;
        }

        parsedBlocks.forEach((block) => {
            if (block.options.length === 0) return; // Bỏ qua các khối rỗng

            // Tạo div bao quanh cho mỗi khối phương án
            const blockContainer = document.createElement('div');
            blockContainer.classList.add('quiz-options-flex-block');

            const optionsFlexDiv = document.createElement('div');
            optionsFlexDiv.classList.add('quiz-options-flex');

            // Áp dụng bố cục dựa trên lựa chọn toàn cục của người dùng
            // Nếu người dùng chọn "Tự động", dùng layout từ input.
            // Nếu chọn cố định, dùng layout cố định đó.
            const finalLayout = (currentGlobalLayoutSelection === 'auto') ? block.layout : currentGlobalLayoutSelection;
            applyLayoutClass(optionsFlexDiv, finalLayout);

            // Tạo HTML cho các phương án trong khối này
            let optionsHtml = '';
            // Đảm bảo chỉ lấy 4 phương án từ A đến D
            const expectedLabels = ['A', 'B', 'C', 'D']; // Dùng để duyệt qua vị trí
            for(let i = 0; i < expectedLabels.length; i++) {
                // Tìm phương án tương ứng với processedLabel (A, B, C, D)
                const optionData = block.options.find(opt => opt.processedLabel === expectedLabels[i]);
                
                if (optionData) { // Kiểm tra xem phương án có tồn tại không
                    optionsHtml += `
                        <div class="option-item-flex">
                            <div class="option-label-box-flex">${optionData.originalLabel}</div>
                            <div class="option-content-flex">${optionData.content}</div>
                        </div>
                    `;
                } else {
                    // Nếu thiếu phương án (ví dụ: chỉ có A, B, C), có thể thêm ô trống hoặc bỏ qua
                    // Hiện tại, chúng ta chỉ hiển thị những cái có
                }
            }
            optionsFlexDiv.innerHTML = optionsHtml;
            blockContainer.appendChild(optionsFlexDiv);
            quizOptionsContainer.appendChild(blockContainer);
        });
        
        // Cập nhật nút active sau khi render tất cả các khối
        updateActiveLayoutButton(currentGlobalLayoutSelection);
    };

    // Gán sự kiện cho nút "Tạo Phương án"
    generateBtn.addEventListener('click', generateOptions);

    // Gán sự kiện cho các nút điều khiển bố cục
    layoutControlButtons.forEach(button => {
        button.addEventListener('click', () => {
            const selectedLayout = button.dataset.layout;
            currentGlobalLayoutSelection = selectedLayout; // Cập nhật lựa chọn toàn cục

            // Gọi lại generateOptions để render lại TẤT CẢ các khối với bố cục mới
            generateOptions(); 
        });
    });

    // Gọi hàm generateOptions lần đầu để hiển thị mặc định
    generateOptions();
});