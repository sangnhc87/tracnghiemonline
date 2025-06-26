// public/js/main.js
let examData = null, timerInterval = null, classData = {}, currentTeacherId = null, currentTeacherAlias = null;
const firebaseConfig = {
  apiKey: "AIzaSyCaybcU4Er3FM3C7mh_rCun7tLXx3uCfa8",
  authDomain: "sangnhc.firebaseapp.com",
  projectId: "sangnhc",
  storageBucket: "sangnhc.firebasestorage.app",
  messagingSenderId: "1066567815353",
  appId: "1:1066567815353:web:ae68c784b9e964a6778b68",
  measurementId: "G-7J4HT6HKPG"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth(), db = firebase.firestore(), functions = firebase.functions();
const getEl = (id) => document.getElementById(id);
function hideAllScreens() { ["loginScreen", "teacherLogin", "loading", "timer-container", "quiz", "gradeBtn", "result-container", "teacherDashboard"].forEach(id => getEl(id).style.display = "none"); }
function showTeacherLogin() { hideAllScreens(); getEl("teacherLogin").style.display = "block"; }
function signInWithGoogle() { auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).then(result => { const user = result.user; currentTeacherId = user.uid; functions.httpsCallable("onTeacherSignIn")().then(res => { const data = res.data; getEl("teacherInfo").innerHTML = `Chào mừng <b>${user.displayName||user.email}</b>!<br>Email: ${user.email}.<br>Thời gian dùng thử đến: <b>${new Date(data.trialEndDate).toLocaleDateString()}</b>.<br>Bạn còn <b>${Math.ceil((new Date(data.trialEndDate).getTime()-Date.now())/(1e3*60*60*24))}</b> ngày.<br>Alias: <b>${data.teacherAlias||"Chưa có"}</b>`; currentTeacherAlias = data.teacherAlias; getEl("teacherAliasInput").value = data.teacherAlias||""; }).catch(error => { console.error("Error on teacher sign in:", error); Swal.fire("Lỗi", `Lỗi xử lý đăng nhập: ${error.message||error.details}`, "error"); auth.signOut(); }); }).catch(error => { console.error("Google Sign-In Error:", error); Swal.fire("Lỗi", "Lỗi đăng nhập Google: " + error.message, "error"); }); }
function signOut() { auth.signOut().then(() => { Swal.fire("Thông báo", "Đăng xuất thành công!", "success"); hideAllScreens(); getEl("loginScreen").style.display = "block"; }).catch(error => Swal.fire("Lỗi", "Lỗi đăng xuất: " + error.message, "error")); }
function updateTeacherAlias() { if (!currentTeacherId) { Swal.fire("Cảnh báo", "Bạn cần đăng nhập.", "warning"); return; } const alias = getEl("teacherAliasInput").value.trim(); if (!alias) { Swal.fire("Cảnh báo", "Alias không được trống.", "warning"); return; } functions.httpsCallable("updateTeacherAlias")({ alias: alias }).then(res => { Swal.fire("Thông báo", res.data.message, "success"); getEl("teacherInfo").innerHTML = getEl("teacherInfo").innerHTML.replace(/Alias: <b[^>]*>.*<\/b>/, `Alias: <b>${alias}</b>`); }).catch(error => Swal.fire("Lỗi", `Lỗi cập nhật Alias: ${error.message||error.details}`, "error")); }
async function showTeacherDashboard() { if (!currentTeacherId) { Swal.fire("Cảnh báo", "Bạn cần đăng nhập.", "warning"); return; } hideAllScreens(); getEl("teacherDashboard").style.display = "block"; try { const trialResult = await functions.httpsCallable("checkTrialStatus")(); getEl("trialRemainingDays").textContent = trialResult.data.isActive ? trialResult.data.remainingDays : "đã hết!"; const userDoc = await db.collection("users").doc(currentTeacherId).get(); getEl("teacherDashboardName").textContent = userDoc.exists ? userDoc.data().name || userDoc.data().email : "Không rõ"; loadTeacherDataForDashboard(); } catch (error) { Swal.fire("Lỗi", `Không thể tải dữ liệu dashboard: ${error.message||error.details}`, "error"); } }
function hideTeacherDashboard() { hideAllScreens(); getEl("loginScreen").style.display = "block"; }
function showUploadForm() { getEl("uploadForm").style.display = "block"; getEl("submissionsView").style.display = "none"; getEl("examsManagementView").style.display = "none"; }
function viewSubmissions() { getEl("uploadForm").style.display = "none"; getEl("submissionsView").style.display = "block"; getEl("examsManagementView").style.display = "none"; loadSubmissions(); }
async function loadSubmissions() { const tableBody = getEl("submissionsTableBody"); tableBody.innerHTML = `<tr><td colspan="5">Đang tải...</td></tr>`; try { const submissionsSnapshot = await db.collection("submissions").where("teacherId","==",currentTeacherId).orderBy("timestamp","desc").get(); tableBody.innerHTML = ""; if (submissionsSnapshot.empty) { tableBody.innerHTML = `<tr><td colspan="5">Chưa có bài nộp nào.</td></tr>`; return; } submissionsSnapshot.forEach(doc => { const data=doc.data(); const row=tableBody.insertRow(); row.insertCell().textContent=data.timestamp?data.timestamp.toDate().toLocaleString():"N/A"; row.insertCell().textContent=data.examCode; row.insertCell().textContent=data.studentName; row.insertCell().textContent=data.className; row.insertCell().textContent=data.score.toFixed(2); }); } catch(error) { Swal.fire("Lỗi", `Lỗi tải bài nộp: ${error.message||error.details}`,"error"); tableBody.innerHTML=`<tr><td colspan="5">Lỗi khi tải bài nộp.</td></tr>`; } }
// Dán đoạn code này vào phần "HÀM CHO GIAO DIỆN GIÁO VIÊN" trong main.js
async function loadTeacherDataForDashboard() {
  if (!currentTeacherId) return;
  getEl("examsManagementView").style.display = "block";
  getEl("submissionsView").style.display = "none";
  const tableBody = getEl("examsTableBody");
  tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center;">Đang tải danh sách đề thi...</td></tr>`;

  try {
    const getExamsCallable = functions.httpsCallable("getTeacherFullExams"); // Cần hàm mới lấy cả đáp án
    const examsResult = await getExamsCallable();
    renderExamsAsSheet(examsResult.data);
  } catch (error) {
    console.error("Error loading teacher exams:", error);
    Swal.fire("Lỗi", `Lỗi tải danh sách đề thi: ${error.message || error.details}`, "error");
    tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: red;">Lỗi khi tải đề thi.</td></tr>`;
  }
}

