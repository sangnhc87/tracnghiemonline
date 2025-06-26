// public/js/main.js (Phiên bản chuyên gia - Hoàn thiện)

// --- BIẾN TOÀN CỤC & HÀM TIỆN ÍCH ---
let examData = null, timerInterval = null, classData = {}, currentTeacherId = null;
const getEl = (id) => document.getElementById(id);

// --- KHỞI TẠO FIREBASE ---
const firebaseConfig = {
    apiKey: "AIzaSyCaybcU4Er3FM3C7mh_rCun7tLXx3uCfa8",
    authDomain: "sangnhc.firebaseapp.com",
    projectId: "sangnhc",
    storageBucket: "sangnhc.appspot.com",
    messagingSenderId: "1066567815353",
    appId: "1:1066567815353:web:ae68c784b9e964a6778b68"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth(), db = firebase.firestore(), functions = firebase.functions();

// --- QUẢN LÝ GIAO DIỆN (UI) ---
function showScreen(screenId) {
    const screens = ["loginScreen", "teacherLogin", "loading", "timer-container", "quiz", "gradeBtn", "result-container", "teacherDashboard"];
    screens.forEach(id => {
        const el = getEl(id);
        if (el) el.style.display = "none";
    });
    const elToShow = getEl(screenId);
    if (elToShow) {
        // Dashboard dùng display: block, các container khác dùng flex
        elToShow.style.display = screenId.includes("Dashboard") || screenId.includes("quiz") ? "block" : "flex";
    }
}
const showLoading = () => getEl("loading").style.display = "flex";
const hideLoading = () => getEl("loading").style.display = "none";
const showLoginScreen = () => showScreen("loginScreen");
const showTeacherLogin = () => showScreen("teacherLogin");

// --- XÁC THỰC & QUẢN LÝ GIÁO VIÊN ---
auth.onAuthStateChanged(user => {
    if (user) {
        currentTeacherId = user.uid;
        showLoading();
        functions.httpsCallable("onTeacherSignIn")()
            .then(res => {
                const data = res.data;
                const trialDays = Math.max(0, Math.ceil((new Date(data.trialEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
                const userInfoHtml = `
                    <p><strong>Tên:</strong> ${user.displayName || user.email}</p>
                    <p><strong>Alias:</strong> <span id="currentAliasDisplay">${data.teacherAlias || "Chưa có"}</span></p>
                    <p><strong>Trạng thái:</strong> ${trialDays > 0 ? `Còn ${trialDays} ngày dùng thử` : "Đã hết hạn"}</p>`;

                getEl("teacherInfo").innerHTML = userInfoHtml;
                getEl("teacherInfo").style.display = "block";
                getEl("teacherActions").style.display = "flex";
                getEl("teacherAliasInput").value = data.teacherAlias || "";
                getEl("teacherDashboardName").textContent = user.displayName || user.email;
                getEl("trialRemainingDays").textContent = trialDays;
                
                showTeacherLogin();
            })
            .catch(error => {
                Swal.fire("Lỗi", `Lỗi xử lý đăng nhập: ${error.message || error.details}`, "error");
                auth.signOut();
            })
            .finally(hideLoading);
    } else {
        currentTeacherId = null;
        getEl("teacherInfo").style.display = "none";
        getEl("teacherActions").style.display = "none";
        showLoginScreen();
    }
});

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
        .catch(error => Swal.fire("Lỗi", `Lỗi cập nhật Alias: ${error.message || error.details}`, "error"))
        .finally(hideLoading);
}

// --- DASHBOARD GIÁO VIÊN ---
function showTeacherDashboard() {
    if (!currentTeacherId) return;
    showScreen("teacherDashboard");
    loadTeacherDataForDashboard();
    loadSubmissions();
}
const hideTeacherDashboard = () => showTeacherLogin();

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
    exams.forEach(exam => {
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
    classes.forEach(cls => {
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
    Swal.fire("Lỗi", `Lỗi tải dữ liệu: ${error.message || error.details}`, "error");
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
    getEl("examFormKeys").value = isEdit && exam.keys ? exam.keys.join("|") : "";
    getEl("examFormCores").value = isEdit && exam.cores ? exam.cores.join("|") : "";
    getEl("examFormQuestions").value = isEdit && exam.questionTexts ? exam.questionTexts.join("\n") : "";
    getEl("examFormExplanations").value = isEdit && exam.explanations ? exam.explanations.join("\n") : "";
    getEl("examFormModal").style.display = "flex";
}
const hideExamForm = () => getEl("examFormModal").style.display = "none";

async function handleExamFormSubmit() {
    const examId = getEl("examId").value;
    const examData = {
        examCode: getEl("examFormCode").value.trim(),
        timeLimit: parseInt(getEl("examFormTime").value, 10),
        keys: getEl("examFormKeys").value.trim(),
        cores: getEl("examFormCores").value.trim(),
        questionTexts: getEl("examFormQuestions").value.trim(),
        explanations: getEl("examFormExplanations").value.trim()
    };

    if (!examData.examCode || !examData.keys || !examData.questionTexts) {
        Swal.fire("Lỗi", "Các trường Mã đề, Đáp án, và Nội dung câu hỏi không được trống.", "error");
        return;
    }

    // Xác định hàm cần gọi dựa trên việc có examId hay không
    const functionName = examId ? "updateExam" : "addExam";
    const dataToSend = examId ? { examId, examData } : { examData };
    
    showLoading();
    try {
        const result = await functions.httpsCallable(functionName)(dataToSend);
        Swal.fire("Thành công!", result.data.message, "success");
        hideExamForm();
        loadTeacherDataForDashboard();
    } catch (error) {
        Swal.fire("Lỗi", `Lỗi khi lưu đề thi: ${error.message || error.details}`, "error");
    } finally {
        hideLoading();
    }
}

async function editExam(examId) {
    showLoading();
    try {
        // Cần đảm bảo bạn có Cloud Function 'getTeacherFullExam'
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
            Swal.fire("Lỗi", `Lỗi khi xóa: ${error.message || error.details}`, "error");
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
    getEl("classFormStudents").value = isEdit && classInfo.students ? classInfo.students.join("\n") : "";
    getEl("classFormModal").style.display = "flex";
}
const hideClassForm = () => getEl("classFormModal").style.display = "none";

async function handleClassFormSubmit() {
    const classId = getEl("classId").value;
    const classData = {
        name: getEl("classFormName").value.trim(),
        students: getEl("classFormStudents").value.trim().split(/\r?\n/).filter(s => s.trim() !== "")
    };

    if (!classData.name) {
        Swal.fire("Lỗi", "Tên lớp không được trống.", "error");
        return;
    }
    
    const functionName = classId ? "updateClass" : "addClass";
    const dataToSend = classId ? { classId, classData } : { classData };

    showLoading();
    try {
        const result = await functions.httpsCallable(functionName)(dataToSend);
        Swal.fire("Thành công!", result.data.message, "success");
        hideClassForm();
        loadTeacherDataForDashboard();
    } catch (error) {
        Swal.fire("Lỗi", `Lỗi khi lưu lớp học: ${error.message || error.details}`, "error");
    } finally {
        hideLoading();
    }
}

async function editClass(classId) {
    showLoading();
    try {
        // Cần đảm bảo bạn có Cloud Function 'getTeacherFullClass'
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
            Swal.fire("Lỗi", `Lỗi khi xóa: ${error.message || error.details}`, "error");
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
        Swal.fire("Lỗi", `Lỗi tải danh sách lớp: ${error.message || error.details}`, "error");
    }
}

function populateClassSelect() {
    const select = getEl("classSelect");
    select.innerHTML = `<option value="">-- Chọn lớp --</option>`;
    Object.keys(classData).sort().forEach(className => {
        select.add(new Option(className, className));
    });
    select.onchange = updateStudentList;
    updateStudentList(); // Reset student list
}

function updateStudentList() {
    const studentSelect = getEl("studentSelect");
    const selectedClass = getEl("classSelect").value;
    studentSelect.innerHTML = `<option value="">-- Chọn tên --</option>`;
    if (selectedClass && classData[selectedClass]) {
        classData[selectedClass].sort().forEach(student => {
            studentSelect.add(new Option(student, student));
        });
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
            showLoginScreen();
            return;
        }
        examData = {
            ...result.data,
            studentName,
            className,
            examCode,
            teacherAlias
        };
        showScreen('quiz');
        getEl("timer-container").style.display = 'block';
        getEl("gradeBtn").style.display = 'inline-flex';
        startTimer(examData.timeLimit || 90);
        loadQuiz(examData);
    } catch (error) {
        hideLoading();
        Swal.fire("Lỗi", `Lỗi tải đề thi: ${error.message || error.details}`, "error");
        showLoginScreen();
    }
}
function startTimer(minutes){ const endTime=Date.now()+minutes*60*1e3; getEl("timer-container").style.display="block"; updateTimerDisplay(Math.floor((endTime-Date.now())/1e3)); timerInterval=setInterval(()=>{ let timeRemaining=Math.max(0,Math.floor((endTime-Date.now())/1e3)); updateTimerDisplay(timeRemaining); if(timeRemaining<=0){clearInterval(timerInterval);Swal.fire({icon:"warning",title:"Hết giờ!",text:"Bài thi sẽ tự động nộp.",timer:3e3,timerProgressBar:!0,showConfirmButton:!1}).then(()=>gradeQuiz())}},1e3)}
function updateTimerDisplay(seconds){ const m=Math.floor(seconds/60),s=seconds%60; getEl("timer").textContent=`Thời gian còn lại: ${m} phút ${s<10?"0":""}${s} giây`}
// Các hàm loadQuiz, gradeQuiz, showUnansweredDialog và anti-cheat không cần thay đổi nhiều
// vì chúng đã tự quản lý các phần tử con bên trong #quiz, không ảnh hưởng tới cấu trúc chung.
// Sao chép chúng từ file cũ vào đây.
function loadQuiz(data){ const quizContainer=getEl("quiz"); quizContainer.innerHTML=""; data.questionTexts.forEach((questionText,i)=>{ const questionDiv=document.createElement("div"); questionDiv.className="question"; questionDiv.innerHTML=`<p>Câu ${i+1}</p>`; const statementDiv=document.createElement("div"); statementDiv.className="question-statement"; statementDiv.innerHTML=questionText; questionDiv.appendChild(statementDiv); const type=data.questionTypes?data.questionTypes[i]:null; if(type==="MC"){ let mcOptions=document.createElement("div"); mcOptions.className="mc-options"; ["A","B","C","D"].forEach(o=>{ let optDiv=document.createElement("div"); optDiv.className="mc-option"; optDiv.textContent=o; let input=document.createElement("input"); input.type="radio"; input.name=`q${i}`; input.value=o; optDiv.appendChild(input); optDiv.onclick=()=>{document.querySelectorAll(`input[name='q${i}']`).forEach(r=>r.parentElement.classList.remove("selected"));input.checked=!0;optDiv.classList.add("selected")}; mcOptions.appendChild(optDiv) }); questionDiv.appendChild(mcOptions)}else if(type==="TF"){ let tfOptions=document.createElement("div"); tfOptions.className="tf-options"; const numSubs=data.tfCounts?data.tfCounts[i]:0; for(let j=0;j<numSubs;j++){ let box=document.createElement("div"); box.className="tf-box"; let group=`q${i}_sub${j}`; box.dataset.group=group; let tBtn=document.createElement("div"); tBtn.className="tf-btn"; tBtn.textContent="T"; let tInput=document.createElement("input"); tInput.type="radio"; tInput.name=group; tInput.value="T"; tBtn.appendChild(tInput); let fBtn=document.createElement("div"); fBtn.className="tf-btn"; fBtn.textContent="F"; let fInput=document.createElement("input"); fInput.type="radio"; fInput.name=group; fInput.value="F"; fBtn.appendChild(fInput); tBtn.onclick=()=>{document.querySelectorAll(`input[name='${group}']`).forEach(r=>r.parentElement.classList.remove("selected","T","F"));tInput.checked=!0;tBtn.classList.add("selected","T")}; fBtn.onclick=()=>{document.querySelectorAll(`input[name='${group}']`).forEach(r=>r.parentElement.classList.remove("selected","T","F"));fInput.checked=!0;fBtn.classList.add("selected","F")}; box.appendChild(tBtn); box.appendChild(fBtn); tfOptions.appendChild(box)} questionDiv.appendChild(tfOptions); let gradeDiv=document.createElement("div"); gradeDiv.className="tf-grade"; gradeDiv.id=`tf-grade-${i}`; questionDiv.appendChild(gradeDiv)}else if(type==="Numeric"){ let numDiv=document.createElement("div"); numDiv.className="numeric-option"; let input=document.createElement("input"); input.type="text"; input.name=`q${i}`; input.placeholder="Đáp số"; numDiv.appendChild(input); questionDiv.appendChild(numDiv)} let toggleBtn=document.createElement("button"); toggleBtn.className="toggle-explanation btn"; toggleBtn.textContent="Xem lời giải"; toggleBtn.style.display="none"; toggleBtn.onclick=function(){const exp=this.nextElementSibling; exp.classList.toggle("hidden"); this.textContent=exp.classList.contains("hidden")?"Xem lời giải":"Ẩn lời giải"}; let expDiv=document.createElement("div"); expDiv.className="explanation hidden"; expDiv.innerHTML=data.explanations[i]||""; questionDiv.appendChild(toggleBtn); questionDiv.appendChild(expDiv); quizContainer.appendChild(questionDiv) }); getEl("quiz").style.display="block"; getEl("gradeBtn").style.display="inline-flex"}
function gradeQuiz(){ if(timerInterval)clearInterval(timerInterval); let unanswered=[]; for(let i=0;i<examData.questionTexts.length;i++){ const type=examData.questionTypes?examData.questionTypes[i]:null; if(type==="MC"){if(!document.querySelector(`input[name='q${i}']:checked`))unanswered.push(`Câu ${i+1}`)}else if(type==="TF"){const numSubs=examData.tfCounts?examData.tfCounts[i]:0; for(let j=0;j<numSubs;j++){if(!document.querySelector(`input[name='q${i}_sub${j}']:checked`))unanswered.push(`Câu ${i+1} (Ô ${j+1})`)}}else if(type==="Numeric"){const input=document.querySelector(`input[name='q${i}']`);if(!input||input.value.trim()==="")unanswered.push(`Câu ${i+1}`)}} if(unanswered.length>0){showUnansweredDialog(unanswered);return} let answers={teacherAlias:examData.teacherAlias,examCode:examData.examCode,studentName:examData.studentName,className:examData.className}; document.querySelectorAll("input[type='radio']:checked, input[type='text'][name^='q']").forEach(input=>{if(input.type!=="text"||input.value.trim()!=="")answers[input.name]=input.value.trim()}); Swal.fire({title:"Đang nộp bài...",html: "Vui lòng chờ trong giây lát...",allowOutsideClick:!1,didOpen:()=>Swal.showLoading()}); functions.httpsCallable("submitExam")(answers).then(result=>{Swal.close(); const {score:submittedScore, examData:serverExamData, detailedResults}=result.data; getEl("score").textContent=submittedScore.toFixed(2); getEl("student-name").textContent=examData.studentName; getEl("student-class").textContent=examData.className; getEl("exam-code").textContent=examData.examCode; showScreen("result-container"); const quizContainerForResults = getEl("quiz"); quizContainerForResults.innerHTML = ''; serverExamData.keysStr.forEach((key, i) => { const questionDiv = document.createElement("div"); questionDiv.className = "question"; questionDiv.innerHTML = `<p>Câu ${i+1}</p><div class="question-statement">${examData.questionTexts[i]}</div>`; const resultForQ=detailedResults[`q${i}`]; if(resultForQ){if(resultForQ.type==="MC"){let mcOptions=document.createElement("div");mcOptions.className="mc-options";["A","B","C","D"].forEach(o=>{let optDiv=document.createElement("div");optDiv.className="mc-option";optDiv.textContent=o;if(o===resultForQ.correctAnswer)optDiv.classList.add("correct-answer");if(o===resultForQ.userAnswer)optDiv.classList.add("selected");mcOptions.appendChild(optDiv)});questionDiv.appendChild(mcOptions)}else if(resultForQ.type==="TF"){let tfOptions=document.createElement("div");tfOptions.className="tf-options";const tfScores=(serverExamData.coreStr[1]||"").split(",").map(x=>parseFloat(x));let countCorrect=0;for(let j=0;j<resultForQ.correctAnswer.length;j++){if(resultForQ.userAnswer&&resultForQ.userAnswer[j]===resultForQ.correctAnswer[j])countCorrect++;let box=document.createElement("div");box.className="tf-box";["T","F"].forEach(val=>{let btn=document.createElement("div");btn.className="tf-btn";btn.textContent=val;if(val===resultForQ.correctAnswer[j])btn.classList.add("correct-answer");if(val===resultForQ.userAnswer[j])btn.classList.add("selected",val);box.appendChild(btn)});tfOptions.appendChild(box)}questionDiv.appendChild(tfOptions);let gradeDiv=document.createElement("div");gradeDiv.className="tf-grade";gradeDiv.textContent=`Điểm T-F: ${countCorrect>=1&&countCorrect<=tfScores.length?["A","B","C","D"][countCorrect-1]:"F"}`;questionDiv.appendChild(gradeDiv)}else if(resultForQ.type==="Numeric"){let numDiv=document.createElement("div");numDiv.className="numeric-option";numDiv.textContent=resultForQ.userAnswer||"";if(parseFloat(resultForQ.userAnswer)===parseFloat(resultForQ.correctAnswer))numDiv.classList.add("correct");let ansSpan=document.createElement("span");ansSpan.className="correct-answer-display";ansSpan.textContent=` Đáp án: ${resultForQ.correctAnswer}`;numDiv.appendChild(ansSpan);questionDiv.appendChild(numDiv)}} let toggleBtn=document.createElement("button");toggleBtn.className="toggle-explanation btn";toggleBtn.textContent="Xem lời giải";toggleBtn.onclick=function(){const exp=this.nextElementSibling;exp.classList.toggle("hidden");this.textContent=exp.classList.contains("hidden")?"Xem lời giải":"Ẩn lời giải"};let expDiv=document.createElement("div");expDiv.className="explanation hidden";expDiv.innerHTML=serverExamData.explanations[i]||"";questionDiv.appendChild(toggleBtn);questionDiv.appendChild(expDiv);quizContainerForResults.appendChild(questionDiv)}); getEl("quiz").style.display="block";}).catch(error=>{Swal.close(); Swal.fire("Lỗi",`Lỗi nộp bài: ${error.message||error.details}`,"error"); showLoginScreen()});}
function showUnansweredDialog(unanswered){Swal.fire({icon:"info",title:"Chưa làm xong",html:`<p>Bạn chưa trả lời các câu sau:</p><ul style="text-align:left; max-height: 200px; overflow-y:auto;">${unanswered.map(q=>`<li>${q}</li>`).join("")}</ul>`,confirmButtonText:"OK"})}
// --- EVENT LISTENERS ---
window.onload = function() {
    getEl("teacherAlias").addEventListener("change", initializeClassDataForStudent);
};

let tabSwitchCount=0;
document.addEventListener("visibilitychange", function() {
    // Chỉ kích hoạt khi đang ở trong màn hình làm bài
    if (getEl("quiz").style.display !== 'block' || !document.hidden) return;

    tabSwitchCount++;
    if (tabSwitchCount >= 3) {
        Swal.fire({icon:"warning",title:"Chuyển tab quá nhiều!",text:"Bài thi của bạn sẽ bị hủy và nộp với 0 điểm.",timer:3e3,timerProgressBar:true,showConfirmButton:false})
        .then(()=>gradeQuiz(true)); // Thêm cờ để biết là nộp do gian lận
    } else {
        Swal.fire({icon:"warning",title:"Cảnh báo chuyển tab",text:`Bạn đã chuyển tab ${tabSwitchCount} lần. Chuyển tab 3 lần, bài thi sẽ tự động bị hủy.`,timer:2e3,timerProgressBar:true,showConfirmButton:false});
    }
});