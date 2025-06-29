// ===================================================================
// ==           CÁC HÀM MỚI CẦN BỔ SUNG VÀO main.js             ==
// ===================================================================

/**
 * Thuật toán Fisher-Yates để xáo trộn một mảng.
 * @param {Array} array Mảng cần xáo trộn.
 * @returns {Array} Một mảng MỚI đã được xáo trộn.
 */
function shuffleArray(array) {
    const newArray = [...array]; // Tạo bản sao để không thay đổi mảng gốc
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
}

/**
 * Thu thập câu trả lời hiện tại trên giao diện.
 * @returns {object} Object chứa các câu trả lời.
 */
function collectAnswersForProgress() {
    const answers = {};
    document.querySelectorAll('.question').forEach(questionDiv => {
        const originalIndex = questionDiv.id.split('-')[1];
        const qKey = `q${originalIndex}`;

        const selectedMCOption = questionDiv.querySelector('.mc-option.selected');
        if (selectedMCOption) {
            answers[qKey] = selectedMCOption.dataset.value;
            return;
        }

        const tfContainer = questionDiv.querySelector('.table-tf-container');
        if (tfContainer) {
            const subAnswers = {};
            let hasAnswer = false;
            tfContainer.querySelectorAll('input[type="radio"]:checked').forEach(radio => {
                const subLabel = radio.name.split('_sub')[1];
                subAnswers[subLabel] = radio.value;
                hasAnswer = true;
            });
            if (hasAnswer) answers[qKey] = subAnswers;
            return;
        }

        const numericInput = questionDiv.querySelector('.numeric-option input');
        if (numericInput && numericInput.value.trim() !== '') {
            answers[qKey] = numericInput.value.trim();
        }
    });
    return answers;
}

/**
 * Lưu câu trả lời hiện tại vào localStorage.
 */
function saveProgress() {
    if (!examData) return;
    const progressKey = `examProgress_${examData.examCode}_${examData.studentName}_${examData.className}`;
    const answers = collectAnswersForProgress();
    if (Object.keys(answers).length > 0) {
        localStorage.setItem(progressKey, JSON.stringify(answers));
    }
}

/**
 * Áp dụng các câu trả lời đã khôi phục lên giao diện.
 */
function applyRestoredAnswers(answers) {
    Object.entries(answers).forEach(([qKey, answer]) => {
        const originalIndex = qKey.replace('q', '');
        const questionDiv = getEl(`question-${originalIndex}`);
        if (!questionDiv) return;

        if (typeof answer === 'string' && /^[A-D]$/.test(answer)) {
            const optionToClick = questionDiv.querySelector(`.mc-option[data-value="${answer}"]`);
            if (optionToClick) optionToClick.click();
        } else if (typeof answer === 'object' && answer !== null) {
            Object.entries(answer).forEach(([subLabel, subAnswer]) => {
                const radioToClick = questionDiv.querySelector(`input[name="q${originalIndex}_sub${subLabel}"][value="${subAnswer}"]`);
                if (radioToClick) radioToClick.closest('.table-tf-radio')?.click();
            });
        } else if (typeof answer === 'string') {
            const input = questionDiv.querySelector(`input[name="q${originalIndex}"]`);
            if (input) input.value = answer;
        }
    });
}

/**
 * Khôi phục các câu trả lời đã lưu và hỏi người dùng.
 */
function restoreProgress() {
    if (!examData) return;
    const progressKey = `examProgress_${examData.examCode}_${examData.studentName}_${examData.className}`;
    const savedData = localStorage.getItem(progressKey);
    if (!savedData) return;

    const savedAnswers = JSON.parse(savedData);
    if (Object.keys(savedAnswers).length === 0) return;
    
    Swal.fire({
        title: 'Khôi phục bài làm?',
        text: "Chúng tôi tìm thấy một bài làm đang dang dở của bạn. Bạn có muốn khôi phục không?",
        icon: 'info', showCancelButton: true, confirmButtonText: 'Có, khôi phục!',
        cancelButtonText: 'Không, làm lại từ đầu'
    }).then((result) => {
        if (result.isConfirmed) {
            applyRestoredAnswers(savedAnswers);
            Swal.fire('Đã khôi phục!', 'Bài làm của bạn đã được khôi phục.', 'success');
        } else {
            localStorage.removeItem(progressKey);
        }
    });
}