// Render dữ liệu đề thi ra bảng HTML có thể chỉnh sửa
function renderExamsAsSheet(exams) {
  const tableBody = getEl("examsTableBody");
  tableBody.innerHTML = ""; // Xóa nội dung cũ

  if (!exams || exams.length === 0) {
    addRowToExamsTable(); // Nếu chưa có đề nào, thêm 1 hàng trống
    return;
  }

  exams.forEach(exam => {
    const row = tableBody.insertRow();
    row.dataset.examId = exam.id; // Lưu ID của đề thi vào thuộc tính data của hàng

    // Các ô có thể chỉnh sửa
    row.insertCell().textContent = exam.examCode || "";
    row.cells[0].contentEditable = true;
    
    row.insertCell().textContent = exam.timeLimit || 90;
    row.cells[1].contentEditable = true;

    row.insertCell().textContent = Array.isArray(exam.keys) ? exam.keys.join("|") : "";
    row.cells[2].contentEditable = true;

    row.insertCell().textContent = Array.isArray(exam.cores) ? exam.cores.join("|") : "";
    row.cells[3].contentEditable = true;
    
    row.insertCell().textContent = Array.isArray(exam.questionTexts) ? exam.questionTexts.join("\n") : "";
    row.cells[4].contentEditable = true;

    row.insertCell().textContent = Array.isArray(exam.explanations) ? exam.explanations.join("\n") : "";
    row.cells[5].contentEditable = true;

    // Ô hành động
    const actionsCell = row.insertCell();
    actionsCell.innerHTML = `<button class="delete-row-btn" onclick="deleteRow(this)" title="Xóa hàng này"><i class="fas fa-trash-alt"></i></button>`;
  });
}

