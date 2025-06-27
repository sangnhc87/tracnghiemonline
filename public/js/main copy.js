// public/js/main.js (Phiên bản 100% Hoàn Chỉnh - Đã xử lý hình ảnh và hiển thị kết quả)

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

// --- HÀM XỬ LÝ PLACEHOLDER HÌNH ẢNH (Frontend) ---
function processImagePlaceholders(text) {
    if (!text || typeof text !== 'string') return text; // Kiểm tra an toàn: nếu không phải string thì trả về nguyên bản
    let processedText = text;
    processedText = processedText.replace(/sangnhc1/g, 'https://gitlab.com/nguyensangnhc/pic4web/-/raw/main/Hinh');
    processedText = processedText.replace(/sangnhc2/g, 'https://gitlab.com/nguyensangnhc/tikz4web/-/raw/main/Hinh');
    processedText = processedText.replace(/sangnhc3/g, 'https://gitlab.com/nguyensangnhc/tikz2png/-/raw/main/Hinh');
    processedText = processedText.replace(/sangnhc4/g, 'https://gitlab.com/nguyensangnhc/png2link/-/raw/main/Hinh');
    return processedText;
}

// --- HÀM RENDER KATEX ---
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
        } else if (screenId === "loading") {
            elToShow.style.display = "flex";
        } else if (screenId === "timer-container") {
            elToShow.style.display = "block";
        }
        else { // loginScreen, teacherLogin, result-container (mặc định là flex)
            elToShow.style.display = "flex";
        }
    }
}
const showLoading = () => getEl("loading").style.display = "flex";
const hideLoading = () => getEl("loading").style.display = "none";
const showStudentLoginScreen = () => showScreen("loginScreen");
const showTeacherLoginScreen = () => showScreen("teacherLogin");

// --- XÁC THỰC & QUẢN LÝ GIÁO VIÊN ---
auth.onAuthStateChanged(user => {
    if (user) {
        currentTeacherId = user.uid;
        showTeacherLoginScreen();
        updateTeacherUI(user);
    } else {
        currentTeacherId = null;
        getEl("teacherInfo").style.display = "none";
        getEl("teacherActions").style.display = "none";
        showStudentLoginScreen();
    }
});

