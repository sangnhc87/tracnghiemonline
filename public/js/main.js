// =================================================================
// BƯỚC 1: KHAI BÁO BIẾN TOÀN CỤC VÀ CÁC DỊCH VỤ FIREBASE
// =================================================================

// Lấy các dịch vụ Firebase (đã được init.js khởi tạo)
const auth = firebase.auth();
const db = firebase.firestore();
const functions = firebase.app().functions("asia-southeast1");

// Các biến toàn cục khác
let examData = null, timerInterval = null, classData = {}, currentTeacherId = null;
const getEl = (id) => document.getElementById(id);


// =================================================================
// BƯỚC 2: ĐỊNH NGHĨA TẤT CẢ CÁC HÀM CỦA BẠN
// =================================================================

// --- CÁC HÀM TIỆN ÍCH ---

function convertLineBreaks(text) {
    if (!text || typeof text !== 'string') return text;
    const mathBlocksRegex = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$[\s\S]*?\$|\\\([\s\S]*?\\\))/g;
    const parts = text.split(mathBlocksRegex);
    return parts.map((part, index) => {
        if (!part) return '';
        return (index % 2 === 0) ? part.replace(/\\\\/g, '<br>') : part;
    }).join('');
}

function processImagePlaceholders(text) {
    if (!text || typeof text !== 'string') return text;
    let processedText = text;
    processedText = processedText.replace(/sangnhc1/g, 'https://gitlab.com/nguyensangnhc/pic4web/-/raw/main/Hinh');
    processedText = processedText.replace(/sangnhc2/g, 'https://gitlab.com/nguyensangnhc/tikz4web/-/raw/main/Hinh');
    processedText = processedText.replace(/sangnhc3/g, 'https://gitlab.com/nguyensangnhc/tikz2png/-/raw/main/Hinh');
    processedText = processedText.replace(/sangnhc4/g, 'https://gitlab.com/nguyensangnhc/png2link/-/raw/main/Hinh');
    return processedText;
}

function renderKatexInElement(element) {
    if (window.renderMathInElement) {
        try {
            window.renderMathInElement(element, {
                delimiters: [
                    { left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false },
                    { left: '\\(', right: '\\)', display: false }, { left: '\\[', right: '\\]', display: true }
                ],
                throwOnError: false
            });
        } catch (error) { console.error("KaTeX rendering error:", error); }
    }
}

// --- QUẢN LÝ GIAO DIỆN (UI) ---

function showScreen(screenId) {
    const screens = ["loginScreen", "teacherLogin", "loading", "timer-container", "quiz", "gradeBtn", "result-container", "teacherDashboard"];
    screens.forEach(id => {
        const el = getEl(id);
        if (el) el.style.display = "none";
    });
    const elToShow = getEl(screenId);
    if (elToShow) {
        if (["quiz", "teacherDashboard"].includes(screenId)) {
            elToShow.style.display = "block";
        } else if (screenId === "loading" || ["loginScreen", "teacherLogin", "result-container"].includes(screenId)) {
            elToShow.style.display = "flex";
        } else {
            elToShow.style.display = "block";
        }
    }
}

const showLoading = () => { if (getEl("loading")) getEl("loading").style.display = "flex"; };
const hideLoading = () => { if (getEl("loading")) getEl("loading").style.display = "none"; };
const showStudentLoginScreen = () => showScreen("loginScreen");
const showTeacherLoginScreen = () => showScreen("teacherLogin");

