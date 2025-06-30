// Đặt tất cả code vào trong sự kiện DOMContentLoaded để đảm bảo các phần tử HTML đã được tải
document.addEventListener('DOMContentLoaded', () => {
    // Khởi tạo Firebase
    const auth = firebase.auth();
    const functions = firebase.functions();
    let currentTeacherId = null;

    // --- CÁC ĐỐI TƯỢNG DOM ---
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

    // --- XÁC THỰC ---
    auth.onAuthStateChanged(user => {
        if (user) {
            currentTeacherId = user.uid;
            if (teacherNameEl) teacherNameEl.textContent = user.displayName || user.email;
            loadPdfExams();
        } else {
            Swal.fire("Chưa đăng nhập", "Vui lòng đăng nhập để truy cập trang này.", "warning")
               .then(() => window.location.href = '/');
        }
    });

    // --- GÁN SỰ KIỆN ---
    if (pdfExamForm) {
        pdfExamForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handlePdfExamFormSubmit();
        });
    }

    // --- CÁC HÀM XỬ LÝ ---
    window.signOut = () => auth.signOut().then(() => window.location.href = '/');
    window.resetForm = () => {
        pdfExamForm.reset();
        examIdInput.value = '';
    };

    async function GGGhandlePdfExamFormSubmit() {
        const examId = examIdInput.value;
        const examCode = examCodeInput.value.trim();

        if (!examCode.toUpperCase().startsWith('PDF-')) {
            Swal.fire("Lỗi", "Mã đề thi PDF bắt buộc phải có tiền tố 'PDF-'.", "error");
            return;
        }

        const examData = {
            examCode: examCode,
            timeLimit: parseInt(timeLimitInput.value, 10),
            keys: keysInput.value.trim(),
            cores: coresInput.value.trim(),
            examPdfUrl: examPdfUrlInput.value.trim(),
            solutionPdfUrl: solutionPdfUrlInput.value.trim(),
        };
        
        const functionName = examId ? "updatePdfExam" : "addPdfExam";
        const dataToSend = { examData };
        if (examId) dataToSend.examId = examId;

        try {
            const callableFunction = functions.httpsCallable(functionName);
            const result = await callableFunction(dataToSend);
            Swal.fire("Thành công!", result.data.message, "success");
            window.resetForm();
            loadPdfExams();
        } catch (error) {
            Swal.fire("Lỗi", `Lỗi khi lưu đề thi: ${error.message}`, "error");
        }
    }
