// public/js/main.js

// Biến toàn cục để lưu trữ trạng thái và dữ liệu
let examData = null; // Dữ liệu đề thi được tải từ server (questionTexts, explanations, timeLimit, questionTypes, tfCounts)
let timerInterval = null; // ID của setInterval cho đồng hồ đếm ngược
let classData = {}; // Đối tượng lưu thông tin lớp và danh sách học sinh
let currentTeacherId = null; // UID của giáo viên đang đăng nhập Firebase
let currentTeacherAlias = null; // Alias của giáo viên đang đăng nhập

// --- KHỞI TẠO FIREBASE ---
// THAY THẾ THÔNG TIN NÀY BẰNG CẤU HÌNH DỰ ÁN FIREBASE CỦA BẠN!
// Bạn có thể tìm thấy cấu hình này trong Firebase Console:
// Project settings (biểu tượng bánh răng) -> Your apps -> Chọn ứng dụng web của bạn -> Firebase SDK snippet -> Config
const firebaseConfig = {
  apiKey: "AIzaSyCaybcU4Er3FM3C7mh_rCun7tLXx3uCfa8",
  authDomain: "sangnhc.firebaseapp.com",
  projectId: "sangnhc",
  storageBucket: "sangnhc.firebasestorage.app",
  messagingSenderId: "1066567815353",
  appId: "1:1066567815353:web:ae68c784b9e964a6778b68",
  measurementId: "G-7J4HT6HKPG"
};


// Khởi tạo Firebase App
firebase.initializeApp(firebaseConfig);

// Lấy các đối tượng dịch vụ Firebase
const auth = firebase.auth(); // Dịch vụ xác thực
const db = firebase.firestore(); // Dịch vụ cơ sở dữ liệu Firestore
const functions = firebase.functions(); // Dịch vụ Cloud Functions

// --- Cấu hình Emulator (CHỈ DÙNG KHI PHÁT TRIỂN CỤC BỘ) ---
// Nếu bạn đang chạy 'firebase emulators:start' trong terminal để test cục bộ,
// hãy bỏ comment các dòng này. Khi deploy lên môi trường thật, hãy comment lại!
// functions.useEmulator("http://localhost", 5001); // Cổng mặc định cho Functions Emulator
// db.useEmulator("http://localhost", 8080); // Cổng mặc định cho Firestore Emulator
// auth.useEmulator("http://localhost:9099"); // Cổng mặc định cho Authentication Emulator


// --- HÀM CHUNG ĐỂ QUẢN LÝ HIỂN THỊ MÀN HÌNH ---
// Hàm này giúp ẩn tất cả các phần tử giao diện chính để hiển thị phần tử mong muốn
function hideAllScreens() {
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("teacherLogin").style.display = "none";
    document.getElementById("loading").style.display = "none";
    document.getElementById("timer-container").style.display = "none";
    document.getElementById("quiz").style.display = "none";
    document.getElementById("gradeBtn").style.display = "none";
    document.getElementById("result-container").style.display = "none";
    document.getElementById("teacherDashboard").style.display = "none";
}

// --- HÀM CHO GIAO DIỆN GIÁO VIÊN ---

// Hiển thị màn hình đăng nhập/quản lý giáo viên
function showTeacherLogin() {
    hideAllScreens();
    document.getElementById("teacherLogin").style.display = "block";
}

// Đăng nhập giáo viên bằng tài khoản Google
function signInWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider)
        .then((result) => {
            const user = result.user;
            currentTeacherId = user.uid; // Lưu UID của giáo viên

            // Gọi Cloud Function để xử lý đăng nhập giáo viên (tạo profile nếu mới, kiểm tra dùng thử)
            const onTeacherSignInCallable = functions.httpsCallable('onTeacherSignIn');
            onTeacherSignInCallable().then(res => {
                const data = res.data;
                // Cập nhật thông tin giáo viên trên giao diện
                document.getElementById('teacherInfo').innerHTML = `
                    Chào mừng <b>${user.displayName || user.email}</b>!<br>
                    Email: ${user.email}.<br>
                    Thời gian dùng thử đến: <b>${new Date(data.trialEndDate).toLocaleDateString()}</b>.<br>
                    Bạn còn <b>${Math.ceil((new Date(data.trialEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))}</b> ngày dùng thử.<br>
                    Alias hiện tại: <b>${data.teacherAlias || 'Chưa có'}</b>
                `;
                currentTeacherAlias = data.teacherAlias; // Cập nhật alias
                document.getElementById('teacherAliasInput').value = data.teacherAlias || ''; // Hiển thị alias để giáo viên có thể chỉnh sửa
            }).catch(error => {
                console.error("Error on teacher sign in (Cloud Function):", error);
                Swal.fire('Lỗi', 'Lỗi xử lý đăng nhập giáo viên: ' + (error.message || error.details), 'error');
                auth.signOut(); // Đăng xuất nếu có lỗi nghiêm trọng
            });
        }).catch((error) => {
            console.error("Google Sign-In Error:", error);
            Swal.fire('Lỗi', 'Lỗi đăng nhập Google: ' + error.message, 'error');
        });
}

