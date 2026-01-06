// File: public/js/pdf-teacher.js (Phiên bản cuối cùng)

document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================================
    // KHỐI 1: KHAI BÁO
    // ==========================================================
    const auth = firebase.auth();
    const db = firebase.firestore();
    const functions = firebase.app().functions("asia-southeast1");
    let currentTeacherId = null;

    const getEl = id => document.getElementById(id);
    const teacherNameEl = getEl('teacherName');
    const pdfExamForm = getEl('pdfExamForm');
    const listContainer = getEl('pdf-exam-list');
    const examIdInput = getEl('examId');
    const examCodeInput = getEl('examCode');
    const timeLimitInput = getEl('timeLimit');
    const keysInput = getEl('keys');
    const coresInput = getEl('cores');
    const examPdfUrlInput = getEl('examPdfUrl');
    const solutionPdfUrlInput = getEl('solutionPdfUrl');

    // ==========================================================
    // KHỐI 2: ĐỊNH NGHĨA CÁC HÀM CHỨC NĂNG
    // ==========================================================
    
    function resetForm() {
        if (pdfExamForm) pdfExamForm.reset();
        if (examIdInput) examIdInput.value = '';
    }

    async function handlePdfExamFormSubmit() {
        if (!currentTeacherId) {
            return Swal.fire('Lỗi', 'Phiên đăng nhập không hợp lệ.', 'error');
        }
        const examId = examIdInput.value;
        const examCode = examCodeInput.value.trim();

        if (!examCode.toUpperCase().startsWith('PDF-')) {
            return Swal.fire("Lỗi định dạng", "Mã đề thi PDF phải có tiền tố 'PDF-'.", "error");
        }
        
        const examData = {
            examCode,
            timeLimit: parseInt(timeLimitInput.value, 10),
            keys: keysInput.value.trim().split('|'),
            cores: coresInput.value.trim().split('|'),
            examPdfUrl: examPdfUrlInput.value.trim(),
            solutionPdfUrl: solutionPdfUrlInput.value.trim(),
        };

        if (examData.keys.length !== examData.cores.length) {
            return Swal.fire('Lỗi', 'Số lượng Đáp án và Điểm không khớp.', 'error');
        }

        const functionName = examId ? "updatePdfExam" : "addPdfExam";
        const dataToSend = { examData };
        if (examId) dataToSend.examId = examId;

        Swal.fire({ title: 'Đang xử lý...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        try {
            const callable = functions.httpsCallable(functionName);
            const result = await callable(dataToSend);
            Swal.fire("Thành công!", result.data.message, "success");
            resetForm();
            loadPdfExams();
        } catch (error) {
            Swal.fire("Lỗi", `Lỗi khi lưu: ${error.message}`, "error");
        }
    }

    async function loadPdfExams() {
        if (!currentTeacherId) return;
        listContainer.innerHTML = '<div class="list-item">Đang tải...</div>';
        try {
            const getExams = functions.httpsCallable('getPdfExams');
            const result = await getExams();
            renderExamList(result.data);
        } catch (error) {
            listContainer.innerHTML = '<div class="list-item">Lỗi tải danh sách đề.</div>';
            Swal.fire('Lỗi', `Không thể tải danh sách đề: ${error.message}`, 'error');
        }
    }

    function renderExamList(exams) {
        listContainer.innerHTML = '';
        if (!exams || exams.length === 0) {
            listContainer.innerHTML = '<div class="list-item" style="text-align:center;">Chưa có đề thi PDF nào.</div>';
            return;
        }
        exams.sort((a, b) => a.examCode.localeCompare(b.examCode));
        exams.forEach(exam => {
            const item = document.createElement('div');
            item.className = 'list-item';
            const keyCount = Array.isArray(exam.keys) ? exam.keys.length : 0;
            item.innerHTML = `
                <div class="list-item-content">
                    <div class="list-item-title">${exam.examCode}</div>
                    <div class="list-item-details">
                        <span><i class="fas fa-list-ol"></i> ${keyCount} câu</span>
                        <span><i class="fas fa-clock"></i> ${exam.timeLimit} phút</span>
                    </div>
                </div>
                <div class="list-item-actions">
                    <button class="edit-btn" onclick="window.editPdfExam('${exam.id}')"><i class="fas fa-edit"></i> Sửa</button>
                    <button onclick="window.deletePdfExam('${exam.id}', '${exam.examCode}')"><i class="fas fa-trash-alt"></i> Xóa</button>
                </div>`;
            listContainer.appendChild(item);
        });
    }

    async function editPdfExam(examId) {
        try {
            Swal.fire({ title: 'Đang tải dữ liệu...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            const getExam = functions.httpsCallable('getSinglePdfExam');
            const result = await getExam({ examId });
            Swal.close();
            const exam = result.data;
            examIdInput.value = exam.id;
            examCodeInput.value = exam.examCode || '';
            timeLimitInput.value = exam.timeLimit || 90;
            keysInput.value = Array.isArray(exam.keys) ? exam.keys.join('|') : '';
            coresInput.value = Array.isArray(exam.cores) ? exam.cores.join('|') : '';
            examPdfUrlInput.value = exam.examPdfUrl || '';
            solutionPdfUrlInput.value = exam.solutionPdfUrl || '';
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (error) {
            Swal.fire('Lỗi', `Không thể tải chi tiết đề thi: ${error.message}`, 'error');
        }
    }

    async function deletePdfExam(examId, examCode) {
        const result = await Swal.fire({ title: `Xóa đề "${examCode}"?`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Xóa!' });
        if (result.isConfirmed) {
            Swal.fire({ title: 'Đang xóa...', didOpen: () => Swal.showLoading() });
            try {
                const deleteExamCallable = functions.httpsCallable('deletePdfExam');
                await deleteExamCallable({ examId });
                Swal.fire('Đã xóa!', `Đề thi ${examCode} đã được xóa.`, 'success');
                loadPdfExams();
            } catch (error) {
                Swal.fire('Lỗi!', error.message, 'error');
            }
        }
    }
    
    // TRONG FILE pdf-teacher.js

/**
 * Kiểm tra quyền truy cập của giáo viên bằng cách gọi một HTTP Function (onRequest).
 * Hàm này sử dụng fetch() và gửi ID token để xác thực.
 */
async function checkAccessAndLoadData() {
    // Hiển thị loading
    Swal.fire({ title: 'Đang kiểm tra quyền...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const user = auth.currentUser;
        if (!user) {
            // Lỗi này không nên xảy ra vì đã có onLogin, nhưng vẫn kiểm tra cho an toàn
            throw new Error("Không tìm thấy thông tin người dùng. Vui lòng đăng nhập lại.");
        }
        
        // 1. Lấy ID Token để chứng minh mình là ai
        const token = await user.getIdToken(true);

        // 2. Dùng `fetch` để gọi trực tiếp đến URL của HTTP Function
        const response = await fetch('https://asia-southeast1-sangnhc.cloudfunctions.net/checkTeacherAccess', {
            method: 'POST', // Hoặc 'GET' tùy theo hàm onRequest của bạn
            headers: {
                // Gửi token trong header Authorization, đây là cách chuẩn
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
                // Không cần gửi data trong body nếu hàm checkTeacherAccess không yêu cầu
            }
        });

        // 3. Xử lý phản hồi từ server
        // Chuyển đổi phản hồi thành JSON
        const accessInfo = await response.json();

        // Nếu response không thành công (vd: 401, 403, 500), `accessInfo` sẽ chứa object lỗi
        if (!response.ok) {
            // Ném lỗi với thông điệp từ server để hiển thị
            throw new Error(accessInfo.error || `Lỗi server: ${response.statusText}`);
        }
        
        // ---- TỪ ĐÂY, `accessInfo` CHÍNH LÀ OBJECT BẠN CẦN ----
        // Nó sẽ có dạng { hasAccess: true, daysRemaining: ... }
        
        Swal.close(); // Đóng loading

        if (accessInfo.hasAccess) {
            // Nếu có quyền, tải danh sách đề thi
            loadPdfExams();
        } else {
            // Nếu hết hạn, hiển thị thông báo và vô hiệu hóa form
            Swal.fire({
                icon: 'error',
                title: 'Tài khoản đã hết hạn',
                html: `Bạn không thể sử dụng chức năng này.<br>Vui lòng liên hệ quản trị viên.`,
                allowOutsideClick: false
            });
            document.querySelectorAll('#pdfExamForm input, #pdfExamForm button, .list-item-actions button').forEach(el => {
                el.disabled = true;
            });
        }
    } catch (error) {
        // Bắt tất cả các lỗi từ fetch, .json(), hoặc lỗi logic
        Swal.fire('Lỗi nghiêm trọng', `Không thể kiểm tra quyền truy cập: ${error.message}`, 'error');
    }
}

    // ==========================================================
    // KHỐI 3: KHỞI TẠO VÀ GÁN SỰ KIỆN
    // ==========================================================

    // --- Gán các hàm vào `window` để HTML có thể gọi ---
    window.signOut = () => AuthHelper_signOut(auth);
    window.resetForm = resetForm;
    window.handlePdfExamFormSubmit = handlePdfExamFormSubmit;
    window.editPdfExam = editPdfExam;
    window.deletePdfExam = deletePdfExam;

    // --- Khởi tạo xác thực ---
    // Gọi đến TÊN HÀM MỚI trong auth-manager.js
    AuthHelper_initialize(
        auth,
        (user) => { // onLogin
            currentTeacherId = user.uid;
            if (teacherNameEl) teacherNameEl.textContent = user.displayName || user.email;
            checkAccessAndLoadData();
        },
        () => { // onLogout
            Swal.fire("Chưa đăng nhập", "Bạn sẽ được chuyển về trang chủ.", "info")
               .then(() => window.location.href = '/');
        }
    );

});