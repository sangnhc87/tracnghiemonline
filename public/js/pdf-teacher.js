// Nội dung file public/js/pdf-teacher.js (Hoàn chỉnh)
const auth = firebase.auth();
const functions = firebase.functions();
let currentTeacherId = null;

auth.onAuthStateChanged(user => {
    if (user) {
        currentTeacherId = user.uid;
        document.getElementById('teacherName').textContent = user.displayName || user.email;
        loadPdfExams();
    } else {
        alert("Vui lòng đăng nhập để truy cập trang này.");
        window.location.href = '/';
    }
});

function signOut() { auth.signOut().then(() => window.location.href = '/'); }
function resetForm() { document.getElementById('pdfExamForm').reset(); document.getElementById('examId').value = ''; }

async function handlePdfExamFormSubmit() {
    const examId = document.getElementById('examId').value;
    const examCode = document.getElementById('examCode').value.trim();

    if (!examCode.toUpperCase().startsWith('PDF-')) {
        Swal.fire("Lỗi", "Mã đề thi PDF bắt buộc phải có tiền tố 'PDF-'.", "error");
        return;
    }

    const examData = {
        examCode: examCode,
        timeLimit: parseInt(document.getElementById('timeLimit').value, 10),
        keys: document.getElementById('keys').value.trim(),
        cores: document.getElementById('cores').value.trim(),
        examPdfUrl: document.getElementById('examPdfUrl').value.trim(),
        solutionPdfUrl: document.getElementById('solutionPdfUrl').value.trim(),
    };
    
    const functionName = examId ? "updatePdfExam" : "addPdfExam";
    const dataToSend = { examData };
    if (examId) dataToSend.examId = examId;

    try {
        const result = await functions.httpsCallable(functionName)(dataToSend);
        Swal.fire("Thành công!", result.data.message, "success");
        resetForm();
        loadPdfExams();
    } catch (error) {
        Swal.fire("Lỗi", `Lỗi khi lưu đề thi: ${error.message}`, "error");
    }
}

async function loadPdfExams() {
    const listContainer = document.getElementById('pdf-exam-list');
    listContainer.innerHTML = 'Đang tải...';
    try {
        const result = await functions.httpsCallable('getPdfExams')();
        listContainer.innerHTML = '';
        if (!result.data || result.data.length === 0) {
            listContainer.innerHTML = '<div class="list-item">Chưa có đề thi PDF nào.</div>';
            return;
        }
        result.data.forEach(exam => {
            const item = document.createElement('div');
            item.className = 'list-item';
            item.innerHTML = `
                <div class="list-item-content">
                    <div class="list-item-title">${exam.examCode}</div>
                    <div class="list-item-details">${exam.keys.split('|').length} câu - ${exam.timeLimit} phút</div>
                </div>
                <div class="list-item-actions">
                    <button class="edit-btn" onclick="editPdfExam('${exam.id}')" title="Sửa"><i class="fas fa-edit"></i></button>
                    <button onclick="deletePdfExam('${exam.id}', '${exam.examCode}')" title="Xóa"><i class="fas fa-trash-alt"></i></button>
                </div>`;
            listContainer.appendChild(item);
        });
    } catch (error) {
        listContainer.innerHTML = '<div class="list-item">Lỗi tải danh sách đề.</div>';
    }
}

window.editPdfExam = (examId) => {
    functions.httpsCallable('getSinglePdfExam')({ examId }).then(result => {
        const exam = result.data;
        document.getElementById('examId').value = exam.id;
        document.getElementById('examCode').value = exam.examCode;
        // Điền các trường khác...
    });
};

window.deletePdfExam = (examId, examCode) => {
    Swal.fire({
        title: 'Xác nhận xóa', text: `Bạn có chắc muốn xóa đề "${examCode}"?`,
        icon: 'warning', showCancelButton: true
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                await functions.httpsCallable('deletePdfExam')({ examId });
                Swal.fire('Đã xóa!', '', 'success');
                loadPdfExams();
            } catch (error) {
                Swal.fire('Lỗi!', error.message, 'error');
            }
        }
    });
};