// Đăng xuất giáo viên
function signOut() {
    auth.signOut().then(() => {
        Swal.fire('Thông báo', 'Đăng xuất thành công!', 'success');
        currentTeacherId = null;
        currentTeacherAlias = null;
        document.getElementById('teacherInfo').textContent = '';
        document.getElementById('teacherAliasInput').value = '';
        hideAllScreens();
        document.getElementById('loginScreen').style.display = 'block'; // Quay lại màn hình đăng nhập học sinh
    }).catch((error) => {
        console.error("Sign Out Error:", error);
        Swal.fire('Lỗi', 'Lỗi đăng xuất: ' + error.message, 'error');
    });
}

// Cập nhật mã Alias cho giáo viên
function updateTeacherAlias() {
    if (!currentTeacherId) {
        Swal.fire('Cảnh báo', 'Bạn cần đăng nhập để cập nhật Alias.', 'warning');
        return;
    }
    const alias = document.getElementById('teacherAliasInput').value.trim();
    if (!alias) {
         Swal.fire('Cảnh báo', 'Alias không được để trống.', 'warning');
         return;
    }
    const updateAliasCallable = functions.httpsCallable('updateTeacherAlias');
    updateAliasCallable({ alias: alias }).then(res => {
        Swal.fire('Thông báo', res.data.message, 'success');
        currentTeacherAlias = alias;
        // Cập nhật lại thông tin hiển thị trên giao diện
        const teacherInfoDiv = document.getElementById('teacherInfo');
        if(teacherInfoDiv) {
            teacherInfoDiv.innerHTML = teacherInfoDiv.innerHTML.replace(/Alias hiện tại: <b[^>]*>.*<\/b>/, `Alias hiện tại: <b>${alias}</b>`);
        }
    }).catch(error => {
        console.error("Error updating alias:", error);
        Swal.fire('Lỗi', 'Lỗi cập nhật Alias: ' + (error.message || error.details), 'error');
    });
}

// Hiển thị bảng điều khiển (Dashboard) của giáo viên
async function showTeacherDashboard() {
    if (!currentTeacherId) {
        Swal.fire('Cảnh báo', 'Bạn cần đăng nhập với tư cách giáo viên.', 'warning');
        return;
    }

    hideAllScreens();
    document.getElementById("teacherDashboard").style.display = "block";

    const teacherDashboardName = document.getElementById("teacherDashboardName");
    const trialRemainingDays = document.getElementById("trialRemainingDays");

    // Lấy trạng thái dùng thử của giáo viên
    const checkTrialStatusCallable = functions.httpsCallable('checkTrialStatus');
    try {
        const trialResult = await checkTrialStatusCallable();
        if (trialResult.data.isActive) {
            trialRemainingDays.textContent = trialResult.data.remainingDays;
        } else {
            trialRemainingDays.innerHTML = `đã <b>hết!</b> Vui lòng liên hệ quản trị viên để gia hạn.`;
            Swal.fire('Thông báo', 'Thời gian dùng thử của bạn đã hết!', 'warning');
        }
    } catch (error) {
        console.error("Error checking trial status:", error);
        Swal.fire('Lỗi', 'Không thể kiểm tra trạng thái dùng thử: ' + (error.message || error.details), 'error');
        return; // Dừng nếu có lỗi kiểm tra dùng thử
    }

    // Tải thông tin giáo viên để hiển thị tên
    const userDoc = await db.collection('users').doc(currentTeacherId).get();
    if (userDoc.exists) {
        teacherDashboardName.textContent = userDoc.data().name || userDoc.data().email;
    } else {
        teacherDashboardName.textContent = "Không rõ";
    }

    // Tải và hiển thị danh sách lớp và đề thi của giáo viên (trong console hoặc trên UI nếu có)
    loadTeacherDataForDashboard();
    // Mặc định hiển thị form upload khi vào dashboard
    showUploadForm();
}

// Ẩn bảng điều khiển giáo viên và quay lại màn hình chính
function hideTeacherDashboard() {
    hideAllScreens();
    document.getElementById('loginScreen').style.display = 'block';
}

// Hiển thị form tải lên đề thi/lớp
function showUploadForm() {
    document.getElementById('uploadForm').style.display = 'block';
    document.getElementById('submissionsView').style.display = 'none';
}

