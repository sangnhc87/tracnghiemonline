// ===================================================================
// ==        PDF-EXAM.JS - PHIÊN BẢN HOÀN CHỈNH & ĐỒNG BỘ          ==
// ===================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Khởi tạo và biến toàn cục
    const db = firebase.firestore();
    const functions = firebase.functions();
    let examData = null;
    let timerInterval = null;

    // --- CÁC HÀM XỬ LÝ CHÍNH ---

    async function loadAndStartExam(studentInfo) {
        const { teacherAlias, examCode } = studentInfo;
        const loadingEl = document.getElementById('loading');
        try {
            const result = await functions.httpsCallable("loadExamForStudent")({ teacherAlias, examCode });
            
            if (!result.data || result.data.examType !== 'PDF') {
                loadingEl.innerHTML = '<div class="card" style="max-width: 400px; margin: 50px auto; text-align: center; color: red;"><h2>Lỗi Tải Đề</h2><p>Mã đề này không phải là đề thi dạng PDF hoặc không tồn tại.</p><a href="/" class="btn btn-primary">Về trang chủ</a></div>';
                return;
            }

            examData = { ...result.data, ...studentInfo };
            loadingEl.style.display = 'none';
            document.getElementById('timer-container').style.display = 'flex';
            document.getElementById('examMainContainer').style.display = 'flex';
            document.getElementById('navigation-footer').style.display = 'flex';

            startTimer(examData.timeLimit);
            buildAnswerSheetAndNav(examData);
            
            if (examData.examPdfUrl) {
                renderPdf(examData.examPdfUrl, document.getElementById('pdf-viewer-container'));
            } else {
                 document.getElementById('pdf-viewer-container').innerHTML = "<h3>Lỗi: Không tìm thấy đường dẫn PDF của đề thi.</h3>";
            }
        } catch (error) {
            loadingEl.innerHTML = `<div class="card" style="max-width: 400px; margin: 50px auto; text-align: center; color: red;"><h2>Lỗi Hệ Thống</h2><p>${error.message}</p><a href="/" class="btn btn-primary">Về trang chủ</a></div>`;
            console.error("Lỗi trong loadAndStartExam:", error);
        }
    }

    function startTimer(minutes) {
        const endTime = Date.now() + minutes * 60 * 1000;
        const timerEl = document.getElementById("timer");
        if(!timerEl) return;
        timerInterval = setInterval(() => {
            const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
            const m = Math.floor(remaining / 60);
            const s = String(remaining % 60).padStart(2, '0');
            timerEl.textContent = `Thời gian: ${m} phút ${s} giây`;
            if (remaining <= 0) {
                clearInterval(timerInterval);
                Swal.fire({ icon: 'warning', title: 'Hết giờ!', text: 'Bài thi sẽ tự động nộp.', timer: 2000, showConfirmButton: false })
                   .then(() => submitAndGrade(true));
            }
        }, 1000);
    }

    function buildAnswerSheetAndNav(data) {
        const quizContainer = document.getElementById("quiz-container");
        const navContainer = document.getElementById("nav-scroll-container");
        quizContainer.innerHTML = '';
        navContainer.innerHTML = '';
        quizContainer.className = 'pdf-answer-sheet';

        // [SỬA LỖI] Thay đổi data.keysStr thành data.keys
        const keysToProcess = data.keys || []; 
        keysToProcess.forEach((key, i) => {
            if (!key) return;
            const questionDiv = document.createElement("div");
            questionDiv.className = "question";
            questionDiv.id = `question-${i}`;
            questionDiv.innerHTML = `<p>Câu ${i + 1}</p>`;
            const optionsContainer = document.createElement('div');
            optionsContainer.className = 'answer-options';

            const questionType = (() => {
                if (key.length === 1 && "ABCD".includes(key.toUpperCase())) return "MC";
                if (/^[TF]+$/i.test(key)) return "TF";
                if (!isNaN(parseFloat(key))) return "NUMERIC";
                return "UNKNOWN";
            })();
            
            if (questionType === "MC") {
                ["A", "B", "C", "D"].forEach(opt => {
                    const optionDiv = document.createElement("div");
                    optionDiv.className = "mc-option";
                    optionDiv.textContent = opt;
                    optionDiv.dataset.value = opt;
                    optionDiv.onclick = () => {
                        optionsContainer.querySelectorAll('.mc-option.selected').forEach(el => el.classList.remove('selected'));
                        optionDiv.classList.add('selected');
                        updateNavStatus(i, true);
                    };
                    optionsContainer.appendChild(optionDiv);
                });
            } else if (questionType === "TF") {
                for (let j = 0; j < key.length; j++) {
                    const tfItem = document.createElement("div");
                    tfItem.className = "tf-item";
                    tfItem.innerHTML = `<div class="tf-item-label">Mệnh đề ${j + 1}</div>`;
                    const btnGroup = document.createElement("div");
                    btnGroup.className = 'tf-btn-group';
                    const tBtn = document.createElement("div");
                    tBtn.className = "tf-btn T"; tBtn.textContent = "Đ"; tBtn.dataset.value = "T";
                    const fBtn = document.createElement("div");
                    fBtn.className = "tf-btn F"; fBtn.textContent = "S"; fBtn.dataset.value = "F";

                    const commonClickHandler = () => {
                        const allTfItems = questionDiv.querySelectorAll('.tf-item').length;
                        const selectedTfItems = questionDiv.querySelectorAll('.tf-item .tf-btn.selected').length;
                        updateNavStatus(i, allTfItems === selectedTfItems);
                    };
                    
                    tBtn.onclick = () => { tBtn.classList.add('selected'); fBtn.classList.remove('selected'); commonClickHandler(); };
                    fBtn.onclick = () => { fBtn.classList.add('selected'); tBtn.classList.remove('selected'); commonClickHandler(); };

                    btnGroup.appendChild(tBtn); btnGroup.appendChild(fBtn);
                    tfItem.appendChild(btnGroup); optionsContainer.appendChild(tfItem);
                }
            } else if (questionType === "NUMERIC") {
                const numericContainer = document.createElement("div");
                numericContainer.className = "numeric-option";
                numericContainer.innerHTML = `<input type="text" inputmode="numeric" pattern="[0-9]*[.]?[0-9]*" placeholder="Nhập đáp số">`;
                numericContainer.querySelector('input').oninput = (e) => {
                    const value = e.target.value.trim();
                    updateNavStatus(i, value !== '' && !isNaN(parseFloat(value)));
                };
                optionsContainer.appendChild(numericContainer);
            }

            questionDiv.appendChild(optionsContainer);
            quizContainer.appendChild(questionDiv);

            const navBtn = document.createElement('div');
            navBtn.className = 'nav-item';
            navBtn.id = `nav-${i}`;
            navBtn.textContent = i + 1;
            navBtn.onclick = () => scrollToQuestion(i);
            navContainer.appendChild(navBtn);
        });
    }

    function updateNavStatus(index, isAnswered) {
        const navBtn = document.getElementById(`nav-${index}`);
        if (navBtn) isAnswered ? navBtn.classList.add('answered') : navBtn.classList.remove('answered');
    }

    function scrollToQuestion(index) {
        document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('current'));
        const navBtn = document.getElementById(`nav-${index}`);
        if (navBtn) {
            navBtn.classList.add('current');
            navBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
        const questionEl = document.getElementById(`question-${index}`);
        if (questionEl) {
            questionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    async function renderPdf(sourceUrl, containerElement) {
        containerElement.innerHTML = `<div class="loading-overlay" style="position:absolute; inset:0; background:rgba(0,0,0,0.7); display:flex; justify-content:center; align-items:center; flex-direction:column; z-index:1000;"><div class="spinner"></div><p style="color:white; margin-top:10px;">Đang tải PDF...</p></div>`;
        try {
            let functionNameToCall = sourceUrl.startsWith("https://gitlab.com") ? 'getPdfFromGitLab' : 'getPdfFromGeneralUrl';
            console.log(`Đang gọi Cloud Function: ${functionNameToCall} cho URL: ${sourceUrl}`);

            const getPdfProxy = functions.httpsCallable(functionNameToCall);
            const result = await getPdfProxy({ url: sourceUrl });

            if (!result.data || !result.data.base64Data) throw new Error("Không nhận được dữ liệu base64 từ server.");
            
            const pdfData = Uint8Array.from(atob(result.data.base64Data), c => c.charCodeAt(0));
            const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
            
            containerElement.innerHTML = '';
            const scrollableFrame = document.createElement('div');
            scrollableFrame.className = 'pdf-scroll-frame'; 
            containerElement.appendChild(scrollableFrame);

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 1.5 });
                const canvas = document.createElement('canvas');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                scrollableFrame.appendChild(canvas);
                await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
            }
        } catch (err) {
            containerElement.innerHTML = `<div style="color:red; padding: 20px; text-align:center;"><h3>Lỗi tải PDF</h3><p>${err.message}</p><p>Vui lòng kiểm tra lại đường dẫn PDF hoặc kết nối mạng.</p></div>`;
            console.error("Lỗi khi tải hoặc hiển thị PDF:", err);
        }
    }

    function collectAnswers() {
        const answers = {};
        document.querySelectorAll('.pdf-answer-sheet .question').forEach((qDiv, i) => {
            // [SỬA LỖI] Thay đổi examData.keysStr thành examData.keys
            const key = (examData.keys && examData.keys[i]) ? examData.keys[i] : null;
            if (!key) return;

            if (key.length === 1 && "ABCD".includes(key.toUpperCase())) {
                const selected = qDiv.querySelector('.mc-option.selected');
                answers[`q${i}`] = selected ? selected.dataset.value : null;
            } else if (/^[TF]+$/i.test(key)) {
                let subAnswers = '';
                qDiv.querySelectorAll('.tf-item').forEach(item => {
                    const selectedBtn = item.querySelector('.tf-btn.selected');
                    subAnswers += selectedBtn ? selectedBtn.dataset.value : '_'; 
                });
                answers[`q${i}`] = subAnswers;
            } else if (!isNaN(parseFloat(key))) {
                const input = qDiv.querySelector('.numeric-option input');
                const value = (input && input.value.trim() !== '') ? input.value.trim() : null;
                answers[`q${i}`] = value;
            }
        });
        return answers;
    }
    
    function processSubmission(payloadData) {
        const payload = { ...examData, ...payloadData };
        Swal.fire({ title: "Đang nộp bài...", allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        functions.httpsCallable("submitExam")(payload)
            .then(res => {
                Swal.close();
                const { score, examData: serverExamData } = res.data;
                displayResults(score, serverExamData);
            })
            .catch(error => Swal.fire("Lỗi", `Lỗi nộp bài: ${error.message}`, "error"));
    }

    function displayResults(score, serverData) {
        document.getElementById('timer-container').style.display = 'none';
        document.getElementById('examMainContainer').style.display = 'none';
        document.getElementById('navigation-footer').style.display = 'none';
        
        const resultContainer = document.getElementById('result-container');
        resultContainer.style.display = 'flex';
        document.getElementById('score').textContent = score.toFixed(2);
        document.getElementById('student-name').textContent = examData.studentName;
        document.getElementById('student-class').textContent = examData.className;
        document.getElementById('exam-code').textContent = examData.examCode;

        if (serverData.solutionPdfUrl) {
            const viewBtn = document.getElementById('viewSolutionBtn');
            viewBtn.style.display = 'block';
            viewBtn.onclick = () => {
                resultContainer.style.display = 'none';
                const examMainContainer = document.getElementById('examMainContainer');
                examMainContainer.style.display = 'flex';
                document.getElementById('pdf-viewer-container').style.display = 'none';
                let solutionContainer = document.getElementById('solution-viewer-container');
                if (!solutionContainer) { 
                    solutionContainer = document.createElement('div');
                    solutionContainer.id = 'solution-viewer-container';
                    examMainContainer.prepend(solutionContainer);
                }
                solutionContainer.style.display = 'flex';
                renderPdf(serverData.solutionPdfUrl, solutionContainer);
            };
        }
    }

    // --- GÁN HÀM VÀO WINDOW & KHỞI ĐỘNG ---
    window.submitAndGrade = function(isCheating = false) {
        if (timerInterval) clearInterval(timerInterval);
        const userAnswers = collectAnswers();
        let unansweredCount = 0;
        Object.values(userAnswers).forEach(answer => {
            if (answer === null || (typeof answer === 'string' && answer.includes('_')) || answer === '') {
                unansweredCount++;
            }
        });
        
        if (unansweredCount > 0 && !isCheating) {
            Swal.fire({ icon: "info", title: "Chưa hoàn thành", text: `Bạn còn ${unansweredCount} câu chưa trả lời. Bạn có muốn nộp bài không?`, showCancelButton: true, confirmButtonText: 'Có, tôi muốn nộp!', cancelButtonText: 'Không, để tôi làm tiếp' })
                .then((result) => {
                    if (result.isConfirmed) processSubmission({ isCheating, answers: userAnswers });
                });
            return;
        }

        Swal.fire({
            title: 'Bạn chắc chắn muốn nộp bài?', icon: 'warning', showCancelButton: true,
            confirmButtonText: 'Đồng ý, nộp bài!', cancelButtonText: 'Hủy'
        }).then((result) => {
            if (result.isConfirmed) processSubmission({ isCheating, answers: userAnswers });
        });
    }

    const studentInfo = JSON.parse(sessionStorage.getItem('studentInfoForPdf'));
    if (!studentInfo) {
        alert('Lỗi: Không tìm thấy thông tin thí sinh. Vui lòng quay lại trang chủ và thử lại.');
        window.location.href = '/';
    } else {
        loadAndStartExam(studentInfo);
    }
});