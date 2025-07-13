// File: public/js/main.js
// PHIÊN BẢN HÀM loadQuiz CUỐI CÙNG - SỬA LỖI HIỂN THỊ ##group-separator##

function loadQuiz(data) {
    const quizContainer = document.getElementById("quiz");
    quizContainer.innerHTML = "";
    let rawContent = data.content.trim();

    // 1. Chuẩn hóa dữ liệu đầu vào
    rawContent = rawContent.replace(/\n*(Câu\s*\d+[:.]?\s*)/g, '\n\n$1').trim();
    
    // 2. Xác định chế độ trộn
    const useGroupShuffle = rawContent.includes('##group-separator##');
    
    let questionsToRender = [];
    let originalIndexCounter = 0;

    // 3. Tách và xử lý các câu hỏi
    // Tách đề bài thành các nhóm dựa trên ##group-separator##
    // Regex này sẽ tách chuỗi và LOẠI BỎ luôn cả dấu phân cách và các dòng trống xung quanh nó.
    const questionGroupsRaw = rawContent.split(/\s*\n\s*##group-separator##\s*\n\s*/);

    questionGroupsRaw.forEach(groupRaw => {
        const trimmedGroup = groupRaw.trim();
        if (!trimmedGroup) return;

        let questionsInGroup = trimmedGroup.split(/\n\n(?=Câu\s*\d+[:.]?)/)
            .filter(Boolean)
            .map(block => ({ 
                originalIndex: originalIndexCounter++, 
                block: block.trim() 
            }));

        // Trộn câu hỏi trong nhóm nếu chế độ trộn nhóm được kích hoạt
        if (useGroupShuffle && questionsInGroup.length > 1) {
            questionsInGroup = shuffleArray(questionsInGroup);
        }
        
        questionsToRender.push(...questionsInGroup);
    });
    
    // 4. Render các câu hỏi ra giao diện (phần này không đổi)
    questionsToRender.forEach((questionData, newIndex) => {
        const questionDiv = document.createElement("div");
        questionDiv.className = "question";
        questionDiv.id = `question-${questionData.originalIndex}`;
        
        const parsedData = parseMCQuestion(questionData.block);

        if (parsedData) {
            // Render đề bài
            const statementDiv = document.createElement("div");
            statementDiv.className = "question-statement";
            let questionContent = parsedData.statement.replace(/^(Câu\s*\d+\s*[:.]?\s*)/i, '').trim();
            const newQuestionTitle = `<span class="question-number-highlight">Câu ${newIndex + 1}:</span>`;
            statementDiv.innerHTML = newQuestionTitle + " " + convertLineBreaks(processImagePlaceholders(questionContent));
            questionDiv.appendChild(statementDiv);

            // Render các lựa chọn
            let optionsToRender = parsedData.shouldShuffleOptions 
                ? shuffleArray(parsedData.options) 
                : parsedData.options;
            
            // ... (toàn bộ logic render cho MC, TABLE_TF, NUMERIC giữ nguyên y hệt) ...
             if (parsedData.type === 'MC') {
                const newDisplayLabels = ['A', 'B', 'C', 'D'];
                const optionsContainer = document.createElement('div');
                optionsContainer.className = `mc-options mc-layout-${parsedData.layout}`;

                optionsToRender.forEach((opt, index) => {
                    const optionDiv = document.createElement("div");
                    optionDiv.className = "mc-option";
                    optionDiv.dataset.value = opt.label;
                    const displayLabel = newDisplayLabels[index];
                    
                    optionDiv.innerHTML = `<span class="mc-option-label">${displayLabel}</span><span class="mc-option-content">${convertLineBreaks(processImagePlaceholders(opt.content))}</span>`;
                    optionDiv.onclick = () => { selectMCOption(optionDiv, questionData.originalIndex); saveProgress(); };
                    optionsContainer.appendChild(optionDiv);
                });
                questionDiv.appendChild(optionsContainer);
            } 
            else if (parsedData.type === 'TABLE_TF') {
                const newDisplayLabels = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
                const table = document.createElement('table');
                table.className = 'table-tf-container';
                table.innerHTML = `<thead><tr><th>Mệnh đề</th><th>Đúng</th><th>Sai</th></tr></thead>`;
                const tbody = document.createElement('tbody');
                
                optionsToRender.forEach((opt, index) => {
                    const groupName = `q${questionData.originalIndex}_sub${opt.label}`; 
                    const displayLabel = newDisplayLabels[index];
                    const row = document.createElement('tr');
                    row.innerHTML = `<td>${displayLabel}) ${convertLineBreaks(processImagePlaceholders(opt.content))}</td><td><label class="table-tf-radio"><input type="radio" name="${groupName}" value="T"></label></td><td><label class="table-tf-radio"><input type="radio" name="${groupName}" value="F"></label></td>`;
                    tbody.appendChild(row);
                });
                
                table.appendChild(tbody);
                questionDiv.appendChild(table);
                table.addEventListener('click', (e) => {
                    if (e.target.closest('.table-tf-radio')) {
                        const clickedLabel = e.target.closest('.table-tf-radio');
                        clickedLabel.closest('tr').querySelectorAll('.table-tf-radio').forEach(l => l.classList.remove('selected'));
                        clickedLabel.classList.add('selected');
                        clickedLabel.querySelector('input').checked = true;
                        saveProgress();
                    }
                });
            } 
            else if (parsedData.type === 'NUMERIC') {
                const numDiv = document.createElement("div");
                numDiv.className = "numeric-option";
                const input = document.createElement("input");
                input.type = "text";
                input.name = `q${questionData.originalIndex}`;
                input.placeholder = "Nhập đáp số";
                input.addEventListener('input', saveProgress);
                numDiv.appendChild(input);
                questionDiv.appendChild(numDiv);
            }

            // Render lời giải
            if (parsedData.solution && parsedData.solution.trim() !== '') {
                const toggleBtn = document.createElement("button");
                toggleBtn.className = "toggle-explanation btn";
                toggleBtn.textContent = "Xem lời giải";
                toggleBtn.style.display = 'none';
                const expDiv = document.createElement("div");
                expDiv.className = "explanation hidden";
                expDiv.innerHTML = convertLineBreaks(processImagePlaceholders(parsedData.solution));
                
                toggleBtn.onclick = () => {
                    expDiv.classList.toggle("hidden");
                    toggleBtn.textContent = expDiv.classList.contains("hidden") ? "Xem lời giải" : "Ẩn lời giải";
                };
                questionDiv.appendChild(toggleBtn);
                questionDiv.appendChild(expDiv);
            }
        }
        
        quizContainer.appendChild(questionDiv);
        renderKatexInElement(questionDiv);
    });

    // Hiển thị giao diện
    quizContainer.style.display = "block";
    document.getElementById("gradeBtn").style.display = "inline-flex";
    setTimeout(restoreProgress, 200);
}

function loadQuiz_NgauNhien(data) {
    const quizContainer = document.getElementById("quiz");
    quizContainer.innerHTML = "";
    let rawContent = data.content.trim();

    // 1. Chuẩn hóa và tách câu hỏi
    rawContent = rawContent.replace(/\n*(Câu\s*\d+[:.]?\s*)/g, '\n\n$1').trim();
    
    // 2. Tách thành các nhóm lớn
    const questionGroupsRaw = rawContent.split(/\n\s*##group-separator##\s*\n/);
    
    let questionsToRender = [];
    let originalIndexCounter = 0;

    // 3. Xử lý logic trộn theo nhóm hoặc mặc định
    questionGroupsRaw.forEach(groupRaw => {
        if (!groupRaw.trim()) return;

        let questionsInGroup = groupRaw.split(/\n\n(?=Câu\s*\d+[:.]?)/)
            .filter(Boolean)
            .map(block => ({ 
                originalIndex: originalIndexCounter++, 
                block: block.trim() 
            }));

        // Chỉ trộn thứ tự câu hỏi trong nhóm NẾU có nhiều hơn 1 câu
        if (questionsInGroup.length > 1) {
            questionsInGroup = shuffleArray(questionsInGroup);
        }
        
        questionsToRender.push(...questionsInGroup);
    });
    
    // 4. Render các câu hỏi ra giao diện
    questionsToRender.forEach((questionData, newIndex) => {
        const questionDiv = document.createElement("div");
        questionDiv.className = "question";
        questionDiv.id = `question-${questionData.originalIndex}`;
        
        const parsedData = parseMCQuestion(questionData.block);

        if (parsedData) {
            const statementDiv = document.createElement("div");
            statementDiv.className = "question-statement";
            let questionContent = parsedData.statement.replace(/^(Câu\s*\d+\s*[:.]?\s*)/i, '').trim();
            const newQuestionTitle = `<span class="question-number-highlight">Câu ${newIndex + 1}:</span>`;
            statementDiv.innerHTML = newQuestionTitle + " " + convertLineBreaks(processImagePlaceholders(questionContent));
            questionDiv.appendChild(statementDiv);

            // Logic trộn và render LỰA CHỌN (A,B,C,D và a,b,c,d)
            let optionsToRender = parsedData.shouldShuffleOptions 
                ? shuffleArray(parsedData.options) 
                : parsedData.options;
       
            // XỬ LÝ CHO CÂU TRẮC NGHIỆM (MC)
            if (parsedData.type === 'MC') {
                const optionsContainer = document.createElement('div');
                optionsContainer.className = `mc-options mc-layout-${parsedData.layout}`;
                optionsContainer.dataset.questionIndex = questionData.originalIndex;

                let optionsToRender = parsedData.shouldShuffleOptions ? shuffleArray(parsedData.options) : parsedData.options;
                const newDisplayLabels = ['A', 'B', 'C', 'D'];

                optionsToRender.forEach((opt, index) => {
                    const optionDiv = document.createElement("div");
                    optionDiv.className = "mc-option";
                    optionDiv.dataset.value = opt.label;
                    const displayLabel = newDisplayLabels[index];
                    
                    // ÁP DỤNG HÀM MỚI Ở ĐÂY
                    optionDiv.innerHTML = `<span class="mc-option-label">${displayLabel}</span><span class="mc-option-content">${convertLineBreaks(processImagePlaceholders(opt.content))}</span>`;
                    
                    optionDiv.onclick = function() {
                        selectMCOption(this, questionData.originalIndex);
                        saveProgress();
                    };
                    optionsContainer.appendChild(optionDiv);
                });
                questionDiv.appendChild(optionsContainer);
            } 
            // XỬ LÝ CHO CÂU ĐÚNG-SAI DẠNG BẢNG (TABLE_TF)
            else if (parsedData.type === 'TABLE_TF') {
                let optionsToRender = parsedData.shouldShuffleOptions ? shuffleArray(parsedData.options) : parsedData.options;
                const newDisplayLabels = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

                const table = document.createElement('table');
                table.className = 'table-tf-container';
                table.innerHTML = `<thead><tr><th>Mệnh đề</th><th>Đúng</th><th>Sai</th></tr></thead>`;
                const tbody = document.createElement('tbody');
                
                optionsToRender.forEach((opt, index) => {
                    const groupName = `q${questionData.originalIndex}_sub${opt.label}`; 
                    const displayLabel = newDisplayLabels[index];
                    const row = document.createElement('tr');

                    // ÁP DỤNG HÀM MỚI Ở ĐÂY
                    row.innerHTML = `<td>${displayLabel}) ${convertLineBreaks(processImagePlaceholders(opt.content))}</td><td><label class="table-tf-radio"><input type="radio" name="${groupName}" value="T"></label></td><td><label class="table-tf-radio"><input type="radio" name="${groupName}" value="F"></label></td>`;
                    
                    tbody.appendChild(row);
                });
                
                table.appendChild(tbody);
                questionDiv.appendChild(table);
                table.addEventListener('click', (e) => {
                    if (e.target.closest('.table-tf-radio')) {
                        const clickedLabel = e.target.closest('.table-tf-radio');
                        clickedLabel.closest('tr').querySelectorAll('.table-tf-radio').forEach(l => l.classList.remove('selected'));
                        clickedLabel.classList.add('selected');
                        clickedLabel.querySelector('input').checked = true;
                        saveProgress();
                    }
                });
            } 
            // XỬ LÝ CHO CÂU ĐIỀN SỐ (NUMERIC)
            else if (parsedData.type === 'NUMERIC') {
                const numDiv = document.createElement("div");
                numDiv.className = "numeric-option";
                const input = document.createElement("input");
                input.type = "text";
                input.name = `q${questionData.originalIndex}`;
                input.placeholder = "Nhập đáp số";
                input.addEventListener('input', saveProgress);
                numDiv.appendChild(input);
                questionDiv.appendChild(numDiv);
            }
        // XỬ LÝ LỜI GIẢI
            if (parsedData.solution && parsedData.solution.trim() !== '') {
                const toggleBtn = document.createElement("button");
                toggleBtn.className = "toggle-explanation btn";
                toggleBtn.textContent = "Xem lời giải";
                toggleBtn.style.display = 'none';
                const expDiv = document.createElement("div");
                expDiv.className = "explanation hidden";

                // ÁP DỤNG HÀM MỚI Ở ĐÂY
                expDiv.innerHTML = convertLineBreaks(processImagePlaceholders(parsedData.solution));
                
                toggleBtn.onclick = () => {
                    expDiv.classList.toggle("hidden");
                    toggleBtn.textContent = expDiv.classList.contains("hidden") ? "Xem lời giải" : "Ẩn lời giải";
                };
                questionDiv.appendChild(toggleBtn);
                questionDiv.appendChild(expDiv);
            }

        } else {
            // Xử lý lỗi nếu không phân tích được câu hỏi
            console.error(`Không thể phân tích câu hỏi ${newIndex + 1}:`, questionData.block);
            const errorDiv = document.createElement("div");
            errorDiv.className = "question-statement";
            errorDiv.innerHTML = `<p style="color: red;">Lỗi: Không thể tải câu hỏi này.</p><pre>${questionData.block}</pre>`;
            questionDiv.appendChild(errorDiv);
        }
        
        quizContainer.appendChild(questionDiv);
        renderKatexInElement(questionDiv);
    });

    // Hiển thị giao diện
    quizContainer.style.display = "block";
    document.getElementById("gradeBtn").style.display = "inline-flex";
    setTimeout(restoreProgress, 200);
}
function loadQuiz_NangCap_XuongDong(data) {
    const quizContainer = getEl("quiz");
    quizContainer.innerHTML = "";
    window.questionMap = []; 

    let rawContent = data.content.trim();

    // =================================================================
    // CÁC BƯỚC CHUẨN HÓA DỮ LIỆU ĐẦU VÀO (ĐÃ ĐÚNG)
    // =================================================================
    
    // 1. Tự động thêm dòng trống giữa các câu
    rawContent = rawContent.replace(/\n*(Câu\s*\d+:\s*)/g, '\n\n$1').trim();
    
    // 2. Tự động làm sạch các dấu '#' đánh dấu đáp án bị sót lại
    rawContent = rawContent.replace(/^#(?![#])/gm, '');

    const questionGroupsRaw = rawContent.split(/\n\s*##group-separator##\s*\n/);
    
    let finalShuffledQuestions = [];
    let originalIndexCounter = 0;

    // --- Logic trộn câu hỏi theo nhóm (giữ nguyên, đã đúng) ---
    questionGroupsRaw.forEach(groupRaw => {
        if (!groupRaw.trim()) return;
        let questionsInGroup = groupRaw.trim().split(/\n\s*\n/).map(block => ({ originalIndex: originalIndexCounter++, block }));
        finalShuffledQuestions.push(...shuffleArray(questionsInGroup));
    });

    if (finalShuffledQuestions.length === 0 && rawContent) {
        let allQuestions = rawContent.split(/\n\s*\n/).map((block, index) => ({ originalIndex: index, block }));
        finalShuffledQuestions = shuffleArray(allQuestions);
    }
    
    // --- Bắt đầu vòng lặp render giao diện ---
    finalShuffledQuestions.forEach((questionData, newIndex) => {
        const questionDiv = document.createElement("div");
        questionDiv.className = "question";
        questionDiv.id = `question-${questionData.originalIndex}`;
        
        const parsedData = parseMCQuestion(questionData.block);

        if (parsedData) {
            const statementDiv = document.createElement("div");
            statementDiv.className = "question-statement";

            const newQuestionTitle = `Câu ${newIndex + 1}:`;
            let questionContent = parsedData.statement.replace(/^(Câu\s*\d+\s*[:.]?\s*)/i, '').trim();
            statementDiv.innerHTML = `<span class="question-number-highlight">${newQuestionTitle}</span> ${processImagePlaceholders(questionContent)}`;
            
            questionDiv.appendChild(statementDiv);

            // XỬ LÝ CHO CÂU TRẮC NGHIỆM (MC)
            if (parsedData.type === 'MC') {
                const optionsContainer = document.createElement('div');
                optionsContainer.className = `mc-options mc-layout-${parsedData.layout}`;
                optionsContainer.dataset.questionIndex = questionData.originalIndex;

                // Dùng cờ shouldShuffleOptions từ parser để quyết định có trộn hay không
                let optionsToRender = parsedData.shouldShuffleOptions ? shuffleArray(parsedData.options) : parsedData.options;
                const newDisplayLabels = ['A', 'B', 'C', 'D'];

                optionsToRender.forEach((opt, index) => {
                    const optionDiv = document.createElement("div");
                    optionDiv.className = "mc-option";
                    optionDiv.dataset.value = opt.label; // Dùng label gốc để chấm điểm
                    
                    const displayLabel = newDisplayLabels[index]; // Dùng label mới để hiển thị
                    
                    optionDiv.innerHTML = `<span class="mc-option-label">${displayLabel}</span><span class="mc-option-content">${processImagePlaceholders(opt.content)}</span>`;
                    
                    optionDiv.onclick = function() {
                        selectMCOption(this, questionData.originalIndex);
                        saveProgress();
                    };
                    optionsContainer.appendChild(optionDiv);
                });
                questionDiv.appendChild(optionsContainer);
            } 
            // ==========================================================
            // ==       SỬA LỖI CHO CÂU ĐÚNG-SAI (TABLE_TF) Ở ĐÂY       ==
            // ==     ÁP DỤNG LOGIC TRỘN VÀ GÁN LẠI LABEL TƯƠNG TỰ     ==
            // ==========================================================
            else if (parsedData.type === 'TABLE_TF') {
                // Dùng cờ shouldShuffleOptions từ parser để quyết định có trộn hay không
                let optionsToRender = parsedData.shouldShuffleOptions ? shuffleArray(parsedData.options) : parsedData.options;
                const newDisplayLabels = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

                const table = document.createElement('table');
                table.className = 'table-tf-container';
                table.innerHTML = `<thead><tr><th>Mệnh đề</th><th>Đúng</th><th>Sai</th></tr></thead>`;
                const tbody = document.createElement('tbody');
                
                // Lặp qua mảng đã được xử lý (trộn hoặc không)
                optionsToRender.forEach((opt, index) => {
                    // Dùng label GỐC để tạo group name, đảm bảo gửi đúng câu trả lời về server
                    const groupName = `q${questionData.originalIndex}_sub${opt.label}`; 
                    
                    // Dùng label MỚI (a, b, c, ...) để hiển thị
                    const displayLabel = newDisplayLabels[index];

                    const row = document.createElement('tr');
                    row.innerHTML = `<td>${displayLabel}) ${processImagePlaceholders(opt.content)}</td><td><label class="table-tf-radio"><input type="radio" name="${groupName}" value="T"></label></td><td><label class="table-tf-radio"><input type="radio" name="${groupName}" value="F"></label></td>`;
                    tbody.appendChild(row);
                });
                
                table.appendChild(tbody);
                questionDiv.appendChild(table);
                table.addEventListener('click', (e) => {
                    if (e.target.closest('.table-tf-radio')) {
                        const clickedLabel = e.target.closest('.table-tf-radio');
                        clickedLabel.closest('tr').querySelectorAll('.table-tf-radio').forEach(l => l.classList.remove('selected'));
                        clickedLabel.classList.add('selected');
                        clickedLabel.querySelector('input').checked = true;
                        saveProgress();
                    }
                });
            } 
            // ==========================================================
            // ==                KẾT THÚC PHẦN SỬA LỖI                 ==
            // ==========================================================
            else if (parsedData.type === 'NUMERIC') {
                const numDiv = document.createElement("div");
                numDiv.className = "numeric-option";
                const input = document.createElement("input");
                input.type = "text";
                input.name = `q${questionData.originalIndex}`;
                input.placeholder = "Nhập đáp số";
                input.addEventListener('input', saveProgress);
                numDiv.appendChild(input);
                questionDiv.appendChild(numDiv);
            }

            // Xử lý lời giải (giữ nguyên)
            if (parsedData.solution && parsedData.solution.trim() !== '') {
                const toggleBtn = document.createElement("button");
                toggleBtn.className = "toggle-explanation btn";
                toggleBtn.textContent = "Xem lời giải";
                toggleBtn.style.display = 'none';
                const expDiv = document.createElement("div");
                expDiv.className = "explanation hidden";
                expDiv.innerHTML = processImagePlaceholders(parsedData.solution);
                toggleBtn.onclick = () => {
                    expDiv.classList.toggle("hidden");
                    toggleBtn.textContent = expDiv.classList.contains("hidden") ? "Xem lời giải" : "Ẩn lời giải";
                };
                questionDiv.appendChild(toggleBtn);
                questionDiv.appendChild(expDiv);
            }

        } else {
            console.error(`Không thể phân tích câu hỏi ${newIndex + 1}:`, questionData.block);
            const errorDiv = document.createElement("div");
            errorDiv.className = "question-statement";
            errorDiv.innerHTML = `<p style="color: red;">Lỗi: Không thể tải câu hỏi này.</p><pre>${questionData.block}</pre>`;
            questionDiv.appendChild(errorDiv);
        }
        
        quizContainer.appendChild(questionDiv);
        renderKatexInElement(questionDiv);
    });

    getEl("quiz").style.display = "block";
    getEl("gradeBtn").style.display = "inline-flex";
    setTimeout(restoreProgress, 200);
}

function loadQuiz_TuyetVoi(data) {
    const quizContainer = getEl("quiz");
    quizContainer.innerHTML = "";
    window.questionMap = [];

    const rawContent = data.content.trim();
    const questionGroupsRaw = rawContent.split(/\n\s*##group-separator##\s*\n/);
    
    let finalShuffledQuestions = [];
    let originalIndexCounter = 0;

    // --- LOGIC TRỘN CÂU HỎI THEO NHÓM (giữ nguyên) ---
    questionGroupsRaw.forEach(groupRaw => {
        if (!groupRaw.trim()) return;
        let questionsInGroup = groupRaw.trim().split(/\n\s*\n/).map(block => ({ originalIndex: originalIndexCounter++, block }));
        finalShuffledQuestions.push(...shuffleArray(questionsInGroup));
    });

    if (finalShuffledQuestions.length === 0 && rawContent) {
        let allQuestions = rawContent.split(/\n\s*\n/).map((block, index) => ({ originalIndex: index, block }));
        finalShuffledQuestions = shuffleArray(allQuestions);
    }
    
    // --- BẮT ĐẦU VÒNG LẶP RENDER GIAO DIỆN ---
    finalShuffledQuestions.forEach((questionData, newIndex) => {
        const questionDiv = document.createElement("div");
        questionDiv.className = "question";
        questionDiv.id = `question-${questionData.originalIndex}`;
        
        const parsedData = parseMCQuestion(questionData.block);

        if (parsedData) {
            const statementDiv = document.createElement("div");
            statementDiv.className = "question-statement";

            // ==========================================================
            // ==     SỬA LỖI LẦN CUỐI: CHỈ MỘT BỘ ĐẾM MÀU CAM        ==
            // ==========================================================
            
            // 1. Lấy nội dung câu hỏi gốc từ parser
            let questionContent = parsedData.statement;
            
            // 2. Xóa bỏ hoàn toàn phần "Câu N:" cũ (nếu có)
            const qNumRegex = /^(Câu\s*\d+\s*[:.]?\s*)/i;
            questionContent = questionContent.replace(qNumRegex, '').trim();
            
            // 3. Tạo ra MỘT tiêu đề DUY NHẤT với số thứ tự mới và style màu cam
            const newQuestionTitle = `<span class="question-number-highlight">Câu ${newIndex + 1}:</span>`;
            
            // 4. Kết hợp tiêu đề mới và nội dung câu hỏi
            statementDiv.innerHTML = newQuestionTitle + " " + processImagePlaceholders(questionContent);

            // ==========================================================
            // ==                 KẾT THÚC PHẦN SỬA LỖI                ==
            // ==========================================================

            questionDiv.appendChild(statementDiv);

            // Logic render các lựa chọn giữ nguyên như phiên bản trước
            if (parsedData.type === 'MC') {
                const optionsContainer = document.createElement('div');
                optionsContainer.className = `mc-options mc-layout-${parsedData.layout}`;
                optionsContainer.dataset.questionIndex = questionData.originalIndex;

                let shuffledOptions = shuffleArray(parsedData.options);
                shuffledOptions.forEach(opt => {
                    const optionDiv = document.createElement("div");
                    optionDiv.className = "mc-option";
                    optionDiv.dataset.value = opt.label;
                    optionDiv.innerHTML = `<span class="mc-option-label">${opt.label}</span><span class="mc-option-content">${processImagePlaceholders(opt.content)}</span>`;
                    optionDiv.onclick = function() {
                        selectMCOption(this, questionData.originalIndex);
                        saveProgress();
                    };
                    optionsContainer.appendChild(optionDiv);
                });
                questionDiv.appendChild(optionsContainer);
            } 
            else if (parsedData.type === 'TABLE_TF') {
                let optionsToRender = parsedData.shouldShuffleOptions ? shuffleArray(parsedData.options) : parsedData.options;
                const table = document.createElement('table');
                table.className = 'table-tf-container';
                table.innerHTML = `<thead><tr><th>Mệnh đề</th><th>Đúng</th><th>Sai</th></tr></thead>`;
                const tbody = document.createElement('tbody');
                
                optionsToRender.forEach((opt) => {
                    const groupName = `q${questionData.originalIndex}_sub${opt.label}`;
                    const row = document.createElement('tr');
                    row.innerHTML = `<td>${opt.label}) ${processImagePlaceholders(opt.content)}</td><td><label class="table-tf-radio"><input type="radio" name="${groupName}" value="T"></label></td><td><label class="table-tf-radio"><input type="radio" name="${groupName}" value="F"></label></td>`;
                    tbody.appendChild(row);
                });
                
                table.appendChild(tbody);
                questionDiv.appendChild(table);
                table.addEventListener('click', (e) => {
                    if (e.target.closest('.table-tf-radio')) {
                        const clickedLabel = e.target.closest('.table-tf-radio');
                        clickedLabel.closest('tr').querySelectorAll('.table-tf-radio').forEach(l => l.classList.remove('selected'));
                        clickedLabel.classList.add('selected');
                        clickedLabel.querySelector('input').checked = true;
                        saveProgress();
                    }
                });

            } else if (parsedData.type === 'NUMERIC') {
                const numDiv = document.createElement("div");
                numDiv.className = "numeric-option";
                const input = document.createElement("input");
                input.type = "text";
                input.name = `q${questionData.originalIndex}`;
                input.placeholder = "Nhập đáp số";
                input.addEventListener('input', saveProgress);
                numDiv.appendChild(input);
                questionDiv.appendChild(numDiv);
            }

            
            // Xử lý lời giải (nếu có)
            if (parsedData.solution && parsedData.solution.trim() !== '') {
                const toggleBtn = document.createElement("button");
                toggleBtn.className = "toggle-explanation btn";
                toggleBtn.textContent = "Xem lời giải";
                toggleBtn.style.display = 'none'; // Mặc định ẩn, chỉ hiện sau khi nộp
                const expDiv = document.createElement("div");
                expDiv.className = "explanation hidden";
                expDiv.innerHTML = processImagePlaceholders(parsedData.solution);
                toggleBtn.onclick = () => {
                    expDiv.classList.toggle("hidden");
                    toggleBtn.textContent = expDiv.classList.contains("hidden") ? "Xem lời giải" : "Ẩn lời giải";
                };
                questionDiv.appendChild(toggleBtn);
                questionDiv.appendChild(expDiv);
            }

        } else { // Fallback nếu parseMCQuestion trả về null (khối câu hỏi không hợp lệ)
            // Có thể hiển thị thông báo lỗi hoặc bỏ qua câu hỏi này
            console.error(`Không thể phân tích câu hỏi ${i + 1}:`, questionBlock);
            const errorDiv = document.createElement("div");
            errorDiv.className = "question-statement";
            errorDiv.innerHTML = `<p style="color: red;">Lỗi: Không thể tải câu hỏi này (kiểu không rõ hoặc định dạng sai).</p><pre>${questionBlock}</pre>`;
            questionDiv.appendChild(errorDiv);
        }
        
        quizContainer.appendChild(questionDiv);
        renderKatexInElement(questionDiv);
    });

    getEl("quiz").style.display = "block";
    getEl("gradeBtn").style.display = "inline-flex";
    setTimeout(restoreProgress, 200);
}
// File: public/js/main.js
// THAY THẾ TOÀN BỘ HÀM loadQuiz CŨ BẰNG HÀM NÀY

function loadQuiz_DA_DUNGok(data) {
    const quizContainer = getEl("quiz");
    quizContainer.innerHTML = "";
    window.questionMap = []; 

    const rawContent = data.content.trim();
    const questionGroupsRaw = rawContent.split(/\n\s*##group-separator##\s*\n/);
    
    let finalShuffledQuestions = [];
    let originalIndexCounter = 0;

    // --- Logic trộn câu hỏi theo nhóm (giữ nguyên, đã đúng) ---
    questionGroupsRaw.forEach(groupRaw => {
        if (!groupRaw.trim()) return;
        let questionsInGroup = groupRaw.trim().split(/\n\s*\n/).map(block => ({ originalIndex: originalIndexCounter++, block }));
        finalShuffledQuestions.push(...shuffleArray(questionsInGroup));
    });

    if (finalShuffledQuestions.length === 0 && rawContent) {
        let allQuestions = rawContent.split(/\n\s*\n/).map((block, index) => ({ originalIndex: index, block }));
        finalShuffledQuestions = shuffleArray(allQuestions);
    }
    
    // --- Bắt đầu vòng lặp render giao diện ---
    finalShuffledQuestions.forEach((questionData, newIndex) => {
        const questionDiv = document.createElement("div");
        questionDiv.className = "question";
        questionDiv.id = `question-${questionData.originalIndex}`;
        
        const parsedData = parseMCQuestion(questionData.block);

        if (parsedData) {
            const statementDiv = document.createElement("div");
            statementDiv.className = "question-statement";

            const newQuestionTitle = `Câu ${newIndex + 1}:`;
            let questionContent = parsedData.statement.replace(/^(Câu\s*\d+\s*[:.]?\s*)/i, '').trim();
            statementDiv.innerHTML = `<span class="question-number-highlight">${newQuestionTitle}</span> ${processImagePlaceholders(questionContent)}`;
            
            questionDiv.appendChild(statementDiv);

            // XỬ LÝ CHO CÂU TRẮC NGHIỆM (MC)
            if (parsedData.type === 'MC') {
                const optionsContainer = document.createElement('div');
                optionsContainer.className = `mc-options mc-layout-${parsedData.layout}`;
                optionsContainer.dataset.questionIndex = questionData.originalIndex;

                // Dùng cờ shouldShuffleOptions từ parser để quyết định có trộn hay không
                let optionsToRender = parsedData.shouldShuffleOptions ? shuffleArray(parsedData.options) : parsedData.options;
                const newDisplayLabels = ['A', 'B', 'C', 'D'];

                optionsToRender.forEach((opt, index) => {
                    const optionDiv = document.createElement("div");
                    optionDiv.className = "mc-option";
                    optionDiv.dataset.value = opt.label; // Dùng label gốc để chấm điểm
                    
                    const displayLabel = newDisplayLabels[index]; // Dùng label mới để hiển thị
                    
                    optionDiv.innerHTML = `<span class="mc-option-label">${displayLabel}</span><span class="mc-option-content">${processImagePlaceholders(opt.content)}</span>`;
                    
                    optionDiv.onclick = function() {
                        selectMCOption(this, questionData.originalIndex);
                        saveProgress();
                    };
                    optionsContainer.appendChild(optionDiv);
                });
                questionDiv.appendChild(optionsContainer);
            } 
            // ==========================================================
            // ==       SỬA LỖI CHO CÂU ĐÚNG-SAI (TABLE_TF) Ở ĐÂY       ==
            // ==     ÁP DỤNG LOGIC TRỘN VÀ GÁN LẠI LABEL TƯƠNG TỰ     ==
            // ==========================================================
            else if (parsedData.type === 'TABLE_TF') {
                // Dùng cờ shouldShuffleOptions từ parser để quyết định có trộn hay không
                let optionsToRender = parsedData.shouldShuffleOptions ? shuffleArray(parsedData.options) : parsedData.options;
                const newDisplayLabels = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

                const table = document.createElement('table');
                table.className = 'table-tf-container';
                table.innerHTML = `<thead><tr><th>Mệnh đề</th><th>Đúng</th><th>Sai</th></tr></thead>`;
                const tbody = document.createElement('tbody');
                
                // Lặp qua mảng đã được xử lý (trộn hoặc không)
                optionsToRender.forEach((opt, index) => {
                    // Dùng label GỐC để tạo group name, đảm bảo gửi đúng câu trả lời về server
                    const groupName = `q${questionData.originalIndex}_sub${opt.label}`; 
                    
                    // Dùng label MỚI (a, b, c, ...) để hiển thị
                    const displayLabel = newDisplayLabels[index];

                    const row = document.createElement('tr');
                    row.innerHTML = `<td>${displayLabel}) ${processImagePlaceholders(opt.content)}</td><td><label class="table-tf-radio"><input type="radio" name="${groupName}" value="T"></label></td><td><label class="table-tf-radio"><input type="radio" name="${groupName}" value="F"></label></td>`;
                    tbody.appendChild(row);
                });
                
                table.appendChild(tbody);
                questionDiv.appendChild(table);
                table.addEventListener('click', (e) => {
                    if (e.target.closest('.table-tf-radio')) {
                        const clickedLabel = e.target.closest('.table-tf-radio');
                        clickedLabel.closest('tr').querySelectorAll('.table-tf-radio').forEach(l => l.classList.remove('selected'));
                        clickedLabel.classList.add('selected');
                        clickedLabel.querySelector('input').checked = true;
                        saveProgress();
                    }
                });
            } 
            // ==========================================================
            // ==                KẾT THÚC PHẦN SỬA LỖI                 ==
            // ==========================================================
            else if (parsedData.type === 'NUMERIC') {
                const numDiv = document.createElement("div");
                numDiv.className = "numeric-option";
                const input = document.createElement("input");
                input.type = "text";
                input.name = `q${questionData.originalIndex}`;
                input.placeholder = "Nhập đáp số";
                input.addEventListener('input', saveProgress);
                numDiv.appendChild(input);
                questionDiv.appendChild(numDiv);
            }

            // Xử lý lời giải (giữ nguyên)
            if (parsedData.solution && parsedData.solution.trim() !== '') {
                const toggleBtn = document.createElement("button");
                toggleBtn.className = "toggle-explanation btn";
                toggleBtn.textContent = "Xem lời giải";
                toggleBtn.style.display = 'none';
                const expDiv = document.createElement("div");
                expDiv.className = "explanation hidden";
                expDiv.innerHTML = processImagePlaceholders(parsedData.solution);
                toggleBtn.onclick = () => {
                    expDiv.classList.toggle("hidden");
                    toggleBtn.textContent = expDiv.classList.contains("hidden") ? "Xem lời giải" : "Ẩn lời giải";
                };
                questionDiv.appendChild(toggleBtn);
                questionDiv.appendChild(expDiv);
            }

        } else {
            console.error(`Không thể phân tích câu hỏi ${newIndex + 1}:`, questionData.block);
            const errorDiv = document.createElement("div");
            errorDiv.className = "question-statement";
            errorDiv.innerHTML = `<p style="color: red;">Lỗi: Không thể tải câu hỏi này.</p><pre>${questionData.block}</pre>`;
            questionDiv.appendChild(errorDiv);
        }
        
        quizContainer.appendChild(questionDiv);
        renderKatexInElement(questionDiv);
    });

    getEl("quiz").style.display = "block";
    getEl("gradeBtn").style.display = "inline-flex";
    setTimeout(restoreProgress, 200);
}
// THAY THẾ TOÀN BỘ HÀM loadQuiz CŨ BẰNG HÀM NÀY

// File: public/js/main.js
// PHIÊN BẢN HÀM loadQuiz TỐT NHẤT - ĐÁP ỨNG ĐÚNG 2 CHẾ ĐỘ TRỘN
