// public/js/main.js (Phiên bản cuối cùng - Đã sửa lỗi và tích hợp parser)

// --- KHỞI TẠO FIREBASE AN TOÀN ---
if (!firebase.apps.length) {
    const firebaseConfig = {
        apiKey: "AIzaSyCaybcU4Er3FM3C7mh_rCun7tLXx3uCfa8",
        authDomain: "sangnhc.firebaseapp.com",
        projectId: "sangnhc",
        storageBucket: "sangnhc.appspot.com",
        messagingSenderId: "1066567815353",
        appId: "1:1066567815353:web:ae68c784b9e964a6778b68"
    };
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();
const functions = firebase.functions();

// --- BIẾN TOÀN CỤC & HÀM TIỆN ÍCH ---
let examData = null, timerInterval = null, classData = {}, currentTeacherId = null;
const getEl = (id) => document.getElementById(id);

/**
 * Thay thế '\\' bằng '<br>' nhưng KHÔNG can thiệp vào bên trong MỌI môi trường toán học
 * ($...$, $$...$$, \(...\), \[...\]).
 * @param {string} text - Chuỗi cần xử lý.
 * @returns {string} Chuỗi đã thay thế.
 */
function convertLineBreaks(text) {
    if (!text || typeof text !== 'string') return text;

    const mathBlocksRegex = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$[\s\S]*?\$|\\\([\s\S]*?\\\))/g;
    const parts = text.split(mathBlocksRegex);

    const processedParts = parts.map((part, index) => {
        if (!part) return '';
        if (index % 2 === 0) {
            // Đây là phần không phải toán học, an toàn để thay thế
            return part.replace(/\\\\/g, '<br>');
        } else {
            // Đây là phần toán học, giữ nguyên
            return part;
        }
    });
    return processedParts.join('');
}
// =================================================================
// --- CÁC HÀM TIỆN ÍCH ---
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
                    {left: '$$', right: '$$', display: true},
                    {left: '$', right: '$', display: false},
                    {left: '\\(', right: '\\)', display: false},
                    {left: '\\[', right: '\\]', display: true}
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
// Code mới đã được sửa, an toàn hơn
const showLoading = () => {
    const loadingEl = getEl("loading");
    if (loadingEl) { // Chỉ thực hiện nếu tìm thấy phần tử
        loadingEl.style.display = "flex";
    }
};

const hideLoading = () => {
    const loadingEl = getEl("loading");
    if (loadingEl) { // Chỉ thực hiện nếu tìm thấy phần tử
        loadingEl.style.display = "none";
    }
};
const showStudentLoginScreen = () => showScreen("loginScreen");
const showTeacherLoginScreen = () => showScreen("teacherLogin");

// --- XÁC THỰC & QUẢN LÝ GIÁO VIÊN ---
// auth.onAuthStateChanged(user => {
//     if (user) {
//         currentTeacherId = user.uid;
//         showTeacherLoginScreen();
//         updateTeacherUI(user);
//     } else {
//         currentTeacherId = null;
//         getEl("teacherInfo").style.display = "none";
//         getEl("teacherActions").style.display = "none";
//         showStudentLoginScreen();
//     }
// });
// === SỬA ĐỔI PHẦN NÀY ===
auth.onAuthStateChanged(user => {
    const teacherInfoDiv = getEl("teacherInfo");
    const teacherActionsDiv = getEl("teacherActions");
    // Tìm nút đăng nhập bằng thuộc tính onclick
    const signInButton = document.querySelector('button[onclick="signInWithGoogle()"]');

    if (user) {
        currentTeacherId = user.uid;
        if (signInButton) signInButton.style.display = 'none'; // Ẩn nút đăng nhập khi đã login
        showTeacherLoginScreen();
        updateTeacherUI(user); // Hàm này sẽ được nâng cấp ở bước tiếp theo
    } else {
        currentTeacherId = null;
        if (teacherInfoDiv) teacherInfoDiv.style.display = "none";
        if (teacherActionsDiv) teacherActionsDiv.style.display = "none";
        if (signInButton) signInButton.style.display = 'inline-flex'; // Hiện lại nút đăng nhập
        showStudentLoginScreen();
    }
});