async function updateTeacherUI(user) {
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
        
        getEl("teacherInfo").innerHTML = userInfoHtml;
        getEl("teacherInfo").style.display = "block";
        getEl("teacherActions").style.display = "flex";
        getEl("teacherAliasInput").value = data.teacherAlias || "";
        
        const teacherDashboardNameEl = getEl("teacherDashboardName");
        if (teacherDashboardNameEl) {
            teacherDashboardNameEl.textContent = user.displayName || user.email;
        }
        const trialRemainingDaysEl = getEl("trialRemainingDays");
        if (trialRemainingDaysEl) {
            trialRemainingDaysEl.textContent = trialDays;
        }

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
            const currentAliasDisplayEl = getEl("currentAliasDisplay");
            if (currentAliasDisplayEl) {
                currentAliasDisplayEl.textContent = alias;
            }
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
        const item = document.createElement("div");
        item.className = "list-item";
        item.innerHTML = `
            <div class="list-item-content">
                <div class="list-item-title">${exam.examCode}</div>
                <div class="list-item-details">${exam.questionTexts?.length || 0} câu - ${exam.timeLimit || 90} phút</div>
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
    elements.forEach(el => {
        if (el) el.innerHTML = `<div class="list-item">Lỗi tải dữ liệu.</div>`;
    });
}

// --- QUẢN LÝ FORM (MODAL) ---
function showExamForm(exam = null) {
    const isEdit = !!exam;
    getEl("examFormTitle").textContent = isEdit ? `Sửa Đề thi: ${exam.examCode}` : "Thêm Đề thi mới";
    getEl("examId").value = isEdit ? exam.id : "";
    getEl("examFormCode").value = isEdit ? exam.examCode : "";
    getEl("examFormTime").value = isEdit ? exam.timeLimit : 90;
    getEl("examFormKeys").value = isEdit && Array.isArray(exam.keys) ? exam.keys.join("|") : "";
    getEl("examFormCores").value = isEdit && Array.isArray(exam.cores) ? exam.cores.join("|") : "";
    let fullContent = "";
    if (isEdit && Array.isArray(exam.questionTexts)) {
        fullContent = exam.questionTexts.map((q, index) => {
            const e = exam.explanations[index];
            if (e && e.trim() !== '') {
                return `${q}\n\\begin{loigiai}\n${e}\n\\end{loigiai}`;
            }
            return q;
        }).join('\n\n');
    }
    getEl("examFormContent").value = fullContent;
    getEl("examFormModal").style.display = "flex";
}

function hideExamForm() { getEl("examFormModal").style.display = "none"; }

async function handleExamFormSubmit() {
    const examId = getEl("examId").value;
    const examData = {
        examCode: getEl("examFormCode").value.trim(),
        timeLimit: parseInt(getEl("examFormTime").value, 10),
        keys: getEl("examFormKeys").value.trim(),
        cores: getEl("examFormCores").value.trim(),
        content: getEl("examFormContent").value.trim(),
    };
    if (!examData.examCode || !examData.keys || !examData.content) {
        Swal.fire("Lỗi", "Các trường Mã đề, Đáp án, và Nội dung đề thi không được trống.", "error");
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
    const result = await Swal.fire({ title: 'Xác nhận xóa', text: `Bạn có chắc muốn xóa đề thi "${examCode}"? Thao tác này không thể hoàn tác.`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', cancelButtonText: 'Hủy', confirmButtonText: 'Xóa!' });
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
        // Kiểm tra data tổng thể
        if (!result.data || !Array.isArray(result.data.questionTexts) || result.data.questionTexts.length === 0) {
            Swal.fire("Lỗi", `Không tìm thấy đề thi ${examCode} của giáo viên này hoặc đề thi không có câu hỏi nào.`, "error");
            showStudentLoginScreen();
            return;
        }
        // Kiểm tra tính hợp lệ của questionTypes và tfCounts (phải là mảng)
        if (!Array.isArray(result.data.questionTypes) || !Array.isArray(result.data.tfCounts)) {
             Swal.fire("Lỗi", "Dữ liệu đề thi bị lỗi: Định dạng loại câu hỏi hoặc số ý nhỏ không hợp lệ.", "error");
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
    const endTime=Date.now()+minutes*60*1e3; 
    getEl("timer-container").style.display="block"; 
    updateTimerDisplay(Math.floor((endTime-Date.now())/1e3)); 
    timerInterval=setInterval(()=>{ 
        let timeRemaining=Math.max(0,Math.floor((endTime-Date.now())/1e3)); 
        updateTimerDisplay(timeRemaining); 
        if(timeRemaining<=0){
            clearInterval(timerInterval);
            Swal.fire({
                icon:"warning",
                title:"Hết giờ!",
                text:"Bài thi sẽ tự động nộp.",
                timer:3e3,
                timerProgressBar:true,
                showConfirmButton:false
            }).then(()=>gradeQuiz(false)); // Nộp bài bình thường khi hết giờ
        }
    },1e3)
}
function updateTimerDisplay(seconds){ 
    const m=Math.floor(seconds/60);
    const s=seconds%60; 
    getEl("timer").textContent=`Thời gian còn lại: ${m} phút ${s<10?"0":""}${s} giây`;
}

// Load giao diện đề thi
function loadQuiz(data){
    const quizContainer=getEl("quiz");
    quizContainer.innerHTML = ""; // Clear previous content

    data.questionTexts.forEach((rawQuestionText,i)=>{
        // Kiểm tra an toàn cho rawQuestionText
        const safeRawQuestionText = rawQuestionText || ''; 
        const questionText = processImagePlaceholders(safeRawQuestionText); // Xử lý placeholder hình ảnh cho đề bài
        const explanationText = processImagePlaceholders(data.explanations[i] || ''); // Xử lý placeholder lời giải

        const questionDiv=document.createElement("div");
        questionDiv.className="question";
        
        // Thêm số câu hỏi với class riêng để styling
        let questionNumberP = document.createElement("p");
        questionNumberP.className = "question-number";
        questionNumberP.textContent = `Câu ${i + 1}`;
        questionDiv.appendChild(questionNumberP);

        const statementDiv=document.createElement("div");
        statementDiv.className="question-statement";
        statementDiv.innerHTML=questionText; // Nội dung đề bài đã được xử lý placeholder
        questionDiv.appendChild(statementDiv);
        
        // Lấy loại câu hỏi từ dữ liệu đã load (kiểm tra an toàn)
        const type = data.questionTypes && data.questionTypes[i] ? data.questionTypes[i] : 'Unknown';

        if(type==="MC"){ 
            let mcOptions=document.createElement("div"); 
            mcOptions.className="mc-options"; 
            ["A","B","C","D"].forEach(o=>{ 
                let optDiv=document.createElement("div"); 
                optDiv.className="mc-option"; 
                optDiv.textContent=o; 
                let input=document.createElement("input"); 
                input.type="radio"; 
                input.name=`q${i}`; 
                input.value=o; 
                input.style.display="none"; // Ẩn input radio thực sự
                optDiv.appendChild(input); 
                optDiv.onclick=function() { // Sử dụng function() để this trỏ đúng
                    // Bỏ selected khỏi tất cả các option của câu hỏi này
                    document.querySelectorAll(`div[data-question-index='${i}'] .mc-option`).forEach(r=>r.classList.remove("selected"));
                    // Chọn option hiện tại
                    this.querySelector('input').checked=true;
                    this.classList.add("selected");
                }; 
                mcOptions.appendChild(optDiv);
            }); 
            questionDiv.appendChild(mcOptions); 
            questionDiv.setAttribute('data-question-index', i); // Để dễ dàng chọn các option của câu này
        }
        else if(type==="TF"){ 
            let tfOptionsContainer=document.createElement("div"); 
            tfOptionsContainer.className="tf-options-container"; // Container mới cho 4 nút kép TF (nằm ngang)
            
            // Lấy số ý nhỏ TF từ dữ liệu (kiểm tra an toàn)
            const numSubs = data.tfCounts && data.tfCounts[i] ? data.tfCounts[i] : 0; 
            for(let j=0;j<numSubs;j++){ 
                let tfBox=document.createElement("div"); 
                tfBox.className="tf-box"; 
                let group=`q${i}_sub${j}`; 
                tfBox.dataset.group=group; 
                
                let tBtn=document.createElement("div"); 
                tBtn.className="tf-btn"; 
                tBtn.textContent="T"; 
                tBtn.setAttribute('data-value', 'T'); // Thêm data-value
                let tInput=document.createElement("input"); 
                tInput.type="radio"; 
                tInput.name=group; 
                tInput.value="T"; 
                tInput.style.display="none"; 
                tBtn.appendChild(tInput);
                
                let fBtn=document.createElement("div"); 
                fBtn.className="tf-btn"; 
                fBtn.textContent="F"; 
                fBtn.setAttribute('data-value', 'F'); // Thêm data-value
                let fInput=document.createElement("input"); 
                fInput.type="radio"; 
                fInput.name=group; 
                fInput.value="F"; 
                fInput.style.display="none"; 
                fBtn.appendChild(fInput); 
                
                tBtn.onclick=function() { // Sử dụng function() để this trỏ đúng
                    document.querySelectorAll(`div[data-group='${group}'] .tf-btn`).forEach(r=>r.classList.remove("selected","T","F"));
                    this.querySelector('input').checked=true;
                    this.classList.add("selected","T");
                }; 
                fBtn.onclick=function() { // Sử dụng function() để this trỏ đúng
                    document.querySelectorAll(`div[data-group='${group}'] .tf-btn`).forEach(r=>r.classList.remove("selected","T","F"));
                    this.querySelector('input').checked=true;
                    this.classList.add("selected","F");
                }; 
                tfBox.appendChild(tBtn); 
                tfBox.appendChild(fBtn); 
                tfOptionsContainer.appendChild(tfBox); // Thêm vào container mới
            } 
            questionDiv.appendChild(tfOptionsContainer); // Thêm container mới vào questionDiv
            
            // Div hiển thị điểm TF (sẽ được cập nhật sau khi chấm)
            let tfGradeDisplay = document.createElement("div");
            tfGradeDisplay.className = "tf-grade";
            tfGradeDisplay.id = `tf-grade-${i}`; 
            questionDiv.appendChild(tfGradeDisplay);

        } else if(type==="Numeric"){ 
            let numDiv=document.createElement("div"); 
            numDiv.className="numeric-option"; 
            let input=document.createElement("input"); 
            input.type="text"; 
            input.name=`q${i}`; 
            input.placeholder="Nhập đáp số"; 
            numDiv.appendChild(input); 
            questionDiv.appendChild(numDiv); 
        }
        
        // Thêm nút và khung lời giải (ẩn ban đầu)
        if (explanationText.trim() !== '') {
            let toggleBtn = document.createElement("button");
            toggleBtn.className = "toggle-explanation btn"; 
            toggleBtn.textContent = "Xem lời giải";
            toggleBtn.style.display = 'none'; // Nút này sẽ hiển thị sau khi chấm điểm

            let expDiv = document.createElement("div");
            expDiv.className = "explanation hidden";
            expDiv.innerHTML = explanationText; // Nội dung lời giải đã được xử lý placeholder
            
            toggleBtn.onclick = function(){ 
                expDiv.classList.toggle("hidden"); 
                this.textContent = expDiv.classList.contains("hidden") ? "Xem lời giải" : "Ẩn lời giải"; 
            };
            questionDiv.appendChild(toggleBtn);
            questionDiv.appendChild(expDiv);
        }

        quizContainer.appendChild(questionDiv);
        renderKatexInElement(questionDiv); // Render KaTeX sau khi thêm vào DOM
    });
    document.getElementById("quiz").style.display = "block"; // Hiển thị khung quiz
    document.getElementById("gradeBtn").style.display = "inline-flex"; // Hiển thị nút nộp bài
}

// Hàm chấm điểm và gửi bài
function gradeQuiz(isCheating = false){
    if(timerInterval) clearInterval(timerInterval); // Dừng đồng hồ đếm ngược

    if (!examData) {
        const storedData = sessionStorage.getItem('currentExamData');
        if (storedData) { examData = JSON.parse(storedData); }
        else { 
            Swal.fire("Lỗi nghiêm trọng", "Mất dữ liệu bài thi. Vui lòng thử lại từ đầu.", "error").then(() => showStudentLoginScreen()); 
            return; 
        }
    }
    
    let unanswered = [];
    if(!isCheating){
        for(let i=0; i < (examData.questionTexts ? examData.questionTexts.length : 0); i++){ 
            // Lấy loại câu hỏi từ dữ liệu đã load (kiểm tra an toàn)
            const type = examData.questionTypes && examData.questionTypes[i] ? examData.questionTypes[i] : 'Unknown';

            // Lấy phần đầu của câu hỏi để hiển thị trong thông báo chưa trả lời
            // FIX LỖI: Kiểm tra examData.questionTexts[i] có tồn tại và là string không trước khi gọi split
            const currentQuestionText = examData.questionTexts && examData.questionTexts[i];
            const questionTitle = (currentQuestionText && typeof currentQuestionText === 'string') 
                                  ? currentQuestionText.split(':')[0] 
                                  : `Câu ${i + 1}`;

            if(type === "MC"){ 
                if(!document.querySelector(`input[name='q${i}']:checked`)) {
                    unanswered.push(questionTitle); 
                }
            }
            else if(type === "TF"){ 
                const numSubs = examData.tfCounts && examData.tfCounts[i] ? examData.tfCounts[i] : 0;
                for(let j=0; j < numSubs; j++){ 
                    if(!document.querySelector(`input[name='q${i}_sub${j}']:checked`)) {
                        unanswered.push(`${questionTitle} (Ý ${j + 1})`); 
                    }
                }
            }
            else if(type === "Numeric"){ 
                const input = document.querySelector(`input[name='q${i}']`); 
                if(!input || input.value.trim() === "") {
                    unanswered.push(questionTitle); 
                }
            }
        }
    }
    
    if(unanswered.length > 0 && !isCheating){ 
        showUnansweredDialog(unanswered); 
        return; 
    }
    
    let payload = { 
        teacherAlias: examData.teacherAlias, 
        examCode: examData.examCode, 
        studentName: examData.studentName, 
        className: examData.className, 
        isCheating: isCheating, 
        answers: {} 
    };
    if (!isCheating) { 
        document.querySelectorAll("input[type='radio']:checked, input[type='text'][name^='q']").forEach(input => { 
            if (input.type !== "text" || input.value.trim() !== "") { 
                payload.answers[input.name] = input.value.trim(); 
            } 
        }); 
    }
    
    Swal.fire({ 
        title:"Đang nộp bài...", 
        html: "Vui lòng chờ trong giây lát...", 
        allowOutsideClick:false, 
        didOpen:() => Swal.showLoading() 
    });

    functions.httpsCallable("submitExam")(payload).then(result => {
        Swal.close(); 
        sessionStorage.removeItem('currentExamData'); 

        const { score, examData: serverExamData, detailedResults } = result.data;
        
        getEl("score").textContent = score.toFixed(2);
        getEl("student-name").textContent = examData.studentName;
        getEl("student-class").textContent = examData.className;
        getEl("exam-code").textContent = examData.examCode;
        showScreen("result-container"); 
        
        const quizContainerForResults = getEl("quiz");
        quizContainerForResults.innerHTML = ''; 

        serverExamData.questionTexts.forEach((rawQuestionText, i) => { 
            // Kiểm tra an toàn cho rawQuestionText và explanationText
            const safeRawQuestionText = rawQuestionText || '';
            const questionText = processImagePlaceholders(safeRawQuestionText); 
            const explanationText = processImagePlaceholders(serverExamData.explanations[i] || ''); 

            const questionDiv = document.createElement("div");
            questionDiv.className = "question";
            questionDiv.innerHTML = `<p class="question-number">Câu ${i + 1}</p>`; 

            const statementDiv = document.createElement("div");
            statementDiv.className = "question-statement";
            statementDiv.innerHTML = questionText;
            questionDiv.appendChild(statementDiv);
            
            const resultForQ = detailedResults[`q${i}`];
            const type = resultForQ ? resultForQ.type : (examData.questionTypes && examData.questionTypes[i] ? examData.questionTypes[i] : 'Unknown'); 
            
            // Re-render options to show selected and correct answers
            if (type === "MC") {
                let mcOptions = document.createElement("div");
                mcOptions.className = "mc-options";
                ["A","B","C","D"].forEach(o => {
                    let optDiv = document.createElement("div");
                    optDiv.className = "mc-option";
                    optDiv.textContent = o;
                    // Apply selected class if user picked this option
                    if (resultForQ && resultForQ.userAnswer === o) {
                        optDiv.classList.add("selected");
                    }
                    // Highlight correct answer
                    if (resultForQ && resultForQ.correctAnswer === o) {
                        optDiv.classList.add("correct-answer-highlight");
                    }
                    // Highlight incorrect selected answer
                    if (optDiv.classList.contains("selected") && optDiv.textContent.trim() !== (resultForQ ? resultForQ.correctAnswer : '')) { // Kiểm tra an toàn
                        optDiv.classList.add("incorrect-answer-highlight");
                    }
                    mcOptions.appendChild(optDiv);
                });
                questionDiv.appendChild(mcOptions);
            } 
            else if (type === "TF") {
                let tfOptionsContainer=document.createElement("div"); 
                tfOptionsContainer.className="tf-options-container";
                const numSubs = serverExamData.keysStr && serverExamData.keysStr[i] ? serverExamData.keysStr[i].length : 0; 
                
                for(let j=0; j < numSubs; j++) {
                    let tfBox = document.createElement("div");
                    tfBox.className = "tf-box";
                    
                    let tBtn = document.createElement("div");
                    tBtn.className = "tf-btn";
                    tBtn.textContent = "T";
                    tBtn.setAttribute('data-value', 'T');
                    
                    let fBtn = document.createElement("div");
                    fBtn.className = "tf-btn";
                    fBtn.textContent = "F";
                    fBtn.setAttribute('data-value', 'F');
                    
                    // Apply selected class for user's answer
                    if (resultForQ && resultForQ.userAnswer && resultForQ.userAnswer[j] === 'T') { tBtn.classList.add("selected", "T"); } // Kiểm tra resultForQ.userAnswer
                    if (resultForQ && resultForQ.userAnswer && resultForQ.userAnswer[j] === 'F') { fBtn.classList.add("selected", "F"); }

                    // Apply correct/incorrect highlight
                    const correctAnswerSub = resultForQ && resultForQ.correctAnswer ? resultForQ.correctAnswer[j] : null;
                    if (tBtn.getAttribute('data-value') === correctAnswerSub) { tBtn.classList.add("correct-answer-highlight"); }
                    if (fBtn.getAttribute('data-value') === correctAnswerSub) { fBtn.classList.add("correct-answer-highlight"); }

                    if (tBtn.classList.contains("selected") && tBtn.getAttribute('data-value') !== correctAnswerSub) { tBtn.classList.add("incorrect-answer-highlight"); }
                    if (fBtn.classList.contains("selected") && fBtn.getAttribute('data-value') !== correctAnswerSub) { fBtn.classList.add("incorrect-answer-highlight"); }

                    tfBox.appendChild(tBtn);
                    tfBox.appendChild(fBtn);
                    tfOptionsContainer.appendChild(tfBox);
                }
                questionDiv.appendChild(tfOptionsContainer);
                
                // Div hiển thị điểm TF
                let tfGradeDisplay = document.createElement("div");
                tfGradeDisplay.className = "tf-grade";
                tfGradeDisplay.textContent = `Điểm ý nhỏ: ${resultForQ ? resultForQ.scoreEarned.toFixed(2) : '0.00'}`;
                questionDiv.appendChild(tfGradeDisplay);

            } 
            else if (type === "Numeric") {
                 let numDiv=document.createElement("div"); 
                 numDiv.className="numeric-option"; 
                 let input=document.createElement("input"); 
                 input.type="text"; 
                 input.name=`q${i}`; 
                 input.value = resultForQ ? resultForQ.userAnswer || '' : ''; 
                 input.readOnly = true; 
                 numDiv.appendChild(input); 
                 questionDiv.appendChild(numDiv);

                 // Highlight đúng/sai
                 if (resultForQ) {
                    if (resultForQ.scoreEarned > 0) {
                        numDiv.classList.add("correct-answer-highlight");
                    } else if (resultForQ.userAnswer && resultForQ.userAnswer.trim() !== '') { // Chỉ highlight sai nếu có trả lời
                        numDiv.classList.add("incorrect-answer-highlight");
                    }
                    // Hiển thị đáp án đúng
                    let answerSpan = document.createElement("span"); 
                    answerSpan.className = "correct-answer-value"; 
                    answerSpan.textContent = `Đáp án đúng: ${resultForQ.correctAnswer || 'N/A'}`; // Kiểm tra an toàn
                    numDiv.appendChild(answerSpan);
                 }
            }

            // Hiển thị nút lời giải (nếu có lời giải)
            if (explanationText.trim() !== '') {
                let toggleBtn = document.createElement("button");
                toggleBtn.className = "toggle-explanation btn";
                toggleBtn.textContent = "Xem lời giải";
                toggleBtn.style.display = 'block'; 

                let expDiv = document.createElement("div");
                expDiv.className = "explanation hidden";
                expDiv.innerHTML = explanationText; 
                
                toggleBtn.onclick = function(){ 
                    expDiv.classList.toggle("hidden"); 
                    this.textContent = expDiv.classList.contains("hidden") ? "Xem lời giải" : "Ẩn lời giải"; 
                };
                questionDiv.appendChild(toggleBtn);
                questionDiv.appendChild(expDiv);
            }
            
            quizContainerForResults.appendChild(questionDiv);
            renderKatexInElement(questionDiv); 
        });
        getEl("quiz").style.display = 'block'; 
        getEl("gradeBtn").style.display = 'none'; 
    }).catch(error => {
        Swal.close();
        Swal.fire("Lỗi", `Lỗi nộp bài: ${error.message || "Lỗi không xác định."}`, "error");
        showStudentLoginScreen();
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
// public/js/main.js

/**
 * Thu thập câu trả lời của học sinh và xây dựng đối tượng payload để gửi đi.
 * @param {boolean} isCheating - Cờ xác định có phải nộp bài do gian lận không.
 * @returns {object} Đối tượng payload chứa thông tin bài làm.
 */
function buildPayload(isCheating) {
    // 1. Khởi tạo đối tượng payload với các thông tin cơ bản
    const payload = {
        teacherAlias: currentExamData.teacherAlias,
        examCode: currentExamData.examCode,
        studentName: currentExamData.studentName,
        className: currentExamData.className,
        isCheating: isCheating,
        answers: {} // Khởi tạo một đối tượng rỗng để chứa các câu trả lời
    };

    // 2. Nếu không phải gian lận, tiến hành thu thập câu trả lời
    if (!isCheating) {
        // Sử dụng querySelectorAll để lấy tất cả các input đã được chọn hoặc có giá trị
        // - input[type='radio']:checked : Lấy tất cả các nút radio đã được tích.
        // - input[type='text'][name^='q'] : Lấy tất cả các input text có thuộc tính 'name' bắt đầu bằng 'q'.
        const answeredInputs = document.querySelectorAll(
            "input[type='radio']:checked, input[type='text'][name^='q']"
        );

        // Lặp qua từng input đã thu thập được
        answeredInputs.forEach(input => {
            // Đối với input text, chỉ lấy những input có nội dung
            if (input.type === 'text' && input.value.trim() === '') {
                return; // Bỏ qua nếu input text rỗng
            }
            
            // Thêm câu trả lời vào đối tượng answers
            // key là thuộc tính 'name' của input (ví dụ: 'q0', 'q1_sub0')
            // value là giá trị của input (ví dụ: 'A', 'T', '1.23')
            payload.answers[input.name] = input.value.trim();
        });
    }
    
    // 3. Trả về đối tượng payload hoàn chỉnh
    // Nếu isCheating là true, payload.answers sẽ là một đối tượng rỗng {}
    return payload;
}
// GÁN CÁC HÀM CẦN GỌI TỪ HTML VÀO ĐỐI TƯỢNG WINDOW
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