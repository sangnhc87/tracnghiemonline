// public/js/main.js (Phiên bản 100% Hoàn Chỉnh - Sửa lỗi tuyệt đối)

// --- KHỞI TẠO FIREBASE AN TOÀN ---
// KIỂM TRA TRƯỚC KHI KHỞI TẠO ĐỂ TRÁNH LỖI 'duplicate-app'
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
// Giờ đây, chúng ta chắc chắn rằng Firebase đã được khởi tạo đúng một lần.
const auth = firebase.auth();
const db = firebase.firestore();
const functions = firebase.functions();

// --- BIẾN TOÀN CỤC & HÀM TIỆN ÍCH ---
let examData = null, timerInterval = null, classData = {}, currentTeacherId = null;
const getEl = (id) => document.getElementById(id);

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
        elToShow.style.display = screenId.includes("Dashboard") || screenId.includes("quiz") ? "block" : "flex";
    }
}
const showLoading = () => getEl("loading").style.display = "flex";
const hideLoading = () => getEl("loading").style.display = "none";
const showStudentLoginScreen = () => showScreen("loginScreen"); // Hàm này đã được định nghĩa đúng
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
        showStudentLoginScreen(); // Sử dụng hàm đúng
    }
});

async function updateTeacherUI(user) {
    showLoading();
    try {
        const res = await functions.httpsCallable("onTeacherSignIn")();
        const data = res.data;
        const trialDate = data.trialEndDate?.seconds ? new Date(data.trialEndDate.seconds * 1000) : new Date(data.trialEndDate);
        const trialDays = Math.max(0, Math.ceil((trialDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
        const userInfoHtml = `
            <p><strong>Tên:</strong> ${user.displayName || user.email}</p>
            <p><strong>Alias:</strong> <span id="currentAliasDisplay">${data.teacherAlias || "Chưa có"}</span></p>
            <p><strong>Trạng thái:</strong> ${trialDays > 0 ? `Còn ${trialDays} ngày dùng thử` : "Đã hết hạn"}</p>`;
        
        getEl("teacherInfo").innerHTML = userInfoHtml;
        getEl("teacherInfo").style.display = "block";
        getEl("teacherActions").style.display = "flex";
        getEl("teacherAliasInput").value = data.teacherAlias || "";
        // Đảm bảo các phần tử này tồn tại trong HTML của Teacher Dashboard
        // (đã được bổ sung trong các câu trả lời trước)
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
        if (!result.data || !result.data.questionTexts || result.data.questionTexts.length === 0) {
            Swal.fire("Lỗi", `Không tìm thấy đề thi ${examCode} của giáo viên này.`, "error");
            showStudentLoginScreen(); // SỬA LỖI: Gọi hàm đúng là showStudentLoginScreen()
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
        showStudentLoginScreen(); // SỬA LỖI: Gọi hàm đúng là showStudentLoginScreen()
    }
}

function startTimer(minutes){ const endTime=Date.now()+minutes*60*1e3; getEl("timer-container").style.display="block"; updateTimerDisplay(Math.floor((endTime-Date.now())/1e3)); timerInterval=setInterval(()=>{ let timeRemaining=Math.max(0,Math.floor((endTime-Date.now())/1e3)); updateTimerDisplay(timeRemaining); if(timeRemaining<=0){clearInterval(timerInterval);Swal.fire({icon:"warning",title:"Hết giờ!",text:"Bài thi sẽ tự động nộp.",timer:3e3,timerProgressBar:true,showConfirmButton:false}).then(()=>gradeQuiz())}},1e3)}
function updateTimerDisplay(seconds){ const m=Math.floor(seconds/60),s=seconds%60; getEl("timer").textContent=`Thời gian còn lại: ${m} phút ${s<10?"0":""}${s} giây`}

function loadQuiz(data){
    const quizContainer=getEl("quiz");
    quizContainer.innerHTML="";
    data.questionTexts.forEach((questionText,i)=>{
        const questionDiv=document.createElement("div");
        questionDiv.className="question";
        const statementDiv=document.createElement("div");
        statementDiv.className="question-statement";
        statementDiv.innerHTML=questionText;
        questionDiv.appendChild(statementDiv);
        const type=data.questionTypes?data.questionTypes[i]:null;
        if(type==="MC"){ let mcOptions=document.createElement("div"); mcOptions.className="mc-options"; ["A","B","C","D"].forEach(o=>{ let optDiv=document.createElement("div"); optDiv.className="mc-option"; optDiv.textContent=o; let input=document.createElement("input"); input.type="radio"; input.name=`q${i}`; input.value=o; input.style.display="none"; optDiv.appendChild(input); optDiv.onclick=()=>{document.querySelectorAll(`div[data-question-index='${i}'] .mc-option`).forEach(r=>r.classList.remove("selected"));input.checked=true;optDiv.classList.add("selected")}; mcOptions.appendChild(optDiv) }); questionDiv.appendChild(mcOptions); questionDiv.setAttribute('data-question-index', i);}
        else if(type==="TF"){ let tfOptions=document.createElement("div"); tfOptions.className="tf-options"; const numSubs=data.tfCounts?data.tfCounts[i]:0; for(let j=0;j<numSubs;j++){ let box=document.createElement("div"); box.className="tf-box"; let group=`q${i}_sub${j}`; box.dataset.group=group; let tBtn=document.createElement("div"); tBtn.className="tf-btn"; tBtn.textContent="T"; let tInput=document.createElement("input"); tInput.type="radio"; tInput.name=group; tInput.value="T"; tInput.style.display="none"; tBtn.appendChild(tInput); let fBtn=document.createElement("div"); fBtn.className="tf-btn"; fBtn.textContent="F"; let fInput=document.createElement("input"); fInput.type="radio"; fInput.name=group; fInput.value="F"; fInput.style.display="none"; fBtn.appendChild(fInput); tBtn.onclick=()=>{document.querySelectorAll(`div[data-group='${group}'] .tf-btn`).forEach(r=>r.classList.remove("selected","T","F"));tInput.checked=true;tBtn.classList.add("selected","T")}; fBtn.onclick=()=>{document.querySelectorAll(`div[data-group='${group}'] .tf-btn`).forEach(r=>r.classList.remove("selected","T","F"));fInput.checked=true;fBtn.classList.add("selected","F")}; box.appendChild(tBtn); box.appendChild(fBtn); tfOptions.appendChild(box)} questionDiv.appendChild(tfOptions); }
        else if(type==="Numeric"){ let numDiv=document.createElement("div"); numDiv.className="numeric-option"; let input=document.createElement("input"); input.type="text"; input.name=`q${i}`; input.placeholder="Nhập đáp số"; numDiv.appendChild(input); questionDiv.appendChild(numDiv); }
        quizContainer.appendChild(questionDiv);
        renderKatexInElement(questionDiv);
    });
}

function gradeQuiz(isCheating = false){
    if(timerInterval) clearInterval(timerInterval);
    if (!examData) {
        const storedData = sessionStorage.getItem('currentExamData');
        if (storedData) { examData = JSON.parse(storedData); }
        else { Swal.fire("Lỗi nghiêm trọng", "Mất dữ liệu bài thi. Vui lòng thử lại từ đầu.", "error").then(() => showStudentLoginScreen()); return; } // SỬA LỖI: Gọi hàm đúng
    }
    let unanswered=[];
    if(!isCheating){
        for(let i=0; i < examData.questionTexts.length; i++){
            const type = examData.questionTypes[i];
            if(type === "MC"){ if(!document.querySelector(`input[name='q${i}']:checked`)) unanswered.push(examData.questionTexts[i].split(':')[0] || `Câu ${i + 1}`); }
            else if(type === "TF"){ for(let j=0; j < examData.tfCounts[i]; j++){ if(!document.querySelector(`input[name='q${i}_sub${j}']:checked`)) unanswered.push(`${examData.questionTexts[i].split(':')[0]} (Ô ${j + 1})`); } }
            else if(type === "Numeric"){ const input = document.querySelector(`input[name='q${i}']`); if(!input || input.value.trim() === "") unanswered.push(examData.questionTexts[i].split(':')[0] || `Câu ${i + 1}`); }
        }
    }
    if(unanswered.length > 0){ showUnansweredDialog(unanswered); return; }
    let payload = { teacherAlias: examData.teacherAlias, examCode: examData.examCode, studentName: examData.studentName, className: examData.className, isCheating: isCheating, answers: {} };
    if (!isCheating) { document.querySelectorAll("input[type='radio']:checked, input[type='text'][name^='q']").forEach(input => { if (input.type !== "text" || input.value.trim() !== "") { payload.answers[input.name] = input.value.trim(); } }); }
    Swal.fire({ title:"Đang nộp bài...", html: "Vui lòng chờ trong giây lát...", allowOutsideClick:false, didOpen:() => Swal.showLoading() });
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
        serverExamData.questionTexts.forEach((questionText, i) => { // Use questionTexts from serverExamData
            const questionDiv = document.createElement("div");
            questionDiv.className = "question";
            const statementDiv = document.createElement("div");
            statementDiv.className = "question-statement";
            statementDiv.innerHTML = questionText;
            questionDiv.appendChild(statementDiv);
            
            // Logic hiển thị đáp án đúng/sai, đáp án của học sinh
            const resultForQ = detailedResults[`q${i}`];
            if (resultForQ) {
                const answerDiv = document.createElement("div");
                answerDiv.className = "answer-feedback";
                let feedbackHtml = `<strong>Đáp án của bạn:</strong> `;
                
                // Format user answer based on type
                if (resultForQ.type === "TF") {
                    feedbackHtml += resultForQ.userAnswer.join(", ") || "Chưa trả lời";
                } else if (resultForQ.type === "Numeric") {
                    feedbackHtml += resultForQ.userAnswer || "Chưa trả lời";
                } else { // MC
                    feedbackHtml += resultForQ.userAnswer || "Chưa trả lời";
                }
                
                feedbackHtml += `<br><strong>Đáp án đúng:</strong> `;
                if (resultForQ.type === "TF") {
                    feedbackHtml += resultForQ.correctAnswer.split('').join(", "); // For TF, split 'TF' to 'T, F'
                } else {
                    feedbackHtml += resultForQ.correctAnswer;
                }

                if (resultForQ.scoreEarned > 0) {
                    answerDiv.classList.add("correct");
                    feedbackHtml += `<br><span class="score-earned">(${resultForQ.scoreEarned} điểm)</span>`;
                } else {
                    answerDiv.classList.add("incorrect");
                }
                answerDiv.innerHTML = feedbackHtml;
                questionDiv.appendChild(answerDiv);
            }

            const explanationText = serverExamData.explanations[i];
            if (explanationText && explanationText.trim() !== '') {
                let toggleBtn = document.createElement("button");
                toggleBtn.className = "toggle-explanation btn";
                toggleBtn.textContent = "Xem lời giải";
                let expDiv = document.createElement("div");
                expDiv.className = "explanation hidden";
                expDiv.innerHTML = explanationText;
                toggleBtn.onclick = function(){ expDiv.classList.toggle("hidden"); this.textContent = expDiv.classList.contains("hidden") ? "Xem lời giải" : "Ẩn lời giải"; };
                questionDiv.appendChild(toggleBtn);
                questionDiv.appendChild(expDiv);
            }
            quizContainerForResults.appendChild(questionDiv);
            renderKatexInElement(questionDiv);
        });
        getEl("quiz").style.display = 'block'; // Hiển thị chi tiết bài làm sau khi chấm điểm
    }).catch(error => {
        Swal.close();
        Swal.fire("Lỗi", `Lỗi nộp bài: ${error.message}`, "error");
        showStudentLoginScreen(); // SỬA LỖI: Gọi hàm đúng
    });
}

function showUnansweredDialog(unanswered){
    Swal.fire({ icon:"info", title:"Chưa làm xong", html:`<p>Bạn chưa trả lời các câu sau:</p><ul style="text-align:left; max-height: 200px; overflow-y:auto;">${unanswered.map(q=>`<li>${q}</li>`).join("")}</ul>`, confirmButtonText:"OK" });
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
    // Chỉ thêm listener này nếu phần tử #teacherAlias tồn tại,
    // đảm bảo không gây lỗi nếu trang được tải ở màn hình khác.
    const teacherAliasInput = getEl("teacherAlias");
    if (teacherAliasInput) {
        teacherAliasInput.addEventListener("change", initializeClassDataForStudent);
    }
});

let tabSwitchCount=0;
document.addEventListener("visibilitychange", function() {
    // Chỉ kích hoạt cảnh báo nếu đang ở màn hình làm bài (quiz)
    if (getEl("quiz").style.display !== 'block' || !document.hidden) return;
    
    tabSwitchCount++;
    if (tabSwitchCount >= 3) {
        Swal.fire({
            icon:"warning",
            title:"Chuyển tab quá nhiều!",
            text:"Bài thi của bạn sẽ tự động bị nộp với 0 điểm.",
            timer:3000, // Display for 3 seconds
            timerProgressBar:true,
            showConfirmButton:false
        }).then(()=>gradeQuiz(true)); // Nộp bài với cờ isCheating = true
    } else {
        Swal.fire({
            icon:"warning",
            title:"Cảnh báo chuyển tab",
            text:`Bạn đã chuyển tab ${tabSwitchCount} lần. Chuyển 3 lần, bài thi sẽ tự động bị nộp.`,
            timer:2000, // Display for 2 seconds
            timerProgressBar:true,
            showConfirmButton:false
        });
    }
});