// Xử lý tải lên file đề thi (CSV/JSON)
async function uploadExamsFile() {
    const fileInput = document.getElementById('fileInputExams');
    if (fileInput.files.length === 0) {
        Swal.fire('Cảnh báo', 'Vui lòng chọn một file để tải lên đề thi.', 'warning');
        return;
    }
    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
        try {
            const content = e.target.result;
            let parsedData;
            // Xử lý parse CSV hoặc JSON
            if (file.name.toLowerCase().endsWith('.csv')) {
                const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
                if (lines.length <= 1) { // Chỉ có header hoặc trống
                     throw new Error("File CSV trống hoặc không có dữ liệu.");
                }
                const headers = lines[0].split(',').map(h => h.trim());
                parsedData = lines.slice(1).map(line => {
                    const values = line.split(',');
                    let obj = {};
                    headers.forEach((header, i) => {
                        obj[header] = values[i];
                    });
                    return obj;
                });
            } else if (file.name.toLowerCase().endsWith('.json')) {
                parsedData = JSON.parse(content);
            } else {
                throw new Error("Định dạng file không được hỗ trợ. Vui lòng chọn CSV hoặc JSON.");
            }

            if (!Array.isArray(parsedData) || parsedData.length === 0) {
                throw new Error("File trống hoặc định dạng không hợp lệ.");
            }

            // Kiểm tra định dạng cơ bản của một đề thi đầu tiên
            if (!parsedData[0].examCode || !parsedData[0].keys || !parsedData[0].cores) {
                throw new Error("File đề thi phải có ít nhất các cột/trường: examCode, keys, cores.");
            }

            // Hiển thị loading Swal
            Swal.fire({
                title: 'Đang tải lên đề thi...',
                allowOutsideClick: false,
                didOpen: () => { Swal.showLoading(); }
            });

            // Gọi Cloud Function để tải lên đề thi
            const uploadExamsCallable = functions.httpsCallable('uploadExams');
            const result = await uploadExamsCallable({ exams: parsedData });
            Swal.fire('Thành công', result.data.message, 'success');
            fileInput.value = ''; // Xóa file đã chọn trên input
        } catch (error) {
            console.error("Upload exams error:", error);
            Swal.fire('Lỗi', 'Lỗi tải lên đề thi: ' + (error.message || error.details), 'error');
        }
    };

    reader.readAsText(file); // Đọc nội dung file
}

// Xử lý tải lên file danh sách lớp (CSV/JSON)
async function uploadClassesFile() {
    const fileInput = document.getElementById('fileInputClasses');
    if (fileInput.files.length === 0) {
        Swal.fire('Cảnh báo', 'Vui lòng chọn một file để tải lên danh sách lớp.', 'warning');
        return;
    }
    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
        try {
            const content = e.target.result;
            let parsedData;
            if (file.name.toLowerCase().endsWith('.csv')) {
                const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
                if (lines.length <= 1) {
                    throw new Error("File CSV trống hoặc không có dữ liệu.");
                }
                const headers = lines[0].split(',').map(h => h.trim());
                parsedData = lines.slice(1).map(line => {
                    const values = line.split(',');
                    let obj = {};
                    headers.forEach((header, i) => {
                        obj[header] = values[i];
                    });
                    // Chuyển chuỗi học sinh thành mảng
                    if (obj.students && typeof obj.students === 'string') {
                        obj.students = obj.students.split(',').map(s => s.trim()).filter(s => s !== '');
                    } else {
                        obj.students = [];
                    }
                    return obj;
                });
            } else if (file.name.toLowerCase().endsWith('.json')) {
                parsedData = JSON.parse(content);
            } else {
                throw new Error("Định dạng file không được hỗ trợ. Vui lòng chọn CSV hoặc JSON.");
            }

            if (!Array.isArray(parsedData) || parsedData.length === 0) {
                throw new Error("File trống hoặc định dạng không hợp lệ.");
            }

            // Kiểm tra định dạng cơ bản của một lớp đầu tiên
            if (!parsedData[0].name || !parsedData[0].students) {
                throw new Error("File lớp học phải có ít nhất các cột/trường: name, students.");
            }

            // Hiển thị loading Swal
            Swal.fire({
                title: 'Đang tải lên lớp học...',
                allowOutsideClick: false,
                didOpen: () => { Swal.showLoading(); }
            });

            // Gọi Cloud Function để tải lên lớp học
            const uploadClassesCallable = functions.httpsCallable('uploadClasses');
            const result = await uploadClassesCallable({ classes: parsedData });
            Swal.fire('Thành công', result.data.message, 'success');
            fileInput.value = ''; // Xóa file đã chọn trên input
        } catch (error) {
            console.error("Upload classes error:", error);
            Swal.fire('Lỗi', 'Lỗi tải lên lớp học: ' + (error.message || error.details), 'error');
        }
    };

    reader.readAsText(file);
}

