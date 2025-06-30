// File này chứa các hàm MỚI để tương tác với Storage,
// nó sẽ gọi các hàm gốc trong main.js khi cần thiết.

/**
 * [MỚI] Hàm xử lý submit form, có khả năng gọi hàm mới hoặc hàm cũ.
 */
async function handleExamFormSubmitWithStorage() {
    const useStorage = document.getElementById('useStorageCheckbox')?.checked;
    const examType = document.getElementById('examFormType').value;

    // Nếu không phải đề TEXT hoặc không chọn lưu vào Storage, gọi hàm cũ.
    if (examType !== 'TEXT' || !useStorage) {
        console.log("Sử dụng hàm submit cũ (handleExamFormSubmit).");
        // Giả định hàm handleExamFormSubmit đã có sẵn trong main.js và được gán vào window
        if (typeof window.handleExamFormSubmit === 'function') {
            return window.handleExamFormSubmit();
        } else {
            console.error("Hàm gốc handleExamFormSubmit không tồn tại!");
        }
        return;
    }
    
    console.log("Đang xử lý lưu đề thi vào Storage...");
    
    const examId = getEl("examId").value;
    const examData = {
        examCode: getEl("examFormCode").value.trim(),
        timeLimit: parseInt(getEl("examFormTime").value, 10),
        keys: getEl("examFormKeys").value.trim(),
        cores: getEl("examFormCores").value.trim(),
        content: getEl("examFormContent").value.trim(),
    };

    if (!examData.examCode || !examData.keys || !examData.content) {
        Swal.fire("Lỗi", "Vui lòng điền đủ Mã đề, Đáp án và Nội dung.", "error");
        return;
    }

    // Luôn gọi hàm mới khi đã chọn lưu vào Storage
    const functionName = examId ? "updateExamWithStorage" : "addExamWithStorage";
    const dataToSend = { examData };
    if (examId) dataToSend.examId = examId;

    showLoading();
    try {
        const callableFunction = firebase.functions().httpsCallable(functionName);
        const result = await callableFunction(dataToSend);
        Swal.fire("Thành công!", result.data.message, "success");
        hideExamForm();
        loadTeacherDataForDashboard();
    } catch (error) {
        Swal.fire("Lỗi", `Lỗi khi lưu đề thi: ${error.message}`, "error");
    } finally {
        hideLoading();
    }
}

/**
 * [MỚI] Hàm bắt đầu bài thi, có khả năng tải đề từ Storage hoặc từ Firestore.
 */
async function startExamWithStorage() {
    const teacherAlias = getEl("teacherAlias").value.trim();
    const examCode = getEl("examCode").value.trim();
    const studentName = getEl("studentSelect").value;
    const className = getEl("classSelect").value;
    if (!teacherAlias || !examCode || !studentName || !className) {
        Swal.fire("Cảnh báo", "Vui lòng nhập đầy đủ thông tin!", "warning");
        return;
    }

    showLoading();
    try {
        // Vẫn gọi hàm loadExamForStudent cũ để lấy thông tin ban đầu
        const result = await firebase.functions().httpsCallable("loadExamForStudent")({ teacherAlias, examCode });
        let examDetails = result.data;
        
        // KIỂM TRA ĐỂ BIẾT CÓ CẦN CHUYỂN HƯỚNG SANG TRANG PDF KHÔNG
        if (examDetails.examType === 'PDF') {
            console.log("Phát hiện đề PDF, đang chuyển hướng...");
            const studentInfoForPdf = { teacherAlias, examCode, studentName, className };
            sessionStorage.setItem('studentInfoForPdf', JSON.stringify(studentInfoForPdf));
            window.location.href = '/pdf-exam.html';
            return;
        }

        // KIỂM TRA ĐỂ BIẾT CẦN TẢI TỪ STORAGE HAY KHÔNG
        if (examDetails.examType === 'TEXT' && examDetails.contentStoragePath) {
            console.log("Đề thi trên Storage, đang lấy URL để tải...");
            const getContentUrl = firebase.functions().httpsCallable('getContentUrl');
            const urlResult = await getContentUrl({ path: examDetails.contentStoragePath });
            
            const response = await fetch(urlResult.data.contentUrl);
            if (!response.ok) throw new Error(`Không thể tải nội dung (status: ${response.status})`);
            
            examDetails.content = await response.text();
        }
        
        hideLoading();

        if (examDetails.examType === 'TEXT' && !examDetails.content) {
            Swal.fire("Lỗi", `Đề thi ${examCode} không có nội dung.`, "error").then(showStudentLoginScreen);
            return;
        }

        // Phần còn lại của logic giống hệt hàm startExam gốc
        window.examData = { ...examDetails, studentName, className, examCode, teacherAlias };
        sessionStorage.setItem('currentExamData', JSON.stringify(window.examData));
        showScreen('quiz');
        startTimer(window.examData.timeLimit || 90);
        loadQuiz(window.examData);

    } catch (error) {
        hideLoading();
        Swal.fire("Lỗi", `Lỗi tải đề thi: ${error.message}`, "error").then(showStudentLoginScreen);
    }
}

// Gán các hàm mới vào window để HTML có thể gọi
window.handleExamFormSubmitWithStorage = handleExamFormSubmitWithStorage;
window.startExamWithStorage = startExamWithStorage;