// Hàm gốc của bạn, giờ được nâng cấp
async function handlePdfExamFormSubmit() {
    // === PHẦN 1: Lấy dữ liệu và các phần tử DOM ===
    // (Giữ nguyên như code gốc của bạn)
    const examId = examIdInput.value;
    const examCode = examCodeInput.value.trim();
    const keysValue = keysInput.value.trim();
    const coresValue = coresInput.value.trim();

    // === PHẦN 2: KIỂM TRA DỮ LIỆU ĐẦU VÀO (NÂNG CẤP) ===

    // 2.1: Kiểm tra tiền tố 'PDF-' (Đã có, giữ nguyên)
    if (!examCode.toUpperCase().startsWith('PDF-')) {
        Swal.fire("Lỗi định dạng", "Mã đề thi PDF bắt buộc phải có tiền tố 'PDF-'.", "error");
        return; // Dừng lại
    }

    // 2.2: [NÂNG CẤP] Kiểm tra khớp số lượng Đáp án và Điểm
    // Đếm số lượng phần tử bằng cách tách chuỗi và lọc bỏ các phần tử rỗng
    const keysCount = keysValue.split('|').filter(k => k.trim() !== '').length;
    const coresCount = coresValue.split('|').filter(c => c.trim() !== '').length;

    // Nếu cả hai đều có giá trị và không bằng nhau -> báo lỗi
    if (keysCount > 0 && coresCount > 0 && keysCount !== coresCount) {
        Swal.fire({
            icon: 'error',
            title: 'Dữ liệu không khớp!',
            html: `Số lượng <b>Đáp án (${keysCount})</b> không bằng số lượng <b>Điểm (${coresCount})</b>.<br>Vui lòng kiểm tra lại!`,
        });
        return; // Dừng lại
    }

    // === PHẦN 3: CHUẨN BỊ DỮ LIỆU VÀ GỌI SERVER ===
    const examData = {
        examCode: examCode,
        timeLimit: parseInt(timeLimitInput.value, 10),
        keys: keysValue,
        cores: coresValue,
        examPdfUrl: examPdfUrlInput.value.trim(),
        solutionPdfUrl: solutionPdfUrlInput.value.trim(),
    };
    
    const functionName = examId ? "updatePdfExam" : "addPdfExam";
    const dataToSend = { examData };
    if (examId) dataToSend.examId = examId;
    
    // [NÂNG CẤP] Hiển thị loading trước khi gọi hàm
    Swal.fire({
        title: 'Đang xử lý...',
        text: 'Vui lòng chờ trong giây lát.',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    try {
        const callableFunction = functions.httpsCallable(functionName);
        const result = await callableFunction(dataToSend);
        
        // Đóng loading và hiển thị thông báo thành công
        Swal.fire("Thành công!", result.data.message, "success");
        
        // Gọi các hàm dọn dẹp và tải lại dữ liệu
        window.resetForm();
        loadPdfExams();

    } catch (error) {
        // [NÂNG CẤP] Đóng loading và hiển thị thông báo lỗi thân thiện hơn
        Swal.fire("Đã có lỗi xảy ra", `Lỗi: ${error.message}`, "error");
    }
}
    async function loadPdfExams() {
        listContainer.innerHTML = '<div class="list-item">Đang tải...</div>';
        try {
            const getPdfExamsCallable = functions.httpsCallable('getPdfExams');
            const result = await getPdfExamsCallable();
            const exams = result.data;

            listContainer.innerHTML = '';
            if (!exams || exams.length === 0) {
                listContainer.innerHTML = '<div class="list-item">Chưa có đề thi PDF nào.</div>';
                return;
            }
            exams.forEach(exam => {
                const item = document.createElement('div');
                item.className = 'list-item';
                // Đảm bảo keys là mảng trước khi truy cập length
                const keyCount = Array.isArray(exam.keys) ? exam.keys.length : (exam.keys || "").split('|').length;
                item.innerHTML = `
                    <div class="list-item-content">
                        <div class="list-item-title">${exam.examCode}</div>
                        <div class="list-item-details">${keyCount} câu - ${exam.timeLimit} phút</div>
                    </div>
                    <div class="list-item-actions">
                        <button class="edit-btn" onclick="editPdfExam('${exam.id}')" title="Sửa"><i class="fas fa-edit"></i></button>
                        <button onclick="deletePdfExam('${exam.id}', '${exam.examCode}')" title="Xóa"><i class="fas fa-trash-alt"></i></button>
                    </div>`;
                listContainer.appendChild(item);
            });
        } catch (error) {
            listContainer.innerHTML = '<div class="list-item">Lỗi tải danh sách đề.</div>';
            Swal.fire('Lỗi', `Không thể tải danh sách đề PDF: ${error.message}`, 'error');
        }
    }
    
    // Gán các hàm vào window để HTML có thể gọi
    window.editPdfExam = async (examId) => {
        try {
            const getSinglePdfExamCallable = functions.httpsCallable('getSinglePdfExam');
            const result = await getSinglePdfExamCallable({ examId });
            const exam = result.data;
            
            // Điền đầy đủ thông tin vào form
            examIdInput.value = exam.id;
            examCodeInput.value = exam.examCode || '';
            timeLimitInput.value = exam.timeLimit || 90;
            // Chuyển mảng keys/cores về lại chuỗi để hiển thị
            keysInput.value = Array.isArray(exam.keys) ? exam.keys.join('|') : '';
            coresInput.value = Array.isArray(exam.cores) ? exam.cores.join('|') : '';
            examPdfUrlInput.value = exam.examPdfUrl || '';
            solutionPdfUrlInput.value = exam.solutionPdfUrl || '';
            
            // Cuộn lên đầu trang để người dùng thấy form
            window.scrollTo({ top: 0, behavior: 'smooth' });

        } catch (error) {
            Swal.fire('Lỗi', `Không thể tải chi tiết đề thi: ${error.message}`, 'error');
        }
    };

    window.deletePdfExam = (examId, examCode) => {
        Swal.fire({
            title: 'Xác nhận xóa', text: `Bạn có chắc muốn xóa đề "${examCode}"?`,
            icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33',
            cancelButtonText: 'Hủy', confirmButtonText: 'Xóa!'
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    const deletePdfExamCallable = functions.httpsCallable('deletePdfExam');
                    await deletePdfExamCallable({ examId });
                    Swal.fire('Đã xóa!', `Đề thi ${examCode} đã được xóa.`, 'success');
                    loadPdfExams();
                } catch (error) {
                    Swal.fire('Lỗi!', error.message, 'error');
                }
            }
        });
    };
});