// File: public/js/main.js

// === THAY THẾ TOÀN BỘ HÀM NÀY ===
async function updateTeacherUI(user) {
    showLoading(); // Hàm này đã an toàn rồi
    try {
        const res = await functions.httpsCallable("onTeacherSignIn")();
        const profile = res.data;

        let trialDate = null;
        if (profile.trialEndDate) {
            if (profile.trialEndDate.seconds) {
                trialDate = new Date(profile.trialEndDate.seconds * 1000);
            } else if (profile.trialEndDate._seconds) {
                trialDate = new Date(profile.trialEndDate._seconds * 1000);
            } else {
                trialDate = new Date(profile.trialEndDate);
            }
        }
        
        const trialDays = trialDate ? Math.max(0, Math.ceil((trialDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0;
        
        const userInfoHtml = `
            <p style="margin: 5px 0;"><strong>Tài khoản:</strong> ${user.displayName || user.email}</p>
            <p style="margin: 5px 0;"><strong>Mã Giáo Viên:</strong> <span id="currentAliasDisplay" style="font-weight: bold; color: #007bff;">${profile.teacherAlias || "Chưa có"}</span></p>
            <p style="margin: 5px 0;"><strong>Trạng thái:</strong> 
                ${trialDays > 0
                    ? `<span style="color: #28a745; font-weight: bold;">Còn ${trialDays} ngày dùng thử</span>`
                    : `<span style="color: #dc3545; font-weight: bold;">Đã hết hạn dùng thử</span>`
                }
            </p>`;
        
        // ==========================================================
        // ==              PHẦN SỬA LỖI QUAN TRỌNG Ở ĐÂY           ==
        // ==  Thêm các câu lệnh 'if' để kiểm tra phần tử tồn tại   ==
        // ==========================================================
        const teacherInfoEl = getEl("teacherInfo");
        if (teacherInfoEl) {
            teacherInfoEl.innerHTML = userInfoHtml;
            teacherInfoEl.style.display = "block";
        }

        const teacherActionsEl = getEl("teacherActions");
        if (teacherActionsEl) {
            teacherActionsEl.style.display = "flex";
        }

        const teacherAliasInputEl = getEl("teacherAliasInput");
        if (teacherAliasInputEl) {
            teacherAliasInputEl.value = profile.teacherAlias || "";
        }

        const teacherDashboardNameEl = getEl("teacherDashboardName");
        if (teacherDashboardNameEl) {
            teacherDashboardNameEl.textContent = user.displayName || user.email;
        }

    } catch (error) {
        // [QUAN TRỌNG] Tạm thời comment dòng signOut để debug
        // auth.signOut();
        console.error("Lỗi khi gọi onTeacherSignIn hoặc cập nhật UI:", error);
        Swal.fire(
            "Lỗi", 
            `Lỗi xử lý đăng nhập: ${error.message || "Không thể lấy thông tin người dùng."}`, 
            "error"
        );
    } finally {
        hideLoading();
    }
}

function signInWithGoogle() {
    auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(error => Swal.fire("Lỗi", "Lỗi đăng nhập Google: " + error.message, "error"));
}

function signOut() {
    auth.signOut().then(() => Swal.fire("Thông báo", "Đăng xuất thành công!", "success"));
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

// --- DASHBOARD GIÁO VIÊN ---
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
        const result = await functions.httpsCallable("getTeacherFullData")();
        renderExamsList(result.data.exams);
        renderClassesList(result.data.classes);
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
        // const questionCount = exam.content ? exam.content.trim().split(/\n\s*\n/).length : (exam.questionTexts?.length || 0);
        // Đếm số câu dựa trên mảng 'keys', an toàn cho cả 2 loại đề
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

// --- QUẢN LÝ FORM (MODAL) ---


function hideExamForm() { getEl("examFormModal").style.display = "none"; }
// File: public/js/main.js
// Sửa lại hàm editExam

async function editExam(examId) {
    showLoading();
    try {
        // Bước 1: Lấy thông tin cơ bản của đề thi (giữ nguyên)
        const getExamDataCallable = functions.httpsCallable("getTeacherFullExam");
        const result = await getExamDataCallable({ examId });
        const examData = result.data;

        // Bước 2: KIỂM TRA xem đây có phải đề thi lưu trên Storage không (giữ nguyên)
        if (examData.storageVersion === 2 && examData.contentStoragePath) {
            
            // Bước 3: Gọi Cloud Function để lấy URL tải nội dung
            const getContentUrlCallable = functions.httpsCallable("getContentUrl");
            
            // === SỬA DÒNG NÀY ===
            // Code cũ: const urlResult = await getContentUrlCallable({ path: examData.contentStoragePath });
            // Code mới:
            const urlResult = await getContentUrlCallable({ examId: examId }); // Chỉ gửi examId
            // ======================

            const contentUrl = urlResult.data.contentUrl;

            // Bước 4: Tải nội dung về (giữ nguyên)
            const response = await fetch(contentUrl);
            if (!response.ok) {
                throw new Error(`Không thể tải nội dung đề thi từ Storage (HTTP ${response.status})`);
            }
            examData.content = await response.text();
        }
        
        // Bước 5: Hiển thị form (giữ nguyên)
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
    const studentsStr = getEl("classFormStudents").value.trim();
    if (!className) {
        Swal.fire("Lỗi", "Tên lớp không được trống.", "error");
        return;
    }
    const classData = { name: className, students: studentsStr.split(/\r?\n/).filter(s => s.trim() !== "") };
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

// --- LUỒNG LÀM BÀI CỦA HỌC SINH ---
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


// === THAY THẾ HOÀN TOÀN HÀM startExam CŨ BẰNG HÀM NÀY ===
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
        // Vẫn gọi hàm loadExamForStudent cũ để lấy thông tin ban đầu
        const result = await firebase.functions().httpsCallable("loadExamForStudent")({ teacherAlias, examCode });
        let examDetails = result.data;
        
        // Chuyển hướng nếu là đề PDF
        if (examDetails.examType === 'PDF') {
            console.log("Phát hiện đề PDF, đang chuyển hướng...");
            const studentInfoForPdf = { teacherAlias, examCode, studentName, className };
            sessionStorage.setItem('studentInfoForPdf', JSON.stringify(studentInfoForPdf));
            window.location.href = '/pdf-exam.html';
            return;
        }

        // [NÂNG CẤP] Tải nội dung từ Storage nếu cần
        if (examDetails.examType === 'TEXT' && examDetails.contentStoragePath) {
            console.log("Đề thi trên Storage, đang lấy URL để tải...");
            const getContentUrl = firebase.functions().httpsCallable('getContentUrl');
            const urlResult = await getContentUrl({ path: examDetails.contentStoragePath });
            
            const response = await fetch(urlResult.data.contentUrl);
            if (!response.ok) throw new Error(`Không thể tải nội dung (status: ${response.status})`);
            
            examDetails.content = await response.text();
        }
        
        hideLoading();

        // Kiểm tra lại sau khi đã cố gắng tải nội dung
        if (examDetails.examType === 'TEXT' && !examDetails.content) {
            Swal.fire("Lỗi", `Đề thi ${examCode} không có nội dung hoặc không thể tải.`, "error").then(showStudentLoginScreen);
            return;
        }

        // Logic bắt đầu bài thi
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
function startTimer(minutes){ 
    const endTime = Date.now() + minutes * 60 * 1000; 
    getEl("timer-container").style.display = "block"; 
    
    function update() {
        let timeRemaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
        const m = Math.floor(timeRemaining / 60);
        const s = timeRemaining % 60;
        getEl("timer").textContent = `Thời gian còn lại: ${m} phút ${s < 10 ? "0" : ""}${s} giây`;
        if (timeRemaining <= 0) {
            clearInterval(timerInterval);
            Swal.fire({
                icon: "warning", title: "Hết giờ!",
                text: "Bài thi sẽ tự động nộp.", timer: 3000,
                timerProgressBar: true, showConfirmButton: false
            }).then(() => gradeQuiz(false));
        }
    }
    update();
    timerInterval = setInterval(update, 1000);
}
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

function loadQuiz(data) {
    const quizContainer = getEl("quiz");
    quizContainer.innerHTML = "";
    window.questionMap = []; 

    let rawContent = data.content.trim();

    // === CÁC BƯỚC CHUẨN HÓA DỮ LIỆU ĐẦU VÀO (GIỮ NGUYÊN) ===
    rawContent = rawContent.replace(/\n*(Câu\s*\d+:\s*)/g, '\n\n$1').trim();
    rawContent = rawContent.replace(/^#(?![#])/gm, '');

    const questionGroupsRaw = rawContent.split(/\n\s*##group-separator##\s*\n/);
    
    let finalShuffledQuestions = [];
    let originalIndexCounter = 0;

    // === LOGIC TRỘN CÂU HỎI (GIỮ NGUYÊN) ===
    questionGroupsRaw.forEach(groupRaw => {
        if (!groupRaw.trim()) return;
        let questionsInGroup = groupRaw.trim().split(/\n\s*\n/).map(block => ({ originalIndex: originalIndexCounter++, block }));
        finalShuffledQuestions.push(...shuffleArray(questionsInGroup));
    });

    if (finalShuffledQuestions.length === 0 && rawContent) {
        let allQuestions = rawContent.split(/\n\s*\n/).map((block, index) => ({ originalIndex: index, block }));
        finalShuffledQuestions = shuffleArray(allQuestions);
    }
    
    // === VÒNG LẶP RENDER GIAO DIỆN (ĐÃ TÍCH HỢP XỬ LÝ XUỐNG DÒNG) ===
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

            // ÁP DỤNG HÀM MỚI Ở ĐÂY
            statementDiv.innerHTML = `<span class="question-number-highlight">${newQuestionTitle}</span> ${convertLineBreaks(processImagePlaceholders(questionContent))}`;
            
            questionDiv.appendChild(statementDiv);

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

    // === HIỂN THỊ GIAO DIỆN VÀ KHÔI PHỤC TIẾN TRÌNH (GIỮ NGUYÊN) ===
    getEl("quiz").style.display = "block";
    getEl("gradeBtn").style.display = "inline-flex";
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
async function gradeQuizgg(isCheating = false) {
    if (timerInterval) clearInterval(timerInterval);

    // ---- 1. LẤY DỮ LIỆU & KIỂM TRA CÂU CHƯA LÀM ----
    if (!examData) {
        const storedData = sessionStorage.getItem('currentExamData');
        if (storedData) {
            examData = JSON.parse(storedData);
        } else {
            Swal.fire("Lỗi", "Mất dữ liệu bài thi. Vui lòng thử lại.", "error").then(showStudentLoginScreen);
            return;
        }
    }
    
    // Kiểm tra câu chưa làm (logic này vẫn rất hữu ích)
    if (!isCheating) {
        const unanswered = [];
        document.querySelectorAll('#quiz .question').forEach((questionDiv, newIndex) => {
            const isMC = questionDiv.querySelector('.mc-options');
            const isTableTF = questionDiv.querySelector('.table-tf-container');
            const isNumeric = questionDiv.querySelector('.numeric-option');
            let isAnswered = true;

            if (isMC && !questionDiv.querySelector('.mc-option.selected')) isAnswered = false;
            if (isTableTF && isTableTF.querySelectorAll('input:checked').length < isTableTF.querySelectorAll('tbody tr').length) isAnswered = false;
            if (isNumeric && (!isNumeric.querySelector('input') || isNumeric.querySelector('input').value.trim() === '')) isAnswered = false;
            
            if (!isAnswered) unanswered.push(`Câu ${newIndex + 1}`);
        });
        if (unanswered.length > 0) {
            showUnansweredDialog(unanswered);
            return; // Dừng lại để người dùng quay lại làm bài
        }
    }

    // ---- 2. GỬI BÀI LÀM LÊN SERVER ----
    const payload = {
        teacherAlias: examData.teacherAlias,
        examCode: examData.examCode,
        studentName: examData.studentName,
        className: examData.className,
        isCheating: isCheating,
        answers: isCheating ? {} : collectAnswersForProgress()
    };
    
    localStorage.removeItem(`examProgress_${examData.examCode}_${examData.studentName}_${examData.className}`);
    Swal.fire({ title: "Đang nộp bài...", html: "Vui lòng chờ...", allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    try {
        const submitCallable = functions.httpsCallable("submitExam");
        const result = await submitCallable(payload);
        // Lưu ý: Chúng ta không cần 'serverExamData' nữa vì không render lại từ đầu
        const { score, detailedResults } = result.data;
        
        Swal.close();
        
        // ---- 3. HIỂN THỊ KẾT QUẢ TỔNG QUAN ----
        getEl("score").textContent = score.toFixed(2);
        getEl("student-name").textContent = examData.studentName;
        getEl("student-class").textContent = examData.className;
        getEl("exam-code").textContent = examData.examCode;
        
        // Hiển thị phần kết quả lên trên cùng
        getEl("result-container").style.display = 'flex';
        
        // Ẩn các nút không cần thiết
        getEl("gradeBtn").style.display = 'none';
        getEl("timer-container").style.display = 'none';

        // ---- 4. [LOGIC CỐT LÕI] CẬP NHẬT GIAO DIỆN BÀI THI TẠI CHỖ ----
        const quizContainer = getEl("quiz");
        // Thêm class để CSS biết đây là trạng thái xem kết quả
        quizContainer.classList.add('is-result'); 

        // Lặp qua từng câu hỏi đang hiển thị trên trang
        document.querySelectorAll('#quiz .question').forEach(questionDiv => {
            const originalIndex = questionDiv.id.split('-')[1];
            const resultForQ = detailedResults[`q${originalIndex}`];

            if (!resultForQ) return; 

            // Vô hiệu hóa tất cả input để không thể thay đổi
            questionDiv.querySelectorAll('input').forEach(el => el.disabled = true);

            // Highlight đáp án cho câu TRẮC NGHIỆM
            questionDiv.querySelectorAll('.mc-option').forEach(optionEl => {
                const optionValue = optionEl.dataset.value;
                if (resultForQ.userAnswer === optionValue && resultForQ.userAnswer !== resultForQ.correctAnswer) {
                    optionEl.classList.add('incorrect-answer-highlight');
                }
                if (resultForQ.correctAnswer === optionValue) {
                    optionEl.classList.add('correct-answer-highlight');
                }
            });
            
            // (Bạn có thể thêm logic highlight cho các loại câu hỏi khác ở đây nếu cần)

            // Tìm và cho hiển thị nút "Xem lời giải" đã được render sẵn
            const toggleBtn = questionDiv.querySelector('.toggle-explanation');
            if (toggleBtn) {
                toggleBtn.style.display = 'inline-block'; // Hiện nút lên
            }
        });
        
        // Tự động cuộn lên đầu trang kết quả để học sinh thấy điểm
        getEl("result-container").scrollIntoView({ behavior: 'smooth' });

        sessionStorage.removeItem('currentExamData');
    } catch (error) {
        Swal.close();
        console.error("Lỗi nghiêm trọng trong hàm gradeQuiz:", error);
        Swal.fire("Lỗi", `Lỗi nộp bài hoặc hiển thị kết quả: ${error.message}`, "error");
    }
}
// File: public/js/main.js
// THAY THẾ TOÀN BỘ HÀM gradeQuiz CŨ BẰNG HÀM NÀY

/**
 * [PHIÊN BẢN HOÀN CHỈNH 100%] Nộp bài, nhận kết quả và cập nhật giao diện tại chỗ.
 * - KHÔNG xóa bài làm, chỉ tô màu đáp án và hiện nút lời giải.
 * - Vô hiệu hóa các lựa chọn để người dùng không thể thay đổi.
 * - Xử lý mượt mà và hiệu quả cho CẢ 3 LOẠI CÂU HỎI.
 */
async function gradeQuiz(isCheating = false) {
    if (timerInterval) clearInterval(timerInterval);

    // ---- 1. LẤY DỮ LIỆU & KIỂM TRA CÂU CHƯA LÀM ----
    if (!examData) {
        const storedData = sessionStorage.getItem('currentExamData');
        if (storedData) {
            examData = JSON.parse(storedData);
        } else {
            Swal.fire("Lỗi", "Mất dữ liệu bài thi. Vui lòng thử lại.", "error").then(showStudentLoginScreen);
            return;
        }
    }
    
    if (!isCheating) {
        const unanswered = [];
        document.querySelectorAll('#quiz .question').forEach((questionDiv, newIndex) => {
            const isMC = questionDiv.querySelector('.mc-options');
            const isTableTF = questionDiv.querySelector('.table-tf-container');
            const isNumeric = questionDiv.querySelector('.numeric-option');
            let isAnswered = true;

            if (isMC && !questionDiv.querySelector('.mc-option.selected')) isAnswered = false;
            // Với TABLE_TF, chỉ cần có ít nhất 1 câu chưa trả lời là tính
            if (isTableTF && isTableTF.querySelectorAll('input:checked').length < isTableTF.querySelectorAll('tbody tr').length) isAnswered = false;
            if (isNumeric && (!isNumeric.querySelector('input') || isNumeric.querySelector('input').value.trim() === '')) isAnswered = false;
            
            if (!isAnswered) unanswered.push(`Câu ${newIndex + 1}`);
        });
        if (unanswered.length > 0) {
            showUnansweredDialog(unanswered);
            return;
        }
    }

    // ---- 2. GỬI BÀI LÀM LÊN SERVER ----
    const payload = {
        teacherAlias: examData.teacherAlias,
        examCode: examData.examCode,
        studentName: examData.studentName,
        className: examData.className,
        isCheating: isCheating,
        answers: isCheating ? {} : collectAnswersForProgress()
    };
    
    localStorage.removeItem(`examProgress_${examData.examCode}_${examData.studentName}_${examData.className}`);
    Swal.fire({ title: "Đang nộp bài...", html: "Vui lòng chờ...", allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    try {
        const submitCallable = functions.httpsCallable("submitExam");
        const result = await submitCallable(payload);
        const { score, detailedResults } = result.data;
        
        Swal.close();
        
        // ---- 3. HIỂN THỊ KẾT QUẢ TỔNG QUAN ----
        getEl("score").textContent = score.toFixed(2);
        getEl("student-name").textContent = examData.studentName;
        getEl("student-class").textContent = examData.className;
        getEl("exam-code").textContent = examData.examCode;
        
        getEl("result-container").style.display = 'flex';
        getEl("gradeBtn").style.display = 'none';
        getEl("timer-container").style.display = 'none';

        // ---- 4. [LOGIC CỐT LÕI] CẬP NHẬT GIAO DIỆN BÀI THI TẠI CHỖ ----
        const quizContainer = getEl("quiz");
        quizContainer.classList.add('is-result'); 

        document.querySelectorAll('#quiz .question').forEach(questionDiv => {
            const originalIndex = questionDiv.id.split('-')[1];
            const resultForQ = detailedResults[`q${originalIndex}`];

            if (!resultForQ) return; 

            questionDiv.querySelectorAll('input, .mc-option').forEach(el => {
                el.style.pointerEvents = 'none'; // Vô hiệu hóa click
                if (el.tagName === 'INPUT') el.disabled = true;
            });

            // A. Highlight cho câu TRẮC NGHIỆM (MC)
            questionDiv.querySelectorAll('.mc-option').forEach(optionEl => {
                const optionValue = optionEl.dataset.value;
                // Tô màu đỏ cho câu trả lời sai của người dùng
                if (resultForQ.userAnswer === optionValue && resultForQ.userAnswer !== resultForQ.correctAnswer) {
                    optionEl.classList.add('incorrect-answer-highlight');
                }
                // Luôn tô màu xanh cho đáp án đúng
                if (resultForQ.correctAnswer === optionValue) {
                    optionEl.classList.add('correct-answer-highlight');
                }
            });
            
            // ==========================================================
            // ==         BỔ SUNG LOGIC HIGHLIGHT CHO TABLE_TF         ==
            // ==========================================================
            const tableTF = questionDiv.querySelector('.table-tf-container');
            if (tableTF) {
                // Ví dụ: correctAnswer = 'TFTF'
                const correctAnsString = String(resultForQ.correctAnswer); 
                tableTF.querySelectorAll('tbody tr').forEach((row, rowIndex) => {
                    const radios = row.querySelectorAll('input[type="radio"]');
                    const labelT = radios[0].closest('label');
                    const labelF = radios[1].closest('label');
                    const subLabel = radios[0].name.split('_sub')[1]; // Lấy nhãn gốc, ví dụ 'a', 'b'...
                    
                    const userSubAnswer = resultForQ.userAnswer ? resultForQ.userAnswer[subLabel] : null; // 'T' or 'F'
                    const correctSubAnswer = correctAnsString[rowIndex]; // Lấy ký tự tương ứng

                    // Tô xanh đáp án đúng
                    if (correctSubAnswer === 'T') labelT.classList.add('correct-answer-highlight');
                    if (correctSubAnswer === 'F') labelF.classList.add('correct-answer-highlight');
                    
                    // Tô đỏ câu trả lời sai của người dùng
                    if (userSubAnswer && userSubAnswer !== correctSubAnswer) {
                         if (userSubAnswer === 'T') labelT.classList.add('incorrect-answer-highlight');
                         if (userSubAnswer === 'F') labelF.classList.add('incorrect-answer-highlight');
                    }
                });
            }
            // ==========================================================
            // ==       BỔ SUNG LOGIC HIGHLIGHT CHO CÂU ĐIỀN SỐ        ==
            // ==========================================================
            const numericInputDiv = questionDiv.querySelector('.numeric-option');
            if (numericInputDiv) {
                const inputEl = numericInputDiv.querySelector('input');
                // Tạo một span để hiển thị đáp án đúng
                const correctAnswerSpan = document.createElement('span');
                correctAnswerSpan.className = 'correct-answer-value';
                correctAnswerSpan.textContent = `Đáp án đúng: ${resultForQ.correctAnswer}`;
                numericInputDiv.appendChild(correctAnswerSpan);

                // Tô màu cho ô input dựa trên kết quả
                if (resultForQ.scoreEarned > 0) {
                    inputEl.classList.add('correct-answer-highlight');
                } else if(resultForQ.userAnswer && resultForQ.userAnswer.trim() !== '') {
                    inputEl.classList.add('incorrect-answer-highlight');
                }
            }

            // Hiển thị nút "Xem lời giải" nếu có
            const toggleBtn = questionDiv.querySelector('.toggle-explanation');
            if (toggleBtn) {
                toggleBtn.style.display = 'inline-block'; 
            }
        });
        
        getEl("result-container").scrollIntoView({ behavior: 'smooth' });
        sessionStorage.removeItem('currentExamData');

    } catch (error) {
        Swal.close();
        console.error("Lỗi nghiêm trọng trong hàm gradeQuiz:", error);
        Swal.fire("Lỗi", `Lỗi nộp bài hoặc hiển thị kết quả: ${error.message}`, "error");
    }
}
function showUnansweredDialog(unanswered){
    Swal.fire({ 
        icon:"info", 
        title:"Chưa làm xong", 
        html:`<p>Bạn chưa trả lời các câu sau:</p><ul style="text-align:left; max-height: 200px; overflow-y:auto;">${unanswered.map(q=>`<li>${q}</li>`).join("")}</ul>`, 
        confirmButtonText:"OK" 
    });
}
// --- QUẢN LÝ FORM (MODAL) ---
// File: public/js/main.js
// Thay thế hàm toggleExamFormFields cũ

function toggleExamFormFields() {
    const type = getEl("examFormType").value;
    const textFieldsContainer = getEl("textExamFields");
    const pdfFieldsContainer = getEl("pdfExamFields");

    // Lấy các trường input/textarea cần quản lý
    const examFormContent = getEl("examFormContent");
    const examFormPdfUrl = getEl("examFormPdfUrl");
    
    // Đảm bảo các phần tử tồn tại trước khi thao tác
    if (!textFieldsContainer || !pdfFieldsContainer || !examFormContent || !examFormPdfUrl) {
        return; // Thoát nếu không tìm thấy phần tử để tránh lỗi
    }

    if (type === 'PDF') {
        // --- KHI CHỌN LOẠI ĐỀ PDF ---
        textFieldsContainer.style.display = 'none';
        pdfFieldsContainer.style.display = 'block';

        // Tắt 'required' cho trường TEXT (vì nó bị ẩn)
        examFormContent.required = false;
        // Bật 'required' cho trường link PDF
        examFormPdfUrl.required = true;

    } else { // Loại đề là 'TEXT'
        // --- KHI CHỌN LOẠI ĐỀ TEXT ---
        textFieldsContainer.style.display = 'block';
        pdfFieldsContainer.style.display = 'none';
        
        // Bật 'required' cho trường TEXT
        examFormContent.required = true;
        // Tắt 'required' cho trường link PDF
        examFormPdfUrl.required = false;
    }
}

function showExamForm(exam = null) {
    const isEdit = !!exam;
    getEl("examFormTitle").textContent = isEdit ? `Sửa Đề thi: ${exam.examCode}` : "Thêm Đề thi mới";
    
    getEl("examForm").reset();
    
    getEl("examId").value = isEdit ? exam.id : "";
    getEl("examFormCode").value = isEdit ? exam.examCode : "";
    getEl("examFormTime").value = isEdit ? exam.timeLimit || 90 : 90;
    
    // Gán giá trị có điều kiện, nếu không có thì là chuỗi rỗng
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

function hideExamForm() {
    getEl("examFormModal").style.display = "none";
}
// File: public/js/main.js

// === THAY THẾ HOÀN TOÀN HÀM handleExamFormSubmit CŨ BẰNG HÀM NÀY ===
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
        // Thêm cờ cho phép xem lời giải
        allowSolutionView: getEl("allowSolutionView")?.checked ?? true,
    };

    // Xác định tên Cloud Function cần gọi
    let functionName = '';
    if (examType === 'TEXT' && useStorage) {
        functionName = examId ? "updateExamWithStorage" : "addExamWithStorage";
    } else {
        functionName = examId ? "updateExam" : "addExam";
    }
    
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


// --- GÁN CÁC HÀM NÀY VÀO WINDOW ---
window.toggleExamFormFields = toggleExamFormFields;
// --- GÁN HÀM VÀO WINDOW ---
window.signInWithGoogle = signInWithGoogle;
window.signOut = signOut;
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

// --- EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    const teacherAliasInput = getEl("teacherAlias");
    if (teacherAliasInput) {
        teacherAliasInput.addEventListener("change", initializeClassDataForStudent);
    }
});

let tabSwitchCount=0;
document.addEventListener("visibilitychange", function() {
    // Chỉ kích hoạt cảnh báo nếu đang ở màn hình làm bài (quiz) và tab vừa chuyển sang ẩn
    if (getEl("quiz") && getEl("quiz").style.display === 'block' && document.hidden) {
        tabSwitchCount++;
        if (tabSwitchCount >= 3) {
            Swal.fire({
                icon:"warning",
                title:"Chuyển tab quá nhiều!",
                text:"Bài thi của bạn sẽ tự động bị nộp với 0 điểm.",
                timer:3000, 
                timerProgressBar:true,
                showConfirmButton:false
            }).then(()=>gradeQuiz(true)); // Nộp bài với cờ isCheating = true
        } else {
            Swal.fire({
                icon:"warning",
                title:"Cảnh báo chuyển tab",
                text:`Bạn đã chuyển tab ${tabSwitchCount} lần. Chuyển 3 lần, bài thi sẽ tự động bị nộp.`,
                timer:2000,
                timerProgressBar:true,
                showConfirmButton:false
            });
        }
    }
});