// Hiển thị danh sách các bài nộp của học sinh
async function viewSubmissions() {
    document.getElementById('uploadForm').style.display = 'none';
    document.getElementById('submissionsView').style.display = 'block';

    if (!currentTeacherId) {
        Swal.fire('Cảnh báo', 'Bạn cần đăng nhập để xem bài nộp.', 'warning');
        return;
    }

    const submissionsTableBody = document.getElementById('submissionsTableBody');
    submissionsTableBody.innerHTML = '<tr><td colspan="5">Đang tải bài nộp...</td></tr>';

    try {
        // Lấy các bài nộp thuộc về giáo viên hiện tại
        const submissionsSnapshot = await db.collection('submissions')
                                            .where('teacherId', '==', currentTeacherId)
                                            .orderBy('timestamp', 'desc') // Sắp xếp theo thời gian mới nhất
                                            .get();

        if (submissionsSnapshot.empty) {
            submissionsTableBody.innerHTML = '<tr><td colspan="5">Chưa có bài nộp nào.</td></tr>';
            return;
        }

        submissionsTableBody.innerHTML = ''; // Xóa thông báo tải
        submissionsSnapshot.forEach(doc => {
            const data = doc.data();
            const row = submissionsTableBody.insertRow();
            row.insertCell().textContent = data.timestamp ? data.timestamp.toDate().toLocaleString() : 'N/A';
            row.insertCell().textContent = data.examCode;
            row.insertCell().textContent = data.studentName;
            row.insertCell().textContent = data.className;
            row.insertCell().textContent = data.score.toFixed(2);
        });

    } catch (error) {
        console.error("Error fetching submissions:", error);
        Swal.fire('Lỗi', 'Lỗi khi tải bài nộp: ' + (error.message || error.details), 'error');
        submissionsTableBody.innerHTML = '<tr><td colspan="5">Lỗi khi tải bài nộp.</td></tr>';
    }
}

// Tải dữ liệu chung cho Dashboard (danh sách lớp và đề thi của giáo viên)
async function loadTeacherDataForDashboard() {
    if (!currentTeacherId) return;
    try {
        const [examsResult, classesResult] = await Promise.all([
            functions.httpsCallable('getTeacherExams')(),
            functions.httpsCallable('getTeacherClasses')()
        ]);
        console.log("Teacher Exams:", examsResult.data);
        console.log("Teacher Classes:", classesResult.data);
        // Bạn có thể hiển thị dữ liệu này trên dashboard (ví dụ: tạo bảng, danh sách)
    } catch (error) {
        console.error("Error loading teacher data for dashboard:", error);
        Swal.fire('Lỗi', 'Lỗi tải dữ liệu bảng điều khiển: ' + (error.message || error.details), 'error');
    }
}


// --- HÀM CHO GIAO DIỆN HỌC SINH ---

// Cập nhật danh sách học sinh dựa trên lớp được chọn
function updateStudentList() {
    const classSelect = document.getElementById("classSelect");
    const studentSelect = document.getElementById("studentSelect");
    const selectedClass = classSelect.value;

    studentSelect.innerHTML = '<option value="">-- Chọn tên --</option>'; // Reset danh sách học sinh
    if (selectedClass && classData[selectedClass]) {
        classData[selectedClass].forEach(student => {
            let option = document.createElement("option");
            option.value = student;
            option.textContent = student;
            studentSelect.appendChild(option);
        });
    }
}

// Tải danh sách lớp cho học sinh dựa vào Alias của giáo viên
async function initializeClassDataForStudent() {
  const teacherAlias = document.getElementById("teacherAlias").value.trim();
  if (!teacherAlias) {
      // Xóa danh sách lớp/học sinh nếu không có Alias
      document.getElementById("classSelect").innerHTML = '<option value="">-- Chọn lớp --</option>';
      document.getElementById("studentSelect").innerHTML = '<option value="">-- Chọn tên --</option>';
      return;
  }
  const getClassesCallable = functions.httpsCallable('getClassesForStudent');
  try {
    const result = await getClassesCallable({ teacherAlias: teacherAlias });
    classData = result.data;
    populateClassSelect(); // Điền dữ liệu vào select lớp
  } catch (error) {
    console.error("Error calling getClassesForStudent:", error);
    Swal.fire('Lỗi', 'Lỗi khi tải danh sách lớp: ' + (error.message || error.details), 'error');
    // Reset lớp/học sinh nếu có lỗi
    document.getElementById("classSelect").innerHTML = '<option value="">-- Chọn lớp --</option>';
    document.getElementById("studentSelect").innerHTML = '<option value="">-- Chọn tên --</option>';
  }
}

// Điền dữ liệu vào dropdown chọn lớp
function populateClassSelect() {
    const classSelect = document.getElementById("classSelect");
    classSelect.innerHTML = '<option value="">-- Chọn lớp --</option>';
    for (let className in classData) {
        let option = document.createElement("option");
        option.value = className;
        option.textContent = className;
        classSelect.appendChild(option);
    }
    // Gán lại sự kiện onchange vì innerHTML = '' sẽ xóa sự kiện cũ
    classSelect.onchange = updateStudentList;
}

