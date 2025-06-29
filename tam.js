// File: public/js/main.js
// Thay thế hàm gradeQuiz cũ bằng phiên bản CUỐI CÙNG này

function gradeQuiz(isCheating = false) {
    if (timerInterval) clearInterval(timerInterval);
    if (!examData) {
        const storedData = sessionStorage.getItem('currentExamData');
        if (storedData) { examData = JSON.parse(storedData); }
        else { Swal.fire("Lỗi", "Mất dữ liệu bài thi.", "error").then(showStudentLoginScreen); return; }
    }
    
    // --- [NÂNG CẤP] KIỂM TRA CÂU CHƯA LÀM CHÍNH XÁC ---
    let unanswered = [];
    if (!isCheating) {
        document.querySelectorAll('#quiz .question').forEach((questionDiv, newIndex) => {
            const displayQuestionNumber = newIndex + 1;
            const questionTitle = `Câu ${displayQuestionNumber}`;
            
            const isMC = questionDiv.querySelector('.mc-options');
            const isTableTF = questionDiv.querySelector('.table-tf-container');
            const isNumeric = questionDiv.querySelector('.numeric-option');

            if (isMC && !questionDiv.querySelector('.mc-option.selected')) {
                unanswered.push(questionTitle);
            } else if (isTableTF) {
                isTableTF.querySelectorAll('tbody tr').forEach((row, subIndex) => {
                    if (!row.querySelector('input[type="radio"]:checked')) {
                        unanswered.push(`${questionTitle} (Mệnh đề ${subIndex + 1})`);
                    }
                });
            } else if (isNumeric) {
                const input = isNumeric.querySelector('input');
                if (!input || input.value.trim() === '') {
                    unanswered.push(questionTitle);
                }
            }
        });
    }

    if (unanswered.length > 0 && !isCheating) {
        showUnansweredDialog(unanswered);
        return;
    }
    // --- KẾT THÚC NÂNG CẤP KIỂM TRA ---

    let payload = {
        teacherAlias: examData.teacherAlias,
        examCode: examData.examCode,
        studentName: examData.studentName,
        className: examData.className,
        isCheating: isCheating,
        answers: {}
    };

    if (!isCheating) {
        payload.answers = collectAnswersForProgress();
    }
    
    const progressKey = `examProgress_${examData.examCode}_${examData.studentName}_${examData.className}`;
    localStorage.removeItem(progressKey);

    Swal.fire({ title: "Đang nộp bài...", html: "Vui lòng chờ...", allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    functions.httpsCallable("submitExam")(payload).then(result => {
        Swal.close();
        sessionStorage.removeItem('currentExamData');
        const { score, examData: serverExamData, detailedResults } = result.data;
        
        // Hiển thị thông tin kết quả chung
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
            // ======================================================================
            // == [NÂNG CẤP] RENDER LẠI KẾT QUẢ THEO ĐÚNG THỨ TỰ ĐÃ TRỘN ==
            // ======================================================================
            
            // Lấy lại bản đồ câu hỏi đã được trộn
            const questionOrderMap = window.questionMap || [];
            const originalBlocks = serverExamData.content.trim().split(/\n\s*\n/);
            
            // Sắp xếp lại các khối câu hỏi gốc theo thứ tự đã hiển thị cho học sinh
            const sortedBlocks = questionOrderMap.map(mapInfo => ({
                newIndex: mapInfo.newIndex,
                block: originalBlocks[mapInfo.originalIndex],
                originalIndex: mapInfo.originalIndex
            })).sort((a, b) => a.newIndex - b.newIndex);

            // Render lại các câu hỏi theo đúng thứ tự học sinh đã làm
            sortedBlocks.forEach(questionData => {
                const questionDiv = document.createElement("div");
                questionDiv.className = "question";
                
                const resultForQ = detailedResults[`q${questionData.originalIndex}`];
                if (!resultForQ) {
                    console.warn(`Missing detailed results for question original index ${questionData.originalIndex}.`);
                    return;
                }

                const parsedData = parseMCQuestion(questionData.block);
                
                if (parsedData) {
                    const statementDiv = document.createElement('div');
                    statementDiv.className = 'question-statement';

                    // Áp dụng lại logic hiển thị số câu mới
                    let cleanStatement = parsedData.statement.replace(/^(Câu\s*\d+\s*[:.]?\s*)/i, '').trim();
                    const newQuestionTitle = `<span class="question-number-highlight">Câu ${questionData.newIndex + 1}:</span>`;
                    statementDiv.innerHTML = newQuestionTitle + " " + processImagePlaceholders(cleanStatement);
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
        // Di chuyển quizContainer vào trong result-container để hiển thị bên dưới
        getEl("result-container").appendChild(quizContainer);
        
    }).catch(error => {
        Swal.close();
        Swal.fire("Lỗi", `Lỗi nộp bài: ${error.message || "Lỗi không xác định."}`, "error").then(showStudentLoginScreen);
    });
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