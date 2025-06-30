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
const showLoading = () => getEl("loading").style.display = "flex";
const hideLoading = () => getEl("loading").style.display = "none";
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

// Thay thế hàm updateTeacherUI cũ trong file public/js/main.js bằng hàm này
// === THAY THẾ TOÀN BỘ HÀM NÀY ===
// File: js/main.js

// === THAY THẾ TOÀN BỘ HÀM NÀY ===
async function updateTeacherUI(user) {
    showLoading();
    try {
        // 1. Gọi hàm onTeacherSignIn như cũ
        const res = await functions.httpsCallable("onTeacherSignIn")();
        const profile = res.data;

        // 2. [NÂNG CẤP QUAN TRỌNG] Xử lý ngày hết hạn một cách an toàn
        let trialDate = null;
        if (profile.trialEndDate) {
            // Trường hợp 1: Dữ liệu trả về từ Firestore (có .seconds)
            if (profile.trialEndDate.seconds) {
                trialDate = new Date(profile.trialEndDate.seconds * 1000);
            } 
            // Trường hợp 2: Dữ liệu vừa được tạo và trả về (có ._seconds)
            else if (profile.trialEndDate._seconds) {
                trialDate = new Date(profile.trialEndDate._seconds * 1000);
            }
            // Trường hợp 3: Fallback nếu nó là một chuỗi ngày tháng (ít xảy ra)
            else {
                trialDate = new Date(profile.trialEndDate);
            }
        }
        
        // 3. Tính số ngày còn lại
        const trialDays = trialDate ? Math.max(0, Math.ceil((trialDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0;
        
        // 4. Tạo HTML để hiển thị thông tin chính xác
        const userInfoHtml = `
            <p style="margin: 5px 0;"><strong>Tài khoản:</strong> ${user.displayName || user.email}</p>
            <p style="margin: 5px 0;"><strong>Alias:</strong> <span id="currentAliasDisplay" style="font-weight: bold; color: #007bff;">${profile.teacherAlias || "Chưa có"}</span></p>
            <p style="margin: 5px 0;"><strong>Trạng thái:</strong> 
                ${trialDays > 0
                    ? `<span style="color: #28a745; font-weight: bold;">Còn ${trialDays} ngày dùng thử</span>`
                    : `<span style="color: #dc3545; font-weight: bold;">Đã hết hạn dùng thử</span>`
                }
            </p>`;
        
        // 5. Cập nhật giao diện và các chức năng
        getEl("teacherInfo").innerHTML = userInfoHtml;
        getEl("teacherInfo").style.display = "block";
        getEl("teacherActions").style.display = "flex";
        getEl("teacherAliasInput").value = profile.teacherAlias || "";

        const teacherDashboardNameEl = getEl("teacherDashboardName");
        if (teacherDashboardNameEl) {
            teacherDashboardNameEl.textContent = user.displayName || user.email;
        }

        // Vô hiệu hóa chức năng nếu hết hạn
        if (trialDays <= 0) {
            // ... (phần code vô hiệu hóa chức năng giữ nguyên như cũ) ...
        }

    } catch (error) {
        Swal.fire("Lỗi", `Lỗi xử lý đăng nhập: ${error.message || "Không thể lấy thông tin người dùng."}`, "error");
        auth.signOut();
    } finally {
        hideLoading();
    }
}
async function updateTeacherUI_GGG(user) {
    showLoading();
    try {
        const res = await functions.httpsCallable("onTeacherSignIn")();
        const data = res.data;
        const trialDate = data.trialEndDate?.seconds ? new Date(data.trialEndDate.seconds * 1000) : (data.trialEndDate ? new Date(data.trialEndDate) : null);
        const trialDays = trialDate ? Math.max(0, Math.ceil((trialDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0;
        
        const userInfoHtml = `
            <p><strong>Tên:</strong> ${user.displayName || user.email}</p>
            <p><strong>Alias:</strong> <span id="currentAliasDisplay">${data.teacherAlias || "Chưa có"}</span></p>
            <p><strong>Trạng thái:</strong> ${trialDays > 0 ? `Còn ${trialDays} ngày dùng thử` : "Đã hết hạn"}</p>`;
        
        // Gán dữ liệu cho màn hình đăng nhập giáo viên
        getEl("teacherInfo").innerHTML = userInfoHtml;
        getEl("teacherInfo").style.display = "block";
        getEl("teacherActions").style.display = "flex";
        getEl("teacherAliasInput").value = data.teacherAlias || "";
        
        // === BẮT ĐẦU PHẦN SỬA LỖI ===
        // Chỉ gán dữ liệu cho Dashboard KHI các phần tử đó tồn tại
        const teacherDashboardNameEl = getEl("teacherDashboardName");
        if (teacherDashboardNameEl) {
            teacherDashboardNameEl.textContent = user.displayName || user.email;
        }

        const trialRemainingDaysEl = getEl("trialRemainingDays");
        if (trialRemainingDaysEl) {
            trialRemainingDaysEl.textContent = trialDays;
        }
        // === KẾT THÚC PHẦN SỬA LỖI ===

    } catch (error) {
        Swal.fire("Lỗi", `Lỗi xử lý đăng nhập: ${error.message || "Không thể lấy thông tin người dùng."}`, "error");
        auth.signOut();
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



async function editExam(examId) {
    showLoading();
    try {
        const result = await functions.httpsCallable("getTeacherFullExam")({ examId });
        showExamForm(result.data);
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
        const result = await functions.httpsCallable("loadExamForStudent")({ teacherAlias, examCode });
        hideLoading();

        if (!result.data || !result.data.content) {
            Swal.fire("Lỗi", `Không tìm thấy đề thi ${examCode} hoặc đề thi rỗng.`, "error");
            showStudentLoginScreen();
            return;
        }

        examData = { ...result.data, studentName, className, examCode, teacherAlias };
        sessionStorage.setItem('currentExamData', JSON.stringify(examData));
        showScreen('quiz');
        getEl("timer-container").style.display = 'block';
        getEl("gradeBtn").style.display = 'inline-flex';
        startTimer(examData.timeLimit || 90);
        loadQuiz(examData);
    } catch (error) {
        hideLoading();
        Swal.fire("Lỗi", `Lỗi tải đề thi: ${error.message}`, "error");
        showStudentLoginScreen();
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
            // ==     SỬA LẠI LOGIC HIỂN THỊ ĐỂ STYLE MÀU ĐÚNG       ==
            // ==========================================================
            
            // 1. Tạo tiêu đề câu hỏi MỚI với số thứ tự đã trộn
            const newQuestionTitle = `Câu ${newIndex + 1}:`;
            
            // 2. Lấy nội dung câu hỏi gốc và xóa bỏ phần "Câu N:" cũ đi
            let questionContent = parsedData.statement.replace(/^(Câu\s*\d+\s*[:.]?\s*)/i, '').trim();

            // 3. Kết hợp lại: Tiêu đề mới được bọc trong span để CSS tô màu cam
            statementDiv.innerHTML = `<span class="question-number-highlight">${newQuestionTitle}</span> ${processImagePlaceholders(questionContent)}`;
            
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
function loadQuiz_GOC(data) {
    const quizContainer = getEl("quiz");
    quizContainer.innerHTML = "";

    if (!data || typeof data.content !== 'string' || data.content.trim() === '') {
        Swal.fire("Lỗi nghiêm trọng", "Không thể tải nội dung đề thi. Dữ liệu không hợp lệ.", "error").then(showStudentLoginScreen);
        return;
    }

    const questionBlocks = data.content.trim().split(/\n\s*\n/);

    questionBlocks.forEach((questionBlock, i) => {
        const questionDiv = document.createElement("div");
        questionDiv.className = "question";
        questionDiv.id = `question-${i}`;
        
        // Gọi parseMCQuestion, nó sẽ xử lý tách lời giải và bọc "Câu xxx."
        const parsedData = parseMCQuestion(questionBlock);

        if (parsedData) { // Nếu parse thành công (MC, TABLE_TF, hoặc NUMERIC)
            const statementDiv = document.createElement("div");
            statementDiv.className = "question-statement";
            statementDiv.innerHTML = processImagePlaceholders(parsedData.statement); // statement đã được bọc span
            questionDiv.appendChild(statementDiv);

            if (parsedData.type === 'MC') {
                const optionsContainer = document.createElement('div');
                optionsContainer.innerHTML = renderNewMCOptions(parsedData, i);
                questionDiv.appendChild(optionsContainer.firstChild);
            } 
            else if (parsedData.type === 'TABLE_TF') {
                const table = document.createElement('table');
                table.className = 'table-tf-container';
                table.innerHTML = `<thead><tr><th>Phương án</th><th>Đúng</th><th>Sai</th></tr></thead>`;
                const tbody = document.createElement('tbody');
                parsedData.options.forEach((opt, optIndex) => {
                    const groupName = `q${i}_sub${optIndex}`;
                    const row = document.createElement('tr');
                    row.innerHTML = `<td>${opt.label}) ${opt.content}</td><td><label class="table-tf-radio"><input type="radio" name="${groupName}" value="T"></label></td><td><label class="table-tf-radio"><input type="radio" name="${groupName}" value="F"></label></td>`;
                    tbody.appendChild(row);
                });
                table.appendChild(tbody);
                questionDiv.appendChild(table);
                questionDiv.querySelectorAll('.table-tf-radio').forEach(label => {
                    label.onclick = function() {
                        this.closest('tr').querySelectorAll('.table-tf-radio').forEach(l => l.classList.remove('selected'));
                        this.classList.add('selected');
                        this.querySelector('input').checked = true;
                    }
                });
            }
            else if (parsedData.type === 'NUMERIC') { // Xử lý câu hỏi điền số
                const numDiv = document.createElement("div");
                numDiv.className = "numeric-option";
                const input = document.createElement("input");
                input.type = "text";
                input.name = `q${i}`;
                input.placeholder = "Nhập đáp số";
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
        renderKatexInElement(questionDiv); // Render KaTeX cho toàn bộ questionDiv
    });

    getEl("quiz").style.display = "block";
    getEl("gradeBtn").style.display = "inline-flex";
}
// public/js/main.js - Trong hàm gradeQuiz(isCheating)

function gradeQuiz_GOC(isCheating = false) {
    if (timerInterval) clearInterval(timerInterval);
    if (!examData) {
        const storedData = sessionStorage.getItem('currentExamData');
        if (storedData) { examData = JSON.parse(storedData); }
        else { Swal.fire("Lỗi", "Mất dữ liệu bài thi. Vui lòng thử lại.", "error").then(showStudentLoginScreen); return; }
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
        // Collect answers for new MC types
        document.querySelectorAll('.mc-option.selected[data-value]').forEach(opt => {
            const qIndex = opt.closest('.mc-options').dataset.questionIndex;
            payload.answers[`q${qIndex}`] = opt.dataset.value;
        });
        // Collect answers for TABLE_TF and NUMERIC (new and old)
        document.querySelectorAll("input[type='radio']:checked, input[type='text'][name^='q']").forEach(input => {
            // Check if this input name has already been handled by new MC above
            if (!payload.answers[input.name]) {
                payload.answers[input.name] = input.value.trim();
            }
        });
    }

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

async function handleExamFormSubmit() {
    const examId = getEl("examId").value;
    const examType = getEl("examFormType").value;

    const examData = {
        examType: examType,
        examCode: getEl("examFormCode").value.trim(),
        timeLimit: parseInt(getEl("examFormTime").value, 10),
        keys: getEl("examFormKeys").value.trim(),
        cores: getEl("examFormCores").value.trim(),
        content: getEl("examFormContent").value.trim(),
        examPdfUrl: getEl("examFormPdfUrl").value.trim(),
        solutionPdfUrl: getEl("examFormSolutionUrl").value.trim()
    };

    if (!examData.examCode || !examData.keys) {
        Swal.fire("Lỗi", "Mã đề và Đáp án là các trường bắt buộc.", "error");
        return;
    }
    if (examType === 'TEXT' && !examData.content) {
        Swal.fire("Lỗi", "Vui lòng nhập nội dung cho đề thi dạng Văn bản.", "error");
        return;
    }
    if (examType === 'PDF' && !examData.examPdfUrl) {
        Swal.fire("Lỗi", "Vui lòng nhập Link Đề thi PDF.", "error");
        return;
    }

    const functionName = examId ? "updateExam" : "addExam";
    const dataToSend = { examData };
    if (examId) dataToSend.examId = examId;

    showLoading();
    try {
        const result = await functions.httpsCallable(functionName)(dataToSend);
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