// Bắt đầu bài thi: Tải đề thi từ Cloud Functions
function startExam() {
    const teacherAlias = document.getElementById("teacherAlias").value.trim();
    const examCode = document.getElementById("examCode").value.trim();
    const studentName = document.getElementById("studentSelect").value;
    const className = document.getElementById("classSelect").value;

    if (!teacherAlias || !examCode || !studentName || !className) {
        Swal.fire('Cảnh báo', 'Vui lòng nhập đầy đủ thông tin (Mã Giáo viên, Mã đề, Lớp, Họ tên)!', 'warning');
        return;
    }

    hideAllScreens(); // Ẩn tất cả để chuẩn bị hiển thị đề thi
    document.getElementById("loading").style.display = "block"; // Hiển thị loading

    const loadExamCallable = functions.httpsCallable('loadExamForStudent');
    loadExamCallable({ teacherAlias: teacherAlias, examCode: examCode }).then(result => {
        document.getElementById("loading").style.display = "none"; // Ẩn loading
        if (!result.data || !result.data.questionTexts || result.data.questionTexts.length === 0) {
            Swal.fire('Lỗi', 'Không tìm thấy đề thi hoặc đề thi trống với mã: ' + examCode, 'error');
            showLoginScreen(); // Quay lại màn hình đăng nhập
            return;
        }
        examData = result.data; // Lưu dữ liệu đề thi từ server (không có đáp án đúng)
        // Lưu thông tin học sinh và mã đề vào examData để gửi lại khi nộp bài
        examData.studentName = studentName;
        examData.className = className;
        examData.examCode = examCode;
        examData.teacherAlias = teacherAlias;

        let timeLimit = examData.timeLimit ? parseInt(examData.timeLimit, 10) : 90; // Lấy timeLimit từ server
        startTimer(timeLimit); // Bắt đầu đồng hồ đếm ngược
        loadQuiz(examData); // Hiển thị giao diện đề thi
    }).catch(error => {
        document.getElementById("loading").style.display = "none"; // Ẩn loading nếu có lỗi
        console.error("Error calling loadExamForStudent:", error);
        Swal.fire('Lỗi', 'Lỗi khi tải đề thi: ' + (error.message || error.details), 'error');
        showLoginScreen(); // Quay lại màn hình đăng nhập
    });
}

// Quay lại màn hình đăng nhập học sinh
function showLoginScreen() {
    hideAllScreens();
    document.getElementById("loginScreen").style.display = "block";
}

// Bắt đầu đồng hồ đếm ngược
function startTimer(minutes) {
    const endTime = Date.now() + minutes * 60 * 1000; // Tính thời điểm kết thúc
    document.getElementById("timer-container").style.display = "block"; // Hiển thị đồng hồ

    // Cập nhật hiển thị ngay lập tức
    updateTimerDisplay(Math.floor((endTime - Date.now()) / 1000));

    timerInterval = setInterval(() => {
        let now = Date.now();
        let timeRemaining = Math.max(0, Math.floor((endTime - now) / 1000));
        updateTimerDisplay(timeRemaining);
        if (timeRemaining <= 0) {
            clearInterval(timerInterval); // Dừng đồng hồ
            Swal.fire({
                icon: 'warning',
                title: 'Hết giờ làm bài',
                text: 'Thời gian làm bài đã hết. Bài thi sẽ tự động nộp.',
                timer: 3000,
                timerProgressBar: true,
                showConfirmButton: false,
                allowOutsideClick: false
            }).then(() => {
                gradeQuiz(); // Tự động nộp bài
            });
        }
    }, 1000); // Cập nhật mỗi giây
}

// Cập nhật nội dung hiển thị của đồng hồ
function updateTimerDisplay(seconds) {
    const m = Math.floor(seconds / 60); // Số phút
    const s = seconds % 60; // Số giây
    document.getElementById("timer").textContent = `Thời gian còn lại: ${m} phút ${s < 10 ? '0' : ''}${s} giây`;
}