// Thêm một hàng trống mới vào bảng
function addRowToExamsTable() {
  const tableBody = getEl("examsTableBody");
  const row = tableBody.insertRow();
  row.dataset.examId = ""; // Hàng mới chưa có ID

  for (let i = 0; i < 6; i++) {
    const cell = row.insertCell();
    cell.contentEditable = true;
    if (i === 1) cell.textContent = "90"; // Mặc định thời gian
  }
  
  const actionsCell = row.insertCell();
  actionsCell.innerHTML = `<button class="delete-row-btn" onclick="deleteRow(this)" title="Xóa hàng này"><i class="fas fa-trash-alt"></i></button>`;
}

// Xóa một hàng khỏi bảng (chưa xóa khỏi DB)
function deleteRow(button) {
  const row = button.parentElement.parentElement;
  const examId = row.dataset.examId;

  if (examId) {
    // Nếu hàng này đã có trong DB, cần xác nhận xóa
    Swal.fire({
      title: 'Xác nhận xóa',
      text: "Bạn có chắc muốn xóa vĩnh viễn đề thi này khỏi cơ sở dữ liệu? Hành động này không thể hoàn tác.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Vâng, xóa nó!',
      cancelButtonText: 'Hủy'
    }).then(async (result) => {
      if (result.isConfirmed) {
        const deleteExamCallable = functions.httpsCallable("deleteExam");
        try {
          await deleteExamCallable({ examId: examId });
          Swal.fire('Đã xóa!', 'Đề thi đã được xóa khỏi cơ sở dữ liệu.', 'success');
          row.remove(); // Xóa hàng khỏi giao diện
        } catch (error) {
          Swal.fire('Lỗi', `Lỗi khi xóa đề thi: ${error.message || error.details}`, 'error');
        }
      }
    });
  } else {
    // Nếu là hàng mới, chỉ cần xóa khỏi giao diện
    row.remove();
  }
}

// Hàm lưu tất cả thay đổi từ bảng vào Firestore
async function saveAllExams() {
  const tableBody = getEl("examsTableBody");
  const rows = tableBody.querySelectorAll("tr");
  const examsToSave = [];

  for (const row of rows) {
    const exam = {
      id: row.dataset.examId || null, // null nếu là hàng mới
      examCode: row.cells[0].textContent.trim(),
      timeLimit: parseInt(row.cells[1].textContent.trim(), 10) || 90,
      keys: row.cells[2].textContent.trim(),
      cores: row.cells[3].textContent.trim(),
      questionTexts: row.cells[4].textContent.trim(),
      explanations: row.cells[5].textContent.trim(),
    };

    // Chỉ lưu các hàng có Mã Đề
    if (exam.examCode) {
      examsToSave.push(exam);
    }
  }

  if (examsToSave.length === 0) {
    Swal.fire("Thông tin", "Không có dữ liệu đề thi để lưu.", "info");
    return;
  }

  Swal.fire({
    title: "Đang lưu tất cả đề thi...",
    allowOutsideClick: false,
    didOpen: () => { Swal.showLoading(); }
  });

  try {
    const saveExamsCallable = functions.httpsCallable("saveAllExams");
    const result = await saveExamsCallable({ exams: examsToSave });
    Swal.fire("Thành công!", result.data.message, "success");
    // Tải lại dữ liệu từ server để cập nhật ID cho các hàng mới
    loadTeacherDataForDashboard();
  } catch (error) {
    console.error("Error saving all exams:", error);
    Swal.fire("Lỗi", `Lỗi khi lưu đề thi: ${error.message || error.details}`, "error");
  }
}