// --- CÁC HÀM LIÊN QUAN ĐẾN XÁC THỰC VÀ GIÁO VIÊN ---
// // === DÁN ĐỊNH NGHĨA CỦA BẠN VÀO ĐÚNG CHỖ NÀY LÀ HỢP LÝ NHẤT ===
// function initializeAuth(authService, onLoginCallback, onLogoutCallback) {
//     authService.onAuthStateChanged(user => {
//         if (user) {
//             onLoginCallback(user);
//         } else {
//             onLogoutCallback();
//         }
//     });
// }
// === PHIÊN BẢN HOÀN CHỈNH CUỐI CÙNG ===
async function updateTeacherUI(user) {
    showLoading();
    try {
        // Vẫn đợi token để tránh race condition
        await user.getIdToken(true);

        // Dùng lại biến 'functions' toàn cục và gọi hàm 'handleTeacherLogin'
        const handleLoginCallable = functions.httpsCallable("handleTeacherLogin");
        const res = await handleLoginCallable();
        const profile = res.data;

        // --- Phần còn lại của hàm để hiển thị UI (giữ nguyên) ---
        let trialDate = null;
        if (profile.trialEndDate) {
            if (profile.trialEndDate.seconds) trialDate = new Date(profile.trialEndDate.seconds * 1000);
            else if (profile.trialEndDate._seconds) trialDate = new Date(profile.trialEndDate._seconds * 1000);
            else trialDate = new Date(profile.trialEndDate);
        }

        const trialDays = trialDate ? Math.max(0, Math.ceil((trialDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0;

        const userInfoHtml = `
            <p style="margin: 5px 0;"><strong>Tài khoản:</strong> ${user.displayName || user.email}</p>
            <p style="margin: 5px 0;"><strong>Mã Giáo Viên:</strong> <span id="currentAliasDisplay" style="font-weight: bold; color: #007bff;">${profile.teacherAlias || "Chưa có"}</span></p>
            <p style="margin: 5px 0;"><strong>Trạng thái:</strong> 
                ${trialDays > 0 ? `<span style="color: #28a745; font-weight: bold;">Còn ${trialDays} ngày</span>` : `<span style="color: #dc3545; font-weight: bold;">Đã hết hạn</span>`}
            </p>`;

        if (getEl("teacherInfo")) { getEl("teacherInfo").innerHTML = userInfoHtml; getEl("teacherInfo").style.display = "block"; }
        if (getEl("teacherActions")) getEl("teacherActions").style.display = "flex";
        if (getEl("teacherAliasInput")) getEl("teacherAliasInput").value = profile.teacherAlias || "";
        if (getEl("teacherDashboardName")) getEl("teacherDashboardName").textContent = user.displayName || user.email;

        // Premium Dashboard bindings
        const displayName = user.displayName || user.email.split('@')[0];
        if (getEl("premiumGreeting")) getEl("premiumGreeting").textContent = displayName;
        if (getEl("premiumUserName")) getEl("premiumUserName").textContent = displayName;
        if (getEl("premiumUserAvatar")) getEl("premiumUserAvatar").textContent = displayName.charAt(0).toUpperCase();
        if (getEl("premiumStatDays")) getEl("premiumStatDays").textContent = trialDays > 0 ? trialDays : '∞';

    } catch (error) {
        console.error("Lỗi khi gọi handleTeacherLogin hoặc cập nhật UI:", error);
        Swal.fire("Lỗi", `Lỗi xử lý đăng nhập: ${error.message || "Không thể lấy thông tin người dùng."}`, "error");
    } finally {
        hideLoading();
    }
}

function updateTeacherAlias() {
    if (!currentTeacherId) return;
    const alias = getEl("teacherAliasInput").value.trim();
    if (!alias) { Swal.fire("Cảnh báo", "Alias không được trống.", "warning"); return; }
    showLoading();
    functions.httpsCallable("updateTeacherAlias")({ alias })
        .then(res => {
            Swal.fire("Thành công", res.data.message, "success");
            getEl("currentAliasDisplay").textContent = alias;
        })
        .catch(error => Swal.fire("Lỗi", `Lỗi cập nhật Alias: ${error.message}`, "error"))
        .finally(hideLoading);
}

// --- CÁC HÀM CHO DASHBOARD GIÁO VIÊN ---

function showTeacherDashboard() {
    if (!currentTeacherId) return;
    showScreen("teacherDashboard");
    loadTeacherDataForDashboard();
    loadSubmissions();
}

const hideTeacherDashboard = () => showTeacherLoginScreen();

async function loadTeacherDataForDashboard() {
    const examList = getEl("exam-list"), classList = getEl("class-list");
    examList.innerHTML = `<div class="list-item">Đang tải...</div>`;
    classList.innerHTML = `<div class="list-item">Đang tải...</div>`;
    try {
        if (firebase.auth().currentUser) {
            const functionsInstance = firebase.app().functions('asia-southeast1');
            const getTeacherData = functionsInstance.httpsCallable("getTeacherFullData");
            const result = await getTeacherData();
            renderExamsList(result.data.exams);
            renderClassesList(result.data.classes);
        } else {
            throw new Error("Người dùng không đăng nhập.");
        }
    } catch (error) {
        handleLoadError(error, examList, classList);
    }
}

function renderExamsList(exams) {
    const container = getEl("exam-list");
    container.innerHTML = "";
    if (!exams || exams.length === 0) {
        container.innerHTML = `<div class="list-item"><div class="list-item-content">Chưa có đề thi nào.</div></div>`;
        return;
    }
    exams.sort((a, b) => (a.examCode > b.examCode) ? 1 : -1).forEach(exam => {
        const questionCount = Array.isArray(exam.keys) ? exam.keys.length : 0;
        const item = document.createElement("div");
        item.className = "list-item";
        item.innerHTML = `
            <div class="list-item-content">
                <div class="list-item-title">${exam.examCode}</div>
                <div class="list-item-details">${questionCount} câu - ${exam.timeLimit || 90} phút</div>
            </div>
            <div class="list-item-actions">
                <button class="edit-btn" onclick="editExam('${exam.id}')" title="Sửa"><i class="fas fa-edit"></i></button>
                <button onclick="deleteExam('${exam.id}', '${exam.examCode}')" title="Xóa"><i class="fas fa-trash-alt"></i></button>
            </div>`;
        container.appendChild(item);
    });
}

function renderClassesList(classes) {
    const container = getEl("class-list");
    container.innerHTML = "";
    if (!classes || classes.length === 0) {
        container.innerHTML = `<div class="list-item"><div class="list-item-content">Chưa có lớp học nào.</div></div>`;
        return;
    }
    classes.sort((a, b) => (a.name > b.name) ? 1 : -1).forEach(cls => {
        const item = document.createElement("div");
        item.className = "list-item";
        item.innerHTML = `
            <div class="list-item-content">
                <div class="list-item-title">${cls.name}</div>
                <div class="list-item-details">${cls.students?.length || 0} học sinh</div>
            </div>
            <div class="list-item-actions">
                <button class="edit-btn" onclick="editClass('${cls.id}')" title="Sửa"><i class="fas fa-edit"></i></button>
                <button onclick="deleteClass('${cls.id}', '${cls.name}')" title="Xóa"><i class="fas fa-trash-alt"></i></button>
            </div>`;
        container.appendChild(item);
    });
}

async function loadSubmissions() {
    const container = getEl("submission-list");
    container.innerHTML = `<div class="list-item">Đang tải...</div>`;
    try {
        const snapshot = await db.collection("submissions").where("teacherId", "==", currentTeacherId).orderBy("timestamp", "desc").limit(20).get();
        container.innerHTML = "";
        if (snapshot.empty) {
            container.innerHTML = `<div class="list-item">Chưa có bài nộp nào.</div>`;
            return;
        }
        snapshot.forEach(doc => {
            const data = doc.data();
            const item = document.createElement("div");
            item.className = "list-item";
            item.innerHTML = `
                <div class="list-item-content">
                    <div class="list-item-title">${data.studentName} - Lớp ${data.className}</div>
                    <div class="list-item-details">${data.examCode} - ${data.score.toFixed(2)} điểm - ${data.timestamp.toDate().toLocaleString('vi-VN')}</div>
                </div>`;
            container.appendChild(item);
        });
    } catch (error) {
        handleLoadError(error, container);
    }
}

function handleLoadError(error, ...elements) {
    Swal.fire("Lỗi", `Lỗi tải dữ liệu: ${error.message}`, "error");
    elements.forEach(el => { if (el) el.innerHTML = `<div class="list-item">Lỗi tải dữ liệu.</div>`; });
}

// --- CÁC HÀM QUẢN LÝ FORM (MODAL) ---

async function editExam(examId) {
    showLoading();
    try {
        const getExamDataCallable = functions.httpsCallable("getTeacherFullExam");
        const result = await getExamDataCallable({ examId });
        const examData = result.data;
        if (examData.storageVersion === 2 && examData.contentStoragePath) {
            const getContentUrlCallable = functions.httpsCallable("getContentUrl");
            const urlResult = await getContentUrlCallable({ examId: examId });
            const contentUrl = urlResult.data.contentUrl;
            const response = await fetch(contentUrl);
            if (!response.ok) throw new Error(`Không thể tải nội dung đề thi từ Storage (HTTP ${response.status})`);
            examData.content = await response.text();
        }
        showExamForm(examData);
    } catch (error) {
        Swal.fire("Lỗi", `Không thể tải chi tiết đề thi: ${error.message}`, "error");
    } finally {
        hideLoading();
    }
}

async function deleteExam(examId, examCode) {
    const result = await Swal.fire({ title: 'Xác nhận xóa', text: `Bạn có chắc muốn xóa đề thi "${examCode}"?`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', cancelButtonText: 'Hủy', confirmButtonText: 'Xóa!' });
    if (result.isConfirmed) {
        showLoading();
        try {
            await functions.httpsCallable("deleteExam")({ examId });
            Swal.fire("Đã xóa!", "Đề thi đã được xóa.", "success");
            loadTeacherDataForDashboard();
        } catch (error) {
            Swal.fire("Lỗi", `Lỗi khi xóa: ${error.message}`, "error");
        } finally {
            hideLoading();
        }
    }
}

function showClassForm(classInfo = null) {
    const isEdit = !!classInfo;
    getEl("classFormTitle").textContent = isEdit ? `Sửa Lớp: ${classInfo.name}` : "Thêm Lớp mới";
    getEl("classId").value = isEdit ? classInfo.id : "";
    getEl("classFormName").value = isEdit ? classInfo.name : "";
    getEl("classFormStudents").value = isEdit && Array.isArray(classInfo.students) ? classInfo.students.join("\n") : "";
    getEl("classFormModal").style.display = "flex";
}

function hideClassForm() { getEl("classFormModal").style.display = "none"; }

async function handleClassFormSubmit() {
    const classId = getEl("classId").value;
    const className = getEl("classFormName").value.trim();
    if (!className) { Swal.fire("Lỗi", "Tên lớp không được trống.", "error"); return; }
    const classData = { name: className, students: getEl("classFormStudents").value.trim().split(/\r?\n/).filter(s => s.trim() !== "") };
    const functionName = classId ? "updateClass" : "addClass";
    const dataToSend = classId ? { classId, classData } : { classData };
    showLoading();
    try {
        const result = await functions.httpsCallable(functionName)(dataToSend);
        Swal.fire("Thành công!", result.data.message, "success");
        hideClassForm();
        loadTeacherDataForDashboard();
    } catch (error) {
        Swal.fire("Lỗi", `Lỗi khi lưu lớp học: ${error.message}`, "error");
    } finally {
        hideLoading();
    }
}

async function editClass(classId) {
    showLoading();
    try {
        const result = await functions.httpsCallable("getTeacherFullClass")({ classId });
        showClassForm(result.data);
    } catch (error) {
        Swal.fire("Lỗi", `Không thể tải chi tiết lớp học: ${error.message}`, "error");
    } finally {
        hideLoading();
    }
}

async function deleteClass(classId, className) {
    const result = await Swal.fire({ title: 'Xác nhận xóa', text: `Bạn có chắc muốn xóa lớp "${className}"?`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', cancelButtonText: 'Hủy', confirmButtonText: 'Xóa!' });
    if (result.isConfirmed) {
        showLoading();
        try {
            await functions.httpsCallable("deleteClass")({ classId });
            Swal.fire("Đã xóa!", "Lớp học đã được xóa.", "success");
            loadTeacherDataForDashboard();
        } catch (error) {
            Swal.fire("Lỗi", `Lỗi khi xóa: ${error.message}`, "error");
        } finally {
            hideLoading();
        }
    }
}

function toggleExamFormFields() {
    const type = getEl("examFormType").value;
    const textFieldsContainer = getEl("textExamFields");
    const pdfFieldsContainer = getEl("pdfExamFields");
    if (!textFieldsContainer || !pdfFieldsContainer) return;
    if (type === 'PDF') {
        textFieldsContainer.style.display = 'none';
        pdfFieldsContainer.style.display = 'block';
        getEl("examFormContent").required = false;
        getEl("examFormPdfUrl").required = true;
    } else {
        textFieldsContainer.style.display = 'block';
        pdfFieldsContainer.style.display = 'none';
        getEl("examFormContent").required = true;
        getEl("examFormPdfUrl").required = false;
    }
}

function showExamForm(exam = null) {
    const isEdit = !!exam;
    getEl("examFormTitle").textContent = isEdit ? `Sửa Đề thi: ${exam.examCode}` : "Thêm Đề thi mới";
    getEl("examForm").reset();
    getEl("examId").value = isEdit ? exam.id : "";
    getEl("examFormCode").value = isEdit ? exam.examCode : "";
    getEl("examFormTime").value = isEdit ? exam.timeLimit || 90 : 90;
    getEl("examFormKeys").value = (isEdit && exam.keys) ? exam.keys.join("|") : "";
    getEl("examFormCores").value = (isEdit && exam.cores) ? exam.cores.join("|") : "";
    const examType = isEdit ? (exam.examType || 'TEXT') : 'TEXT';
    getEl("examFormType").value = examType;
    getEl("examFormContent").value = (examType === 'TEXT' && isEdit) ? (exam.content || '') : '';
    getEl("examFormPdfUrl").value = (examType === 'PDF' && isEdit) ? (exam.examPdfUrl || '') : '';
    getEl("examFormSolutionUrl").value = (examType === 'PDF' && isEdit) ? (exam.solutionPdfUrl || '') : '';
    toggleExamFormFields();
    getEl("examFormModal").style.display = "flex";
}

function hideExamForm() { getEl("examFormModal").style.display = "none"; }

async function handleExamFormSubmit() {
    const useStorage = getEl('useStorageCheckbox')?.checked;
    const examType = getEl('examFormType').value;
    const examId = getEl("examId").value;
    const examData = {
        examType: examType,
        examCode: getEl("examFormCode").value.trim(),
        timeLimit: parseInt(getEl("examFormTime").value, 10),
        keys: getEl("examFormKeys").value.trim(),
        cores: getEl("examFormCores").value.trim(),
        content: getEl("examFormContent").value.trim(),
        examPdfUrl: getEl("examFormPdfUrl").value.trim(),
        solutionPdfUrl: getEl("examFormSolutionUrl").value.trim(),
        allowSolutionView: getEl("allowSolutionView")?.checked ?? true,
    };
    let functionName = '';
    if (examType === 'TEXT' && useStorage) functionName = examId ? "updateExamWithStorage" : "addExamWithStorage";
    else functionName = examId ? "updateExam" : "addExam";
    const dataToSend = { examData };
    if (examId) dataToSend.examId = examId;
    showLoading();
    try {
        const callableFunction = functions.httpsCallable(functionName);
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


// --- CÁC HÀM CHO HỌC SINH ---

async function initializeClassDataForStudent() {
    const teacherAlias = getEl("teacherAlias").value.trim();
    if (!teacherAlias) return;
    try {
        const result = await functions.httpsCallable("getClassesForStudent")({ teacherAlias });
        classData = result.data;
        populateClassSelect();
    } catch (error) {
        Swal.fire("Lỗi", `Lỗi tải danh sách lớp: ${error.message}`, "error");
    }
}

function populateClassSelect() {
    const select = getEl("classSelect");
    select.innerHTML = `<option value="">-- Chọn lớp --</option>`;
    Object.keys(classData).sort().forEach(className => { select.add(new Option(className, className)); });
    select.onchange = updateStudentList;
    updateStudentList();
}

function updateStudentList() {
    const studentSelect = getEl("studentSelect");
    const selectedClass = getEl("classSelect").value;
    studentSelect.innerHTML = `<option value="">-- Chọn tên --</option>`;
    if (selectedClass && classData[selectedClass]) {
        classData[selectedClass].sort().forEach(student => { studentSelect.add(new Option(student, student)); });
    }
}
async function startExam() {
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
        // SỬA Ở ĐÂY: Dùng biến 'functions' đã được cấu hình đúng
        const result = await functions.httpsCallable("loadExamForStudent")({ teacherAlias, examCode });
        let examDetails = result.data;

        if (examDetails.examType === 'PDF') {
            sessionStorage.setItem('studentInfoForPdf', JSON.stringify({ teacherAlias, examCode, studentName, className }));
            window.location.href = '/pdf-exam.html';
            return;
        }

        if (examDetails.examType === 'TEXT' && !examDetails.content && examDetails.storageVersion === 2 && examDetails.contentStoragePath) {
            // SỬA CẢ Ở ĐÂY: Dùng lại biến 'functions'
            const getContentUrl = functions.httpsCallable('getContentUrl');
            // Lưu ý: Hàm getContentUrl của bạn cần examId, không phải path
            // Mình sẽ sửa lại logic này cho đúng luôn
            const examId = examSnapshot.docs[0].id; // Giả sử bạn lấy được id từ bước trước
            const urlResult = await getContentUrl({ examId: examId });
            const response = await fetch(urlResult.data.contentUrl);
            if (!response.ok) throw new Error(`Không thể tải nội dung (status: ${response.status})`);
            examDetails.content = await response.text();
        }

        hideLoading();
        if (examDetails.examType === 'TEXT' && !examDetails.content) {
            Swal.fire("Lỗi", `Đề thi ${examCode} không có nội dung.`, "error").then(showStudentLoginScreen);
            return;
        }
        window.examData = { ...examDetails, studentName, className, examCode, teacherAlias };
        sessionStorage.setItem('currentExamData', JSON.stringify(window.examData));
        showScreen('quiz');
        getEl("timer-container").style.display = 'block';
        getEl("gradeBtn").style.display = 'inline-flex';
        startTimer(window.examData.timeLimit || 90);
        loadQuiz(window.examData);
    } catch (error) {
        hideLoading();
        Swal.fire("Lỗi", `Lỗi tải đề thi: ${error.message}`, "error").then(showStudentLoginScreen);
    }
}

function startTimer(minutes) {
    const endTime = Date.now() + minutes * 60 * 1000;
    getEl("timer-container").style.display = "block";
    timerInterval = setInterval(() => {
        let timeRemaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
        const m = Math.floor(timeRemaining / 60);
        const s = timeRemaining % 60;
        getEl("timer").textContent = `Thời gian còn lại: ${m} phút ${s < 10 ? "0" : ""}${s} giây`;
        if (timeRemaining <= 0) {
            clearInterval(timerInterval);
            Swal.fire({ icon: "warning", title: "Hết giờ!", text: "Bài thi sẽ tự động nộp.", timer: 3000, timerProgressBar: true, showConfirmButton: false })
                .then(() => gradeQuiz(false));
        }
    }, 1000);
    // Cập nhật ngay lần đầu
    (function updateNow() {
        let timeRemaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
        const m = Math.floor(timeRemaining / 60);
        const s = timeRemaining % 60;
        getEl("timer").textContent = `Thời gian còn lại: ${m} phút ${s < 10 ? "0" : ""}${s} giây`;
    })();
}

function shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
}

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

function saveProgress() {
    if (!examData) return;
    const progressKey = `examProgress_${examData.examCode}_${examData.studentName}_${examData.className}`;
    const answers = collectAnswersForProgress();
    if (Object.keys(answers).length > 0) {
        localStorage.setItem(progressKey, JSON.stringify(answers));
    }
}

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

function loadQuiz(data) {
    const quizContainer = document.getElementById("quiz");
    quizContainer.innerHTML = "";
    let rawContent = data.content.trim();
    let shuffleAll = false, shuffleGroups = false;
    const keywordRegex = /##\s*shuffle[-_](all|groups?)\s*##/g;
    const matches = [...rawContent.matchAll(keywordRegex)];
    for (const match of matches) {
        if (match[1].startsWith('group')) shuffleGroups = true;
        else if (match[1] === 'all') shuffleAll = true;
    }
    rawContent = rawContent.replace(/^\s*##\s*shuffle[-_](all|groups?)\s*##\s*$/gm, '');
    rawContent = "\n" + rawContent.trim();
    const separatorRegex = /(\n\s*##group-separator(?:-\d+)?##\s*\n)/;
    const parts = rawContent.split(separatorRegex).filter(p => p.trim() !== '');
    let questionsToRender = [];
    let originalIndexCounter = 0;
    let questionGroups = [];
    let currentSeparator = null;
    for (const part of parts) {
        if (part.trim().startsWith('##group-separator')) {
            currentSeparator = part.trim();
        } else {
            questionGroups.push({ separator: currentSeparator, content: part.trim() });
            currentSeparator = null;
        }
    }
    if (shuffleGroups) questionGroups = shuffleArray(questionGroups);
    for (const group of questionGroups) {
        if (!group.content) continue;
        const takeCount = ((separatorStr) => {
            if (!separatorStr) return null;
            const match = separatorStr.match(/##group-separator-(\d+)##/);
            return match ? parseInt(match[1], 10) : null;
        })(group.separator);
        const questionsInGroup = group.content.split(/\n\n(?=Câu\s*\d+[:.]?)/).filter(Boolean).map(block => ({ originalIndex: originalIndexCounter++, block: block.trim() }));
        let questionsForThisGroup = questionsInGroup;
        if (shuffleGroups || (takeCount !== null && takeCount > 0)) {
            questionsForThisGroup = shuffleArray(questionsInGroup);
        }
        questionsToRender.push(...(takeCount !== null && takeCount > 0 ? questionsForThisGroup.slice(0, takeCount) : questionsForThisGroup));
    }
    if (shuffleAll) questionsToRender = shuffleArray(questionsToRender);
    questionsToRender.forEach((questionData, newIndex) => {
        const questionDiv = document.createElement("div");
        questionDiv.className = "question";
        questionDiv.id = `question-${questionData.originalIndex}`;
        const parsedData = parseMCQuestion(questionData.block);
        if (parsedData) {
            const statementDiv = document.createElement("div");
            statementDiv.className = "question-statement";
            let questionContent = parsedData.statement.replace(/^(Câu\s*\d+\s*[:.]?\s*)/i, '').trim();
            statementDiv.innerHTML = `<span class="question-number-highlight">Câu ${newIndex + 1}:</span> ${convertLineBreaks(processImagePlaceholders(questionContent))}`;
            questionDiv.appendChild(statementDiv);
            let optionsToRender = parsedData.shouldShuffleOptions ? shuffleArray(parsedData.options) : parsedData.options;
            if (parsedData.type === 'MC') {
                const optionsContainer = document.createElement('div');
                optionsContainer.className = `mc-options mc-layout-${parsedData.layout}`;
                optionsToRender.forEach((opt, index) => {
                    const optionDiv = document.createElement("div");
                    optionDiv.className = "mc-option";
                    optionDiv.dataset.value = opt.label;
                    optionDiv.innerHTML = `<span class="mc-option-label">${['A', 'B', 'C', 'D'][index]}</span><span class="mc-option-content">${convertLineBreaks(processImagePlaceholders(opt.content))}</span>`;
                    optionDiv.onclick = () => {
                        const qContainer = optionDiv.closest('.question');
                        if (!qContainer) return;
                        qContainer.querySelectorAll('.mc-option').forEach(el => el.classList.remove('selected'));
                        optionDiv.classList.add('selected');
                        saveProgress();
                    };
                    optionsContainer.appendChild(optionDiv);
                });
                questionDiv.appendChild(optionsContainer);
            } else if (parsedData.type === 'TABLE_TF') {
                const table = document.createElement('table');
                table.className = 'table-tf-container';
                table.innerHTML = `<thead><tr><th>Mệnh đề</th><th>Đúng</th><th>Sai</th></tr></thead>`;
                const tbody = document.createElement('tbody');
                optionsToRender.forEach((opt, index) => {
                    const groupName = `q${questionData.originalIndex}_sub${opt.label}`;
                    const row = document.createElement('tr');
                    row.innerHTML = `<td>${['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'][index]}) ${convertLineBreaks(processImagePlaceholders(opt.content))}</td><td><label class="table-tf-radio"><input type="radio" name="${groupName}" value="T"></label></td><td><label class="table-tf-radio"><input type="radio" name="${groupName}" value="F"></label></td>`;
                    tbody.appendChild(row);
                });
                table.appendChild(tbody);
                table.addEventListener('click', (e) => {
                    if (e.target.closest('.table-tf-radio')) {
                        const clickedLabel = e.target.closest('.table-tf-radio');
                        clickedLabel.closest('tr').querySelectorAll('.table-tf-radio').forEach(l => l.classList.remove('selected'));
                        clickedLabel.classList.add('selected');
                        clickedLabel.querySelector('input').checked = true;
                        saveProgress();
                    }
                });
                questionDiv.appendChild(table);
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
    getEl("quiz").style.display = "block";
    getEl("gradeBtn").style.display = "inline-flex";
    setTimeout(restoreProgress, 200);
}

async function gradeQuiz(isCheating = false) {
    if (timerInterval) clearInterval(timerInterval);
    if (!examData) {
        const storedData = sessionStorage.getItem('currentExamData');
        if (storedData) examData = JSON.parse(storedData);
        else { Swal.fire("Lỗi", "Mất dữ liệu bài thi.", "error").then(showStudentLoginScreen); return; }
    }
    if (!isCheating) {
        const unanswered = [];
        document.querySelectorAll('#quiz .question').forEach((questionDiv, newIndex) => {
            let isAnswered = true;
            if (questionDiv.querySelector('.mc-options') && !questionDiv.querySelector('.mc-option.selected')) isAnswered = false;
            if (questionDiv.querySelector('.table-tf-container') && questionDiv.querySelectorAll('input:checked').length < questionDiv.querySelectorAll('tbody tr').length) isAnswered = false;
            if (questionDiv.querySelector('.numeric-option') && (!questionDiv.querySelector('input') || questionDiv.querySelector('input').value.trim() === '')) isAnswered = false;
            if (!isAnswered) unanswered.push(`Câu ${newIndex + 1}`);
        });
        if (unanswered.length > 0) {
            Swal.fire({ icon: "info", title: "Chưa làm xong", html: `<p>Bạn chưa trả lời các câu sau:</p><ul style="text-align:left; max-height: 200px; overflow-y:auto;">${unanswered.map(q => `<li>${q}</li>`).join("")}</ul>`, confirmButtonText: "OK" });
            return;
        }
    }
    const payload = {
        teacherAlias: examData.teacherAlias, examCode: examData.examCode, studentName: examData.studentName,
        className: examData.className, isCheating: isCheating, answers: isCheating ? {} : collectAnswersForProgress()
    };
    localStorage.removeItem(`examProgress_${examData.examCode}_${examData.studentName}_${examData.className}`);
    Swal.fire({ title: "Đang nộp bài...", html: "Vui lòng chờ...", allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const submitCallable = functions.httpsCallable("submitExam");
        const result = await submitCallable(payload);
        const { score, detailedResults } = result.data;
        Swal.close();
        getEl("score").textContent = score.toFixed(2);
        getEl("student-name").textContent = examData.studentName;
        getEl("student-class").textContent = examData.className;
        getEl("exam-code").textContent = examData.examCode;
        getEl("result-container").style.display = 'flex';
        getEl("gradeBtn").style.display = 'none';
        getEl("timer-container").style.display = 'none';
        const quizContainer = getEl("quiz");
        quizContainer.classList.add('is-result');
        document.querySelectorAll('#quiz .question').forEach(questionDiv => {
            const originalIndex = questionDiv.id.split('-')[1];
            const resultForQ = detailedResults[`q${originalIndex}`];
            if (!resultForQ) return;
            questionDiv.querySelectorAll('input, .mc-option').forEach(el => {
                el.style.pointerEvents = 'none';
                if (el.tagName === 'INPUT') el.disabled = true;
            });
            questionDiv.querySelectorAll('.mc-option').forEach(optionEl => {
                const optionValue = optionEl.dataset.value;
                if (resultForQ.userAnswer === optionValue && resultForQ.userAnswer !== resultForQ.correctAnswer) optionEl.classList.add('incorrect-answer-highlight');
                if (resultForQ.correctAnswer === optionValue) optionEl.classList.add('correct-answer-highlight');
            });
            const tableTF = questionDiv.querySelector('.table-tf-container');
            if (tableTF) {
                const correctAnsString = String(resultForQ.correctAnswer);
                tableTF.querySelectorAll('tbody tr').forEach((row, rowIndex) => {
                    const radios = row.querySelectorAll('input[type="radio"]');
                    const labelT = radios[0].closest('label');
                    const labelF = radios[1].closest('label');
                    const subLabel = radios[0].name.split('_sub')[1];
                    const userSubAnswer = resultForQ.userAnswer ? resultForQ.userAnswer[subLabel] : null;
                    const correctSubAnswer = correctAnsString[rowIndex];
                    if (correctSubAnswer === 'T') labelT.classList.add('correct-answer-highlight');
                    if (correctSubAnswer === 'F') labelF.classList.add('correct-answer-highlight');
                    if (userSubAnswer && userSubAnswer !== correctSubAnswer) {
                        if (userSubAnswer === 'T') labelT.classList.add('incorrect-answer-highlight');
                        if (userSubAnswer === 'F') labelF.classList.add('incorrect-answer-highlight');
                    }
                });
            }
            const numericInputDiv = questionDiv.querySelector('.numeric-option');
            if (numericInputDiv) {
                const inputEl = numericInputDiv.querySelector('input');
                const correctAnswerSpan = document.createElement('span');
                correctAnswerSpan.className = 'correct-answer-value';
                correctAnswerSpan.textContent = `Đáp án đúng: ${resultForQ.correctAnswer}`;
                numericInputDiv.appendChild(correctAnswerSpan);
                if (resultForQ.scoreEarned > 0) inputEl.classList.add('correct-answer-highlight');
                else if (resultForQ.userAnswer && resultForQ.userAnswer.trim() !== '') inputEl.classList.add('incorrect-answer-highlight');
            }
            const toggleBtn = questionDiv.querySelector('.toggle-explanation');
            if (toggleBtn) toggleBtn.style.display = 'inline-block';
        });
        getEl("result-container").scrollIntoView({ behavior: 'smooth' });
        sessionStorage.removeItem('currentExamData');
    } catch (error) {
        Swal.close();
        Swal.fire("Lỗi", `Lỗi nộp bài: ${error.message}`, "error");
    }
}

function showUnansweredDialog(unanswered) {
    Swal.fire({ icon: "info", title: "Chưa làm xong", html: `<p>Bạn chưa trả lời các câu sau:</p><ul style="text-align:left; max-height: 200px; overflow-y:auto;">${unanswered.map(q => `<li>${q}</li>`).join("")}</ul>`, confirmButtonText: "OK" });
}

// =================================================================
// BƯỚC 3: KHỞI CHẠY ỨNG DỤNG VÀ GÁN SỰ KIỆN (PHIÊN BẢN HOÀN CHỈNH 100%)
// =================================================================

document.addEventListener('DOMContentLoaded', () => {

    // --- PHẦN 1: GÁN CÁC HÀM VÀO `window` ĐỂ HTML CÓ THỂ GỌI ---

    // Gán tất cả các hàm được định nghĩa trong main.js mà file HTML của bạn có sử dụng
    window.updateTeacherAlias = updateTeacherAlias;
    window.showTeacherDashboard = showTeacherDashboard;
    window.hideTeacherDashboard = hideTeacherDashboard;
    window.showExamForm = showExamForm;
    window.hideExamForm = hideExamForm;
    window.handleExamFormSubmit = handleExamFormSubmit;
    window.showClassForm = showClassForm;
    window.hideClassForm = hideClassForm;
    window.handleClassFormSubmit = handleClassFormSubmit;
    window.startExam = startExam;
    window.gradeQuiz = gradeQuiz;
    window.editExam = editExam;
    window.deleteExam = deleteExam;
    window.editClass = editClass;
    window.deleteClass = deleteClass;
    window.showTeacherLogin = showTeacherLoginScreen;
    window.showStudentLogin = showStudentLoginScreen;
    window.toggleExamFormFields = toggleExamFormFields;

    // Tạo các "hàm bọc" (wrapper) để gọi đến TÊN HÀM MỚI trong auth-manager.js
    // Cách này đảm bảo không có xung đột tên và không gây ra đệ quy.

    // Khi HTML gọi onclick="signInWithGoogle()", nó sẽ thực thi hàm này.
    window.signInWithGoogle = function () {
        // Gọi đến hàm có tên mới: AuthHelper_signInWithGoogle
        AuthHelper_signInWithGoogle(auth);
    };

    // Khi HTML gọi onclick="signOut()"
    window.signOut = function () {
        // Gọi đến hàm có tên mới: AuthHelper_signOut
        AuthHelper_signOut(auth);
    };


    // --- PHẦN 2: KHỞI TẠO LOGIC XÁC THỰC VÀ CHUYỂN HƯỚNG ---

    // Gọi đến TÊN HÀM MỚI trong auth-manager.js: AuthHelper_initialize
    AuthHelper_initialize(
        auth, // Biến auth toàn cục của main.js

        // 2.1 - Callback onLogin: Sẽ chạy KHI người dùng đăng nhập thành công
        (user) => {
            // KIỂM TRA CHUYỂN HƯỚNG TRƯỚC TIÊN
            const urlParams = new URLSearchParams(window.location.search);
            const returnToUrl = urlParams.get('returnTo');

            if (returnToUrl) {
                // Nếu có URL để quay lại, thực hiện chuyển hướng ngay và kết thúc
                console.log("Phát hiện URL để quay lại, đang chuyển hướng đến:", returnToUrl);
                window.history.replaceState({}, document.title, window.location.pathname);
                window.location.href = returnToUrl;
                return; // Rất quan trọng: Dừng hàm ở đây
            }

            // Nếu không có URL chuyển hướng, thực hiện luồng đăng nhập bình thường
            console.log("Không có URL chuyển hướng, thực hiện luồng đăng nhập bình thường.");
            currentTeacherId = user.uid; // Đảm bảo gán vào biến toàn cục
            const signInButton = document.querySelector('button[onclick*="signInWithGoogle"]');
            if (signInButton) signInButton.style.display = 'none';
            showTeacherLoginScreen();
            updateTeacherUI(user);
        },

        // 2.2 - Callback onLogout: Sẽ chạy KHI người dùng đăng xuất
        () => {
            currentTeacherId = null; // Đảm bảo gán lại là null
            const teacherInfoDiv = getEl("teacherInfo");
            const teacherActionsDiv = getEl("teacherActions");
            const signInButton = document.querySelector('button[onclick*="signInWithGoogle"]');

            if (teacherInfoDiv) teacherInfoDiv.style.display = "none";
            if (teacherActionsDiv) teacherActionsDiv.style.display = "none";
            if (signInButton) signInButton.style.display = 'inline-flex';

            showStudentLoginScreen();
        }
    );

    // --- PHẦN 3: GÁN CÁC EVENT LISTENER KHÁC ---

    // Gán sự kiện cho input "Mã Giáo viên" của học sinh
    const teacherAliasInput = getEl("teacherAlias");
    if (teacherAliasInput) {
        teacherAliasInput.addEventListener("change", initializeClassDataForStudent);
    }

    // Logic xử lý chống gian lận khi chuyển tab
    let tabSwitchCount = 0;
    document.addEventListener("visibilitychange", function () {
        // Kiểm tra xem người dùng có đang trong màn hình làm bài thi không
        if (getEl("quiz")?.style.display === 'block' && document.hidden) {
            tabSwitchCount++;
            if (tabSwitchCount >= 3) {
                // Tự động nộp bài với 0 điểm nếu gian lận
                Swal.fire({
                    icon: "warning",
                    title: "Gian lận!",
                    text: "Bạn đã chuyển tab quá nhiều lần. Bài thi sẽ bị nộp với 0 điểm.",
                    showConfirmButton: false,
                    timer: 3000,
                    timerProgressBar: true
                }).then(() => gradeQuiz(true));
            } else {
                // Cảnh báo người dùng
                Swal.fire({
                    icon: "warning",
                    title: "Cảnh báo",
                    text: `Bạn đã chuyển tab ${tabSwitchCount} lần. Chuyển 3 lần sẽ bị tính là gian lận.`,
                    showConfirmButton: false,
                    timer: 2000,
                    timerProgressBar: true
                });
            }
        }
    });
});