// ===================================================================
// ==           CÁC HÀM CẦN THAY THẾ TRONG main.js                ==
// ===================================================================

/**
 * [NÂNG CẤP TOÀN DIỆN] Tải, trộn theo nhóm, trộn đáp án và hiển thị giao diện đề thi.
 */
function loadQuiz(data) {
    const quizContainer = getEl("quiz");
    quizContainer.innerHTML = "";
    // Khai báo lại questionMap ở đầu hàm để reset mỗi lần load
    window.questionMap = []; 

    const rawContent = data.content.trim();
    const questionGroupsRaw = rawContent.split(/\n\s*##group-separator##\s*\n/);
    
    let finalShuffledQuestions = [];
    let originalIndexCounter = 0;

    questionGroupsRaw.forEach(groupRaw => {
        if (!groupRaw.trim()) return;
        let questionsInGroup = groupRaw.trim().split(/\n\s*\n/).map(block => {
            return { originalIndex: originalIndexCounter++, block: block };
        });
        finalShuffledQuestions.push(...shuffleArray(questionsInGroup));
    });

    if (finalShuffledQuestions.length === 0 && rawContent) {
        let allQuestions = rawContent.split(/\n\s*\n/).map((block, index) => ({ originalIndex: index, block: block }));
        finalShuffledQuestions = shuffleArray(allQuestions);
    }
    
    finalShuffledQuestions.forEach((questionData, newIndex) => {
        window.questionMap.push({ newIndex: newIndex, originalIndex: questionData.originalIndex });
        const questionDiv = document.createElement("div");
        questionDiv.className = "question";
        questionDiv.id = `question-${questionData.originalIndex}`;
        const parsedData = parseMCQuestion(questionData.block);

        if (parsedData) {
            const statementDiv = document.createElement("div");
            statementDiv.className = "question-statement";
            statementDiv.innerHTML = `<p class="question-title"><strong>Câu ${newIndex + 1}:</strong></p>${processImagePlaceholders(parsedData.statement)}`;
            questionDiv.appendChild(statementDiv);

            const addSaveProgressListener = (element) => element.addEventListener('input', saveProgress);

            if (parsedData.type === 'MC') {
                const optionsContainer = document.createElement('div');
                optionsContainer.className = 'mc-options';
                let shuffledOptions = shuffleArray(parsedData.options);
                shuffledOptions.forEach((option, optionIdx) => {
                    const newLabel = String.fromCharCode(65 + optionIdx);
                    const optionDiv = document.createElement("div");
                    optionDiv.className = "mc-option";
                    optionDiv.dataset.value = option.label;
                    optionDiv.innerHTML = `<span class="option-label">${newLabel}.</span> ${processImagePlaceholders(option.content)}`;
                    optionDiv.onclick = () => {
                        optionsContainer.querySelectorAll('.mc-option.selected').forEach(el => el.classList.remove('selected'));
                        optionDiv.classList.add('selected');
                        saveProgress();
                    };
                    optionsContainer.appendChild(optionDiv);
                });
                questionDiv.appendChild(optionsContainer);
            } else if (parsedData.type === 'TABLE_TF') {
                let optionsToRender = parsedData.shouldShuffleOptions ? shuffleArray(parsedData.options) : parsedData.options;
                const table = document.createElement('table');
                table.className = 'table-tf-container';
                table.innerHTML = `<thead><tr><th>Mệnh đề</th><th>Đúng</th><th>Sai</th></tr></thead>`;
                const tbody = document.createElement('tbody');
                optionsToRender.forEach((opt) => {
                    const groupName = `q${questionData.originalIndex}_sub${opt.label}`;
                    const row = document.createElement('tr');
                    row.innerHTML = `<td>${processImagePlaceholders(opt.content)}</td><td><label class="table-tf-radio"><input type="radio" name="${groupName}" value="T"></label></td><td><label class="table-tf-radio"><input type="radio" name="${groupName}" value="F"></label></td>`;
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
                numDiv.innerHTML = `<input type="text" name="q${questionData.originalIndex}" placeholder="Nhập đáp số">`;
                addSaveProgressListener(numDiv.querySelector('input'));
                questionDiv.appendChild(numDiv);
            }
             if (parsedData.solution && parsedData.solution.trim()) {
                const toggleBtn = document.createElement("button");
                toggleBtn.className = "toggle-explanation btn"; toggleBtn.textContent = "Xem lời giải";
                toggleBtn.style.display = 'none';
                const expDiv = document.createElement("div");
                expDiv.className = "explanation hidden"; expDiv.innerHTML = processImagePlaceholders(parsedData.solution);
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

    getEl("quiz").style.display = "block";
    getEl("gradeBtn").style.display = "inline-flex";
    setTimeout(restoreProgress, 200);
}

/**
 * [NÂNG CẤP] Chấm điểm bài thi và xóa tiến trình đã lưu.
 */
function gradeQuiz(isCheating = false) {
    if (timerInterval) clearInterval(timerInterval);
    if (!examData) {
        const storedData = sessionStorage.getItem('currentExamData');
        if (storedData) { examData = JSON.parse(storedData); }
        else { Swal.fire("Lỗi", "Mất dữ liệu bài thi.", "error").then(showStudentLoginScreen); return; }
    }
    
    
    let unanswered = [];
    if (!isCheating) {
        document.querySelectorAll('.question').forEach((question, i) => {
            const questionTitle = `Câu ${i + 1}`;
            // Sử dụng parseMCQuestion để xác định loại câu hỏi,
            // nhưng không cần thiết lập lại HTML, chỉ dùng để check type.
            const parsedDataForCheck = (typeof parseMCQuestion === 'function') ? parseMCQuestion(examData.content.trim().split(/\n\s*\n/)[i]) : null;

            if (parsedDataForCheck && parsedDataForCheck.type === 'MC') {
                if (!question.querySelector('.mc-option.selected')) unanswered.push(questionTitle);
            } else if (parsedDataForCheck && parsedDataForCheck.type === 'TABLE_TF') {
                question.querySelectorAll('tbody tr').forEach((row, rowIndex) => {
                    if (!row.querySelector('input[type="radio"]:checked')) {
                        unanswered.push(`${questionTitle} (Mệnh đề ${String.fromCharCode(97 + rowIndex)})`);
                    }
                });
            } else if (parsedDataForCheck && parsedDataForCheck.type === 'NUMERIC') {
                const input = question.querySelector('input[type="text"]'); // Numeric giờ nằm trong new parse logic
                if (!input || input.value.trim() === "") unanswered.push(questionTitle);
            } else { // Fallback cho các loại cũ hoặc không phân tích được khi thu thập câu trả lời
                const type = examData.questionTypes[i] || 'Unknown'; // Lấy type từ data.questionTypes của server (kiểu cũ)
                if (type === "MC" && !question.querySelector(`.mc-options .mc-option.selected`)) { // Fallback MC
                    unanswered.push(questionTitle);
                } else if (type === "TF") { // Fallback TF
                    for (let j = 0; j < (examData.tfCounts[i] || 0); j++) {
                        if (!question.querySelector(`input[name='q${i}_sub${j}']:checked`)) {
                            unanswered.push(`${questionTitle} (Ý ${j + 1})`);
                        }
                    }
                } else if (type === "Numeric") { // Fallback Numeric
                    const input = question.querySelector(`input[name='q${i}']`);
                    if (!input || input.value.trim() === "") unanswered.push(questionTitle);
                }
            }
        });
    }

    if (unanswered.length > 0 && !isCheating) {
        showUnansweredDialog(unanswered);
        return;
    }

    let payload = {
        teacherAlias: examData.teacherAlias, examCode: examData.examCode,
        studentName: examData.studentName, className: examData.className,
        isCheating: isCheating, answers: {}
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