function showExamForm(examData = null) { const isEdit = !!examData; getEl("examFormTitle").textContent = isEdit ? `Sửa Đề thi: ${examData.examCode}` : "Thêm Đề thi mới"; getEl("examId").value = isEdit ? examData.id : ""; getEl("examFormCode").value = isEdit ? examData.examCode : ""; getEl("examFormTime").value = isEdit ? examData.timeLimit : 90; getEl("examFormKeys").value = isEdit && examData.keys ? examData.keys.join("|") : ""; getEl("examFormCores").value = isEdit && examData.cores ? examData.cores.join("|") : ""; getEl("examFormQuestions").value = isEdit && examData.questionTexts ? examData.questionTexts.join("\n") : ""; getEl("examFormExplanations").value = isEdit && examData.explanations ? examData.explanations.join("\n") : ""; getEl("examFormModal").style.display = "flex"; }
function hideExamForm() { getEl("examFormModal").style.display = "none"; }
async function handleExamFormSubmit() { const examId = getEl("examId").value; const examData = { examCode: getEl("examFormCode").value.trim(), timeLimit: parseInt(getEl("examFormTime").value,10), keys: getEl("examFormKeys").value, cores: getEl("examFormCores").value, questionTexts: getEl("examFormQuestions").value, explanations: getEl("examFormExplanations").value }; if (!examData.examCode || !examData.keys || !examData.cores || !examData.questionTexts) { Swal.fire("Lỗi", "Mã đề, Đáp án, Điểm, và Câu hỏi không được trống.", "error"); return; } const functionName = examId ? "updateExam" : "addExam"; Swal.fire({ title: "Đang xử lý...", allowOutsideClick: false, didOpen: () => Swal.showLoading() }); try { const result = await functions.httpsCallable(functionName)({ examId, examData }); Swal.fire("Thành công!", result.data.message, "success"); hideExamForm(); loadTeacherDataForDashboard(); } catch (error) { Swal.fire("Lỗi", `Lỗi khi lưu đề thi: ${error.message||error.details}`, "error"); } }
async function editExam(examId) { try { const result = await functions.httpsCallable("getTeacherFullExam")({ examId: examId }); showExamForm(result.data); } catch (error) { Swal.fire("Lỗi", "Không thể tải chi tiết đề thi.", "error"); } }
async function deleteExam(examId, examCode) { const result = await Swal.fire({ title: `Xác nhận xóa`, text: `Bạn có chắc muốn xóa đề thi "${examCode}"?`, icon: "warning", showCancelButton: true, confirmButtonColor: "#d33", cancelButtonText: "Hủy", confirmButtonText: "Xóa!" }); if (result.isConfirmed) { try { const response = await functions.httpsCallable("deleteExam")({ examId: examId }); Swal.fire("Đã xóa!", response.data.message, "success"); loadTeacherDataForDashboard(); } catch (error) { Swal.fire("Lỗi", `Lỗi khi xóa: ${error.message||error.details}`, "error"); } } }
async function initializeClassDataForStudent() { const teacherAlias=getEl("teacherAlias").value.trim(); if(!teacherAlias)return; try { const result=await functions.httpsCallable("getClassesForStudent")({teacherAlias:teacherAlias}); classData=result.data; populateClassSelect(); } catch(error){Swal.fire("Lỗi",`Lỗi tải danh sách lớp: ${error.message||error.details}`,"error")} }
function populateClassSelect(){ const select=getEl("classSelect"); select.innerHTML=`<option value="">-- Chọn lớp --</option>`; for(const className in classData){const option=new Option(className,className); select.add(option)} select.onchange=updateStudentList; }
function updateStudentList(){ const classSelect=getEl("classSelect"),studentSelect=getEl("studentSelect"),selectedClass=classSelect.value; studentSelect.innerHTML=`<option value="">-- Chọn tên --</option>`; if(selectedClass&&classData[selectedClass]){classData[selectedClass].forEach(student=>{const option=new Option(student,student); studentSelect.add(option)})} }
function startExam() { const teacherAlias=getEl("teacherAlias").value.trim(),examCode=getEl("examCode").value.trim(),studentName=getEl("studentSelect").value,className=getEl("classSelect").value; if(!teacherAlias||!examCode||!studentName||!className){Swal.fire("Cảnh báo","Vui lòng nhập đầy đủ thông tin!","warning");return} hideAllScreens(); getEl("loading").style.display="block"; functions.httpsCallable("loadExamForStudent")({teacherAlias,examCode}).then(result=>{ getEl("loading").style.display="none"; if(!result.data||!result.data.questionTexts||result.data.questionTexts.length===0){Swal.fire("Lỗi",`Không tìm thấy đề thi ${examCode}`,"error");showLoginScreen();return} examData=result.data; examData.studentName=studentName; examData.className=className; examData.examCode=examCode; examData.teacherAlias=teacherAlias; startTimer(examData.timeLimit||90); loadQuiz(examData); }).catch(error=>{ getEl("loading").style.display="none"; Swal.fire("Lỗi",`Lỗi tải đề thi: ${error.message||error.details}`,"error"); showLoginScreen(); }); }
function showLoginScreen(){ hideAllScreens(); getEl("loginScreen").style.display = "block"; }
function startTimer(minutes){ const endTime=Date.now()+minutes*60*1e3; getEl("timer-container").style.display="block"; updateTimerDisplay(Math.floor((endTime-Date.now())/1e3)); timerInterval=setInterval(()=>{ let timeRemaining=Math.max(0,Math.floor((endTime-Date.now())/1e3)); updateTimerDisplay(timeRemaining); if(timeRemaining<=0){clearInterval(timerInterval);Swal.fire({icon:"warning",title:"Hết giờ!",text:"Bài thi sẽ tự động nộp.",timer:3e3,timerProgressBar:!0,showConfirmButton:!1}).then(()=>gradeQuiz())}},1e3)}
function updateTimerDisplay(seconds){ const m=Math.floor(seconds/60),s=seconds%60; getEl("timer").textContent=`Thời gian còn lại: ${m} phút ${s<10?"0":""}${s} giây`}
function loadQuiz(data){ const quizContainer=getEl("quiz"); quizContainer.innerHTML=""; data.questionTexts.forEach((questionText,i)=>{ const questionDiv=document.createElement("div"); questionDiv.className="question"; questionDiv.innerHTML=`<p>Câu ${i+1}</p>`; const statementDiv=document.createElement("div"); statementDiv.className="question-statement"; statementDiv.innerHTML=questionText; questionDiv.appendChild(statementDiv); const type=data.questionTypes?data.questionTypes[i]:null; if(type==="MC"){ let mcOptions=document.createElement("div"); mcOptions.className="mc-options"; ["A","B","C","D"].forEach(o=>{ let optDiv=document.createElement("div"); optDiv.className="mc-option"; optDiv.textContent=o; let input=document.createElement("input"); input.type="radio"; input.name=`q${i}`; input.value=o; optDiv.appendChild(input); optDiv.onclick=()=>{document.querySelectorAll(`input[name='q${i}']`).forEach(r=>r.parentElement.classList.remove("selected"));input.checked=!0;optDiv.classList.add("selected")}; mcOptions.appendChild(optDiv) }); questionDiv.appendChild(mcOptions)}else if(type==="TF"){ let tfOptions=document.createElement("div"); tfOptions.className="tf-options"; const numSubs=data.tfCounts?data.tfCounts[i]:0; for(let j=0;j<numSubs;j++){ let box=document.createElement("div"); box.className="tf-box"; let group=`q${i}_sub${j}`; box.dataset.group=group; let tBtn=document.createElement("div"); tBtn.className="tf-btn"; tBtn.textContent="T"; let tInput=document.createElement("input"); tInput.type="radio"; tInput.name=group; tInput.value="T"; tBtn.appendChild(tInput); let fBtn=document.createElement("div"); fBtn.className="tf-btn"; fBtn.textContent="F"; let fInput=document.createElement("input"); fInput.type="radio"; fInput.name=group; fInput.value="F"; fBtn.appendChild(fInput); tBtn.onclick=()=>{document.querySelectorAll(`input[name='${group}']`).forEach(r=>r.parentElement.classList.remove("selected"));tInput.checked=!0;tBtn.classList.add("selected","T")}; fBtn.onclick=()=>{document.querySelectorAll(`input[name='${group}']`).forEach(r=>r.parentElement.classList.remove("selected"));fInput.checked=!0;fBtn.classList.add("selected","F")}; box.appendChild(tBtn); box.appendChild(fBtn); tfOptions.appendChild(box)} questionDiv.appendChild(tfOptions); let gradeDiv=document.createElement("div"); gradeDiv.className="tf-grade"; gradeDiv.id=`tf-grade-${i}`; questionDiv.appendChild(gradeDiv)}else if(type==="Numeric"){ let numDiv=document.createElement("div"); numDiv.className="numeric-option"; let input=document.createElement("input"); input.type="text"; input.name=`q${i}`; input.placeholder="Đáp số"; numDiv.appendChild(input); questionDiv.appendChild(numDiv)} let toggleBtn=document.createElement("button"); toggleBtn.className="toggle-explanation"; toggleBtn.textContent="Xem lời giải"; toggleBtn.style.display="none"; toggleBtn.onclick=function(){const exp=this.nextElementSibling; exp.classList.toggle("hidden"); this.textContent=exp.classList.contains("hidden")?"Xem lời giải":"Ẩn lời giải"}; let expDiv=document.createElement("div"); expDiv.className="explanation hidden"; expDiv.innerHTML=data.explanations[i]||""; questionDiv.appendChild(toggleBtn); questionDiv.appendChild(expDiv); quizContainer.appendChild(questionDiv) }); getEl("quiz").style.display="block"; getEl("gradeBtn").style.display="block"}
function gradeQuiz(){ if(timerInterval)clearInterval(timerInterval); let unanswered=[]; for(let i=0;i<examData.questionTexts.length;i++){ const type=examData.questionTypes?examData.questionTypes[i]:null; if(type==="MC"){if(!document.querySelector(`input[name='q${i}']:checked`))unanswered.push(`Câu ${i+1}`)}else if(type==="TF"){const numSubs=examData.tfCounts?examData.tfCounts[i]:0; for(let j=0;j<numSubs;j++){if(!document.querySelector(`input[name='q${i}_sub${j}']:checked`))unanswered.push(`Câu ${i+1} (Ô ${j+1})`)}}else if(type==="Numeric"){const input=document.querySelector(`input[name='q${i}']`);if(!input||input.value.trim()==="")unanswered.push(`Câu ${i+1}`)}} if(unanswered.length>0){showUnansweredDialog(unanswered);return} let answers={teacherAlias:examData.teacherAlias,examCode:examData.examCode,studentName:examData.studentName,className:examData.className}; document.querySelectorAll("input[type='radio']:checked, input[type='text'][name^='q']").forEach(input=>{if(input.type!=="text"||input.value.trim()!=="")answers[input.name]=input.value.trim()}); Swal.fire({title:"Đang nộp bài...",allowOutsideClick:!1,didOpen:()=>Swal.showLoading()}); functions.httpsCallable("submitExam")(answers).then(result=>{Swal.close(); const submittedScore=result.data.score; const serverExamData=result.data.examData; const detailedResults=result.data.detailedResults; getEl("score").textContent=submittedScore.toFixed(2); getEl("student-name").textContent=examData.studentName; getEl("student-class").textContent=examData.className; getEl("exam-code").textContent=examData.examCode; getEl("result-container").style.display="block"; getEl("gradeBtn").style.display="none"; getEl("quiz").innerHTML=""; serverExamData.keysStr.forEach((key,i)=>{ const resultForQ=detailedResults[`q${i}`]; if(resultForQ){ const questionDiv=document.querySelectorAll(".question")[i]; questionDiv.querySelector(".toggle-explanation").style.display="block"; if(resultForQ.type==="MC"){document.querySelectorAll(`input[name='q${i}']`).forEach(r=>{if(r.value===resultForQ.correctAnswer)r.parentElement.classList.add("correct-answer")})}else if(resultForQ.type==="TF"){const tfScores=(serverExamData.coreStr[1]||"").split(",").map(x=>parseFloat(x)); let countCorrect=0; for(let j=0;j<resultForQ.correctAnswer.length;j++){if(resultForQ.userAnswer&&resultForQ.userAnswer[j]===resultForQ.correctAnswer[j])countCorrect++; const group=`q${i}_sub${j}`; document.querySelector(`.tf-box[data-group='${group}'] .tf-btn`).parentElement.querySelectorAll(".tf-btn").forEach(btn=>{if(btn.textContent.trim()===resultForQ.correctAnswer[j])btn.classList.add("correct-answer")})} getEl(`tf-grade-${i}`).textContent=`Điểm T-F: ${countCorrect>=1&&countCorrect<=tfScores.length?["A","B","C","D"][countCorrect-1]:"F"}`}else if(resultForQ.type==="Numeric"){const input=document.querySelector(`input[name='q${i}']`);if(input){if(parseFloat(input.value.trim())===parseFloat(resultForQ.correctAnswer))input.parentElement.classList.add("correct");let ansSpan=document.createElement("span");ansSpan.className="correct-answer-display";ansSpan.textContent=`Đáp án: ${resultForQ.correctAnswer}`;input.parentElement.appendChild(ansSpan)}}}})}) .catch(error=>{Swal.close(); Swal.fire("Lỗi",`Lỗi nộp bài: ${error.message||error.details}`,"error"); showLoginScreen()});}
function showUnansweredDialog(unanswered){Swal.fire({icon:"info",title:"Chưa làm xong",html:`<p>Bạn chưa trả lời các câu sau:</p><ul>${unanswered.map(q=>`<li>${q}</li>`).join("")}</ul>`,confirmButtonText:"OK, để tôi xem lại"})}
window.onload=function(){ getEl("teacherAlias").addEventListener("change",initializeClassDataForStudent); auth.onAuthStateChanged(user=>{if(user){currentTeacherId=user.uid; functions.httpsCallable("onTeacherSignIn")().then(res=>{const data=res.data;getEl("teacherInfo").innerHTML=`Chào mừng <b>${user.displayName||user.email}</b>!<br>Email: ${user.email}.<br>Trial đến: <b>${new Date(data.trialEndDate).toLocaleDateString()}</b>.<br>Còn <b>${Math.ceil((new Date(data.trialEndDate).getTime()-Date.now())/(1e3*60*60*24))}</b> ngày.<br>Alias: <b>${data.teacherAlias||"Chưa có"}</b>`;currentTeacherAlias=data.teacherAlias;getEl("teacherAliasInput").value=data.teacherAlias||""}).catch(error=>{console.error("Auth state change error:",error);Swal.fire("Lỗi",`Lỗi xử lý đăng nhập: ${error.message||error.details}`,"error");auth.signOut()}); showTeacherLogin()}else{hideAllScreens();getEl("loginScreen").style.display="block"}})};
let tabSwitchCount=0; document.addEventListener("visibilitychange",function(){if(document.hidden){tabSwitchCount++;if(tabSwitchCount>=3)Swal.fire({icon:"warning",title:"Chuyển tab quá nhiều!",text:"Bài thi sẽ tự động nộp.",timer:3e3,timerProgressBar:!0,showConfirmButton:!1}).then(()=>gradeQuiz());else Swal.fire({icon:"warning",title:"Cảnh báo chuyển tab",text:`Bạn đã chuyển tab ${tabSwitchCount} lần. Chuyển tab 3 lần bài thi sẽ tự nộp.`,timer:2e3,timerProgressBar:!0,showConfirmButton:!1})}});