// Tải giao diện đề thi lên HTML
function loadQuiz(data) {
    const quizContainer = document.getElementById("quiz");
    quizContainer.innerHTML = ""; // Xóa nội dung cũ
    const totalQuestions = data.questionTexts.length;

    for (let i = 0; i < totalQuestions; i++) {
        let questionDiv = document.createElement("div");
        questionDiv.className = "question";
        questionDiv.innerHTML = `<p style="color: #e44d26; font-size: 22px; font-weight: bold; text-shadow: 1px 1px 2px rgba(0,0,0,0.3);">Câu ${i + 1}</p>`;

        let statementDiv = document.createElement("div");
        statementDiv.className = "question-statement";
        statementDiv.innerHTML = data.questionTexts[i] || `Đề bài demo câu ${i+1}`;
        questionDiv.appendChild(statementDiv);

        // Render loại câu hỏi dựa vào `questionTypes` từ server
        const questionType = data.questionTypes ? data.questionTypes[i] : null;

        if (questionType === 'MC') { // Câu hỏi trắc nghiệm (Multiple Choice)
            let mcContainer = document.createElement("div");
            mcContainer.className = "mc-options";
            ["A", "B", "C", "D"].forEach(option => {
                let optionDiv = document.createElement("div");
                optionDiv.className = "mc-option";
                optionDiv.textContent = option;
                let input = document.createElement("input");
                input.type = "radio";
                input.name = `q${i}`; // Tên input: q0, q1, ...
                input.value = option;
                optionDiv.appendChild(input);
                optionDiv.onclick = function () {
                    document.querySelectorAll(`input[name='q${i}']`).forEach(radio => {
                        radio.parentElement.classList.remove("selected");
                    });
                    input.checked = true;
                    optionDiv.classList.add("selected");
                };
                mcContainer.appendChild(optionDiv);
            });
            questionDiv.appendChild(mcContainer);
        } else if (questionType === 'TF') { // Câu hỏi Đúng/Sai (True/False)
            let tfContainer = document.createElement("div");
            tfContainer.className = "tf-options";
            const numSubQuestions = data.tfCounts ? data.tfCounts[i] : 0; // Số lượng câu con TF

            for (let j = 0; j < numSubQuestions; j++) {
                let tfBox = document.createElement("div");
                tfBox.className = "tf-box";
                let groupName = `q${i}_sub${j}`; // Tên input cho câu con: q0_sub0, q0_sub1, ...
                tfBox.dataset.group = groupName;

                let tBtn = document.createElement("div");
                tBtn.className = "tf-btn";
                tBtn.textContent = "T";
                let tInput = document.createElement("input");
                tInput.type = "radio";
                tInput.name = groupName;
                tInput.value = "T";
                tBtn.appendChild(tInput);

                let fBtn = document.createElement("div");
                fBtn.className = "tf-btn";
                fBtn.textContent = "F";
                let fInput = document.createElement("input");
                fInput.type = "radio";
                fInput.name = groupName;
                fInput.value = "F";
                fBtn.appendChild(fInput);

                tBtn.onclick = function () {
                    document.querySelectorAll(`input[name='${groupName}']`).forEach(radio => {
                        radio.parentElement.classList.remove("selected", "T", "F");
                    });
                    tInput.checked = true;
                    tBtn.classList.add("selected", "T");
                };
                fBtn.onclick = function () {
                    document.querySelectorAll(`input[name='${groupName}']`).forEach(radio => {
                        radio.parentElement.classList.remove("selected", "T", "F");
                    });
                    fInput.checked = true;
                    fBtn.classList.add("selected", "F");
                };

                tfBox.appendChild(tBtn);
                tfBox.appendChild(fBtn);
                tfContainer.appendChild(tfBox);
            }
            questionDiv.appendChild(tfContainer);
            let tfGradeDisplay = document.createElement("div"); // Hiển thị điểm T-F
            tfGradeDisplay.className = "tf-grade";
            tfGradeDisplay.id = `tf-grade-${i}`;
            questionDiv.appendChild(tfGradeDisplay);
        } else if (questionType === 'Numeric') { // Câu hỏi điền số
            let numericDiv = document.createElement("div");
            numericDiv.className = "numeric-option";
            let numericInput = document.createElement("input");
            numericInput.type = "text";
            numericInput.name = `q${i}`; // Tên input: q0, q1, ...
            numericInput.placeholder = "Nhập đáp số";
            numericDiv.appendChild(numericInput);
            questionDiv.appendChild(numericDiv);
        } else {
            // Trường hợp không xác định được loại câu hỏi (có thể do lỗi cấu hình đề thi)
            questionDiv.innerHTML += '<p style="color:red;">Lỗi: Không xác định được loại câu hỏi. Vui lòng liên hệ giáo viên.</p>';
        }

        // Nút xem/ẩn lời giải và khung lời giải (ẩn ban đầu)
        let toggleBtn = document.createElement("button");
        toggleBtn.className = "toggle-explanation";
        toggleBtn.textContent = "Xem lời giải";
        toggleBtn.style.display = "none";  // Nút này ẩn cho đến khi bài thi được nộp
        toggleBtn.onclick = function () {
            let exp = this.nextElementSibling;
            if (exp.classList.contains('hidden')) {
                exp.classList.remove('hidden');
                this.textContent = "Ẩn lời giải";
            } else {
                exp.classList.add('hidden');
                this.textContent = "Xem lời giải";
            }
        };
        let explanationDiv = document.createElement("div");
        explanationDiv.className = "explanation hidden";
        explanationDiv.innerHTML = data.explanations[i] || "Lời giải chưa có.";
        questionDiv.appendChild(toggleBtn);
        questionDiv.appendChild(explanationDiv);

        quizContainer.appendChild(questionDiv);
    }
    document.getElementById("quiz").style.display = "block"; // Hiển thị khung đề thi
    document.getElementById("gradeBtn").style.display = "block"; // Hiển thị nút chấm điểm
}

