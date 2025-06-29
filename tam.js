// File: public/js/main.js
// Thay thế hàm loadQuiz cũ bằng phiên bản CUỐI CÙNG này

function loadQuiz(data) {
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

function loadQuiz(data) {
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
            // [SỬA LỖI SỐ CÂU]
            const statementDiv = document.createElement("div");
            statementDiv.className = "question-statement";
            
            let finalStatementHTML = processImagePlaceholders(parsedData.statement);
            const qNumRegex = /^(Câu\s*\d+\s*[:.]?\s*)/i;
            
            // Tìm và bọc phần "Câu N:" gốc bằng thẻ span màu cam
            finalStatementHTML = finalStatementHTML.replace(qNumRegex, (match) => {
                return `<span class="question-number-highlight">${match}</span>`;
            });
            
            // Tạo bộ đếm mới màu đen
            const newQuestionCounter = `<p class="question-counter">Câu ${newIndex + 1}</p>`;
            statementDiv.innerHTML = newQuestionCounter + finalStatementHTML;
            questionDiv.appendChild(statementDiv);

            // [SỬA LỖI KHÔNG CHỌN ĐƯỢC A,B,C,D]
            if (parsedData.type === 'MC') {
                const optionsContainer = document.createElement('div');
                // Gán đúng class và dataset mà hàm selectMCOption cần
                optionsContainer.className = `mc-options mc-layout-${parsedData.layout}`;
                optionsContainer.dataset.questionIndex = questionData.originalIndex;

                let shuffledOptions = shuffleArray(parsedData.options);
                shuffledOptions.forEach(opt => {
                    const optionDiv = document.createElement("div");
                    optionDiv.className = "mc-option";
                    optionDiv.dataset.value = opt.label;
                    
                    // Vẫn giữ cấu trúc HTML tương thích với CSS gốc của bạn
                    optionDiv.innerHTML = `<span class="mc-option-label">${opt.label}</span><span class="mc-option-content">${processImagePlaceholders(opt.content)}</span>`;
                    
                    // GỌI ĐÚNG HÀM selectMCOption TỪ FILE quiz-parser.js
                    optionDiv.onclick = function() {
                        selectMCOption(this, questionData.originalIndex); // <- Sửa ở đây
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
// Thay thế hàm gradeQuiz cũ bằng phiên bản CUỐI CÙNG này

function gradeQuiz(isCheating = false) {
    if (timerInterval) clearInterval(timerInterval);
    if (!examData) {
        const storedData = sessionStorage.getItem('currentExamData');
        if (storedData) { examData = JSON.parse(storedData); }
        else { Swal.fire("Lỗi", "Mất dữ liệu bài thi.", "error").then(showStudentLoginScreen); return; }
    }
    
    // ==========================================================
    // ==     SỬA LẠI LOGIC KIỂM TRA CÂU CHƯA LÀM CHO CHUẨN     ==
    // ==========================================================
    let unanswered = [];
    if (!isCheating) {
        // Lặp qua các câu hỏi đang hiển thị trên trang
        document.querySelectorAll('#quiz .question').forEach((questionDiv, newIndex) => {
            const displayQuestionNumber = newIndex + 1;
            const questionTitle = `Câu ${displayQuestionNumber}`;
            
            // Xác định loại câu hỏi dựa trên các element con
            const isMC = questionDiv.querySelector('.mc-options');
            const isTableTF = questionDiv.querySelector('.table-tf-container');
            const isNumeric = questionDiv.querySelector('.numeric-option');

            if (isMC) {
                // Nếu là câu MC, kiểm tra xem có lựa chọn nào được chọn không
                if (!questionDiv.querySelector('.mc-option.selected')) {
                    unanswered.push(questionTitle);
                }
            } else if (isTableTF) {
                // Nếu là câu TABLE_TF, kiểm tra từng mệnh đề
                let allAnswered = true;
                isTableTF.querySelectorAll('tbody tr').forEach((row, subIndex) => {
                    if (!row.querySelector('input[type="radio"]:checked')) {
                        allAnswered = false;
                        // Báo cáo chi tiết hơn
                        unanswered.push(`${questionTitle} (Mệnh đề ${subIndex + 1})`);
                    }
                });
                // Nếu bạn chỉ muốn báo 1 lần cho cả câu, dùng logic sau:
                // if (!allAnswered) { unanswered.push(questionTitle); }

            } else if (isNumeric) {
                // Nếu là câu NUMERIC, kiểm tra input có rỗng không
                const input = isNumeric.querySelector('input');
                if (!input || input.value.trim() === '') {
                    unanswered.push(questionTitle);
                }
            }
        });
    }

    if (unanswered.length > 0 && !isCheating) {
        // showUnansweredDialog là hàm cũ của bạn, nó sẽ hoạt động tốt
        showUnansweredDialog(unanswered);
        return;
    }
    // ==========================================================
    // ==                 KẾT THÚC PHẦN SỬA LỖI                ==
    // ==========================================================

    let payload = {
        teacherAlias: examData.teacherAlias,
        examCode: examData.examCode,
        studentName: examData.studentName,
        className: examData.className,
        isCheating: isCheating,
        answers: {}
    };

    if (!isCheating) {
        // Dùng lại hàm thu thập câu trả lời đã viết cho việc lưu tiến trình
        payload.answers = collectAnswersForProgress();
    }
    
    // Xóa tiến trình đã lưu sau khi nộp bài
    const progressKey = `examProgress_${examData.examCode}_${examData.studentName}_${examData.className}`;
    localStorage.removeItem(progressKey);

    Swal.fire({ title: "Đang nộp bài...", html: "Vui lòng chờ...", allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
     functions.httpsCallable("submitExam")(payload).then(result => {
        Swal.close();
        sessionStorage.removeItem('currentExamData');
        const { score, examData: serverExamData, detailedResults } = result.data;
        
        getEl("score").textContent = score.toFixed(2);
        getEl("student-name").textContent = examData.studentName;
        getEl("student-class").textContent = examData.className;
        getEl("exam-code").textContent = examData.examCode;
        showScreen("result-container");

        const quizContainer = getEl("quiz");
        quizContainer.innerHTML = '';
        if (!serverExamData || typeof serverExamData.content !== 'string' || serverExamData.content.trim() === '') {
            quizContainer.innerHTML = "<p>Lỗi: Không thể hiển thị chi tiết bài làm.</p>";
        } else {
            const questionBlocks = serverExamData.content.trim().split(/\n\s*\n/);
            questionBlocks.forEach((block, i) => {
                const questionDiv = document.createElement("div");
                questionDiv.className = "question";
                const resultForQ = detailedResults[`q${i}`];
                if (!resultForQ) { // Bỏ qua câu hỏi không có kết quả chi tiết (có thể do lỗi)
                    console.warn(`Missing detailed results for question ${i}. Skipping display.`);
                    return;
                }

                // Luôn gọi parseMCQuestion để lấy parsedData (có solution và statement đã bọc span)
                const parsedData = parseMCQuestion(block);
                
                const statementDiv = document.createElement('div');
                statementDiv.className = 'question-statement';

                if (parsedData) { // Nếu parse thành công (MC, TABLE_TF, NUMERIC)
                    statementDiv.innerHTML = processImagePlaceholders(parsedData.statement); // Lấy statement đã bọc span
                    questionDiv.appendChild(statementDiv);
                    
                    if (parsedData.type === 'MC') {
                        questionDiv.innerHTML += renderNewMCResult(parsedData, resultForQ);
                    } else if (parsedData.type === 'TABLE_TF') {
                        const table = document.createElement('table');
                        table.className = 'table-tf-container';
                        table.innerHTML = `<thead><tr><th>Phương án</th><th>Đúng</th><th>Sai</th></tr></thead>`;
                        const tbody = document.createElement('tbody');
                        parsedData.options.forEach((opt, optIndex) => {
                            const userAnswer = resultForQ.userAnswer ? resultForQ.userAnswer[optIndex] : null;
                            const correctAnswer = resultForQ.correctAnswer ? resultForQ.correctAnswer[optIndex] : null;
                            const row = document.createElement('tr');
                            let cellTrueClasses = "table-tf-radio";
                            let cellFalseClasses = "table-tf-radio";

                            if (userAnswer === 'T') cellTrueClasses += " selected";
                            if (userAnswer === 'F') cellFalseClasses += " selected";
                            if (correctAnswer === 'T') cellTrueClasses += " correct-answer-highlight";
                            if (correctAnswer === 'F') cellFalseClasses += " correct-answer-highlight";
                            if (userAnswer && userAnswer !== correctAnswer) {
                                if (userAnswer === 'T') cellTrueClasses += " incorrect-answer-highlight";
                                if (userAnswer === 'F') cellFalseClasses += " incorrect-answer-highlight";
                            }
                            row.innerHTML = `<td>${opt.label}) ${opt.content}</td><td><label class="${cellTrueClasses}"></label></td><td><label class="${cellFalseClasses}"></label></td>`;
                            tbody.appendChild(row);
                        });
                        table.appendChild(tbody);
                        questionDiv.appendChild(table);
                    }
                    else if (parsedData.type === 'NUMERIC') { // Xử lý câu hỏi điền số
                        let numDivClasses = "numeric-option";
                        if (resultForQ.scoreEarned > 0) numDivClasses += " correct-answer-highlight";
                        else if (resultForQ.userAnswer && resultForQ.userAnswer.trim() !== '') numDivClasses += " incorrect-answer-highlight";
                        
                        // Lời giải nằm trong parsedData.solution
                        questionDiv.innerHTML += `
                            <div class="${numDivClasses}">
                                <input type="text" value="${resultForQ.userAnswer || ''}" readonly>
                                <span class="correct-answer-value">Đáp án đúng: ${resultForQ.correctAnswer || 'N/A'}</span>
                            </div>`;
                    }

                    // Hiển thị lời giải nếu có
                    if (parsedData.solution && parsedData.solution.trim() !== '') {
                        const toggleBtn = document.createElement("button");
                        toggleBtn.className = "toggle-explanation btn"; toggleBtn.textContent = "Xem lời giải"; toggleBtn.style.display = 'block';
                        const expDiv = document.createElement("div");
                        expDiv.className = "explanation hidden"; expDiv.innerHTML = processImagePlaceholders(parsedData.solution);
                        toggleBtn.onclick = () => { expDiv.classList.toggle("hidden"); toggleBtn.textContent = expDiv.classList.contains("hidden") ? "Xem lời giải" : "Ẩn lời giải"; };
                        questionDiv.appendChild(toggleBtn);
                        questionDiv.appendChild(expDiv);
                    }
                } else { // Fallback nếu parseMCQuestion trả về null (lỗi định dạng nghiêm trọng)
                    console.error(`Không thể phân tích câu hỏi ${i + 1} khi chấm điểm:`, block);
                    const errorDiv = document.createElement("div");
                    errorDiv.className = "question-statement";
                    errorDiv.innerHTML = `<p style="color: red;">Lỗi: Không thể hiển thị chi tiết câu hỏi này (kiểu không rõ hoặc định dạng sai).</p><pre>${block}</pre>`;
                    questionDiv.appendChild(errorDiv);
                }
                
                quizContainer.appendChild(questionDiv);
                renderKatexInElement(questionDiv);
            });
        }
        getEl("quiz").style.display = 'block';
        getEl("gradeBtn").style.display = 'none';
    }).catch(error => {
        Swal.close();
        Swal.fire("Lỗi", `Lỗi nộp bài: ${error.message || "Lỗi không xác định."}`, "error").then(showStudentLoginScreen);
    });
}