// Chấm điểm và gửi bài (Toàn bộ logic chấm điểm thực hiện trên Cloud Functions)
function gradeQuiz() {
    if (timerInterval) clearInterval(timerInterval); // Dừng đồng hồ đếm ngược

    let unanswered = []; // Danh sách các câu chưa trả lời
    const totalQuestions = examData.questionTexts.length; // Tổng số câu hỏi

    // Kiểm tra các câu hỏi chưa được trả lời
    for (let i = 0; i < totalQuestions; i++) {
        const questionType = examData.questionTypes ? examData.questionTypes[i] : null;

        if (questionType === 'MC') {
            if (!document.querySelector(`input[name='q${i}']:checked`)) {
                unanswered.push(`Câu ${i+1} (Trắc nghiệm)`);
            }
        } else if (questionType === 'TF') {
            const numSubQuestions = examData.tfCounts ? examData.tfCounts[i] : 0;
            for (let j = 0; j < numSubQuestions; j++) {
                let groupName = `q${i}_sub${j}`;
                if (!document.querySelector(`input[name='${groupName}']:checked`)) {
                    unanswered.push(`Câu ${i+1} (Đúng/Sai - Ô ${j+1})`);
                }
            }
        } else if (questionType === 'Numeric') {
            let input = document.querySelector(`input[name='q${i}']`);
            if (!input || input.value.trim() === "") {
                unanswered.push(`Câu ${i+1} (Điền số)`);
            }
        }
    }

    if (unanswered.length > 0) {
        showUnansweredDialog(unanswered); // Hiển thị thông báo nếu có câu chưa trả lời
        return; // Dừng quá trình nộp bài
    }

    // Thu thập tất cả đáp án của thí sinh để gửi lên server
    let answers = {
        teacherAlias: examData.teacherAlias, // Mã Alias của giáo viên
        examCode: examData.examCode,
        studentName: examData.studentName,
        className: examData.className
    };
    // Thu thập đáp án của radio buttons (MC và TF)
    document.querySelectorAll("input[type='radio']:checked").forEach(input => {
        answers[input.name] = input.value;
    });
    // Thu thập đáp án của input text (Numeric)
    document.querySelectorAll("input[type='text']").forEach(input => {
        if (input.name.startsWith('q') && input.value.trim()) { // Chỉ lấy input của câu hỏi và có giá trị
            answers[input.name] = input.value.trim();
        }
    });

    // Hiển thị loading Swal trong khi chờ server chấm điểm
    Swal.fire({
        title: 'Đang chấm điểm và nộp bài...',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    // Gọi Cloud Function để chấm điểm và lưu bài
    const submitExamCallable = functions.httpsCallable('submitExam');
    submitExamCallable(answers).then(result => {
        const submittedScore = result.data.score; // Điểm số từ server
        const serverExamData = result.data.examData; // Dữ liệu đề thi từ server (bao gồm keysStr, coreStr)
        const detailedResults = result.data.detailedResults; // Chi tiết từng câu (đáp án người dùng, đáp án đúng)

        Swal.close(); // Đóng loading Swal

        // Cập nhật giao diện bảng điểm cuối cùng
        document.getElementById('score').textContent = submittedScore.toFixed(2);
        document.getElementById('student-name').textContent = examData.studentName;
        document.getElementById('student-class').textContent = examData.className;
        document.getElementById('exam-code').textContent = examData.examCode;
        document.getElementById("result-container").style.display = "block";

        document.getElementById("gradeBtn").style.display = "none"; // Ẩn nút chấm điểm
        document.getElementById("quiz").style.display = "none"; // Ẩn đề thi sau khi nộp

        // Vòng lặp để hiển thị đáp án đúng và lời giải cho từng câu hỏi
        serverExamData.keysStr.forEach((key, i) => { // Dùng keysStr từ server để xác định loại và đáp án
            const questionDiv = document.querySelectorAll('.question')[i];
            if (!questionDiv) return;

            const resultForQ = detailedResults[`q${i}`]; // Lấy kết quả chi tiết cho câu hiện tại
            if (resultForQ) {
                // Tô màu đáp án đúng và hiển thị chi tiết cho từng loại câu hỏi
                if (resultForQ.type === 'MC') {
                    document.querySelectorAll(`input[name='q${i}']`).forEach(radio => {
                        if (radio.value === resultForQ.correctAnswer) {
                            radio.parentElement.classList.add("correct-answer");
                        }
                    });
                } else if (resultForQ.type === 'TF') {
                    const tfContainer = questionDiv.querySelector(`.tf-options`);
                    if (tfContainer) {
                        for (let j = 0; j < resultForQ.correctAnswer.length; j++) {
                            const groupName = `q${i}_sub${j}`;
                            const tfBox = tfContainer.querySelector(`.tf-box[data-group='${groupName}']`);
                            if (tfBox) {
                                tfBox.querySelectorAll('.tf-btn').forEach(btn => {
                                    if (btn.textContent.trim() === resultForQ.correctAnswer[j]) {
                                        btn.classList.add("correct-answer");
                                        if (!btn.querySelector(".correct-answer-display")) {
                                            let badge = document.createElement("span");
                                            badge.className = "correct-answer-display";
                                            badge.textContent = " Đáp án";
                                            btn.appendChild(badge);
                                        }
                                    }
                                });
                            }
                        }
                    }
                    // Cập nhật điểm T-F (letter grade)
                    let tfScores = (serverExamData.coreStr[1] || "").split(",").map(x => parseFloat(x));
                    let countCorrect = 0;
                    for (let j = 0; j < resultForQ.correctAnswer.length; j++) {
                        const userAnswerForSub = resultForQ.userAnswer ? resultForQ.userAnswer[j] : undefined;
                        if (userAnswerForSub === resultForQ.correctAnswer[j]) {
                            countCorrect++;
                        }
                    }
                    let tfLetter = "";
                    if (countCorrect >= 1 && countCorrect <= tfScores.length) {
                        // Giả định A, B, C, D cho 1, 2, 3, 4 câu đúng tương ứng với 4 mức điểm trong coreStr
                        tfLetter = ["A","B","C","D"][countCorrect - 1];
                    } else {
                        tfLetter = "F"; // F nếu không đúng câu nào hoặc ngoài phạm vi điểm
                    }
                    const tfGradeDisplay = document.getElementById(`tf-grade-${i}`);
                    if (tfGradeDisplay) tfGradeDisplay.textContent = `Điểm T-F: ${tfLetter}`;

                } else if (resultForQ.type === 'Numeric') {
                    const input = questionDiv.querySelector(`input[name='q${i}']`);
                    if (input) {
                        if (parseFloat(input.value.trim()) === parseFloat(resultForQ.correctAnswer)) {
                            input.parentElement.classList.add("correct");
                        }
                        let parent = input.parentElement;
                        let answerSpan = parent.querySelector(".correct-answer-display");
                        if (!answerSpan) {
                            answerSpan = document.createElement("span");
                            answerSpan.className = "correct-answer-display";
                            parent.appendChild(answerSpan);
                        }
                        answerSpan.textContent = `Đáp án: ${resultForQ.correctAnswer}`;
                    }
                }
            }

            // Hiển thị nút lời giải cho từng câu sau khi nộp bài
            const toggleBtn = questionDiv.querySelector(".toggle-explanation");
            if (toggleBtn) toggleBtn.style.display = "block";
        });

    }).catch(error => {
        Swal.close(); // Đóng loading Swal
        console.error("Error submitting exam:", error);
        Swal.fire('Lỗi', 'Lỗi khi nộp bài: ' + (error.message || error.details), 'error');
        showLoginScreen(); // Quay lại màn hình đăng nhập
    });
}

// Hàm hiển thị modal dialog các câu chưa trả lời
function showUnansweredDialog(unanswered) {
    Swal.fire({
        icon: 'info',
        title: 'Chưa làm xong',
        html: `<p>Bạn chưa trả lời một số câu sau:</p><ul>${unanswered.map(q => `<li>${q}</li>`).join('')}</ul>`,
        confirmButtonText: 'OK, để tôi xem lại'
    });
}

// --- Xử lý sự kiện khi tải trang ---
window.onload = function() {
    // Lắng nghe sự kiện thay đổi trên input teacherAlias để tự động tải danh sách lớp
    document.getElementById("teacherAlias").addEventListener('change', initializeClassDataForStudent);

    // Kiểm tra trạng thái đăng nhập giáo viên khi tải trang
    auth.onAuthStateChanged(user => {
        if (user) {
            currentTeacherId = user.uid;
            // Gọi Cloud Function để lấy lại thông tin giáo viên và trạng thái dùng thử
            const onTeacherSignInCallable = functions.httpsCallable('onTeacherSignIn');
            onTeacherSignInCallable().then(res => {
                const data = res.data;
                document.getElementById('teacherInfo').innerHTML = `
                    Chào mừng <b>${user.displayName || user.email}</b>!<br>
                    Email: ${user.email}.<br>
                    Thời gian dùng thử đến: <b>${new Date(data.trialEndDate).toLocaleDateString()}</b>.<br>
                    Bạn còn <b>${Math.ceil((new Date(data.trialEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))}</b> ngày dùng thử.<br>
                    Alias hiện tại: <b>${data.teacherAlias || 'Chưa có'}</b>
                `;
                currentTeacherAlias = data.teacherAlias;
                document.getElementById('teacherAliasInput').value = data.teacherAlias || '';
            }).catch(error => {
                console.error("Error on teacher sign in (onAuthStateChanged):", error);
                Swal.fire('Lỗi', 'Lỗi xử lý đăng nhập giáo viên: ' + (error.message || error.details), 'error');
                auth.signOut(); // Đăng xuất nếu có lỗi
            });
            showTeacherLogin(); // Tự động chuyển sang giao diện giáo viên nếu đã đăng nhập
        } else {
            currentTeacherId = null;
            currentTeacherAlias = null;
            document.getElementById('teacherInfo').textContent = '';
            document.getElementById('teacherAliasInput').value = '';
            // Mặc định hiển thị màn hình đăng nhập học sinh
            showLoginScreen();
        }
    });
};

// Tính năng chống gian lận (Tab Switching)
let tabSwitchCount = 0;
document.addEventListener("visibilitychange", function() {
  if (document.hidden) {
    tabSwitchCount++;
    if (tabSwitchCount >= 3) {
      Swal.fire({
        icon: 'warning',
        title: 'Chuyển tab quá nhiều',
        text: 'Bạn đã chuyển tab 3 lần. Bài thi sẽ tự nộp.',
        timer: 3000,
        timerProgressBar: true,
        showConfirmButton: false,
        allowOutsideClick: false
      }).then(() => {
        gradeQuiz();
      });
    } else {
      Swal.fire({
        icon: 'warning',
        title: 'Cảnh báo chuyển tab',
        text: `Bạn đã chuyển tab ${tabSwitchCount} lần. Nếu chuyển tab 3 lần, bài thi sẽ tự nộp.`,
        timer: 2000,
        timerProgressBar: true,
        showConfirmButton: false,
        allowOutsideClick: false
      });
    }
  }
});