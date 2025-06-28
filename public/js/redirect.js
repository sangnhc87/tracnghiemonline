// Nội dung file public/js/redirect.js
function handleStartExam() {
    const examCode = document.getElementById("examCode").value.trim();

    if (examCode.toUpperCase().startsWith('PDF-')) {
        const teacherAlias = document.getElementById("teacherAlias").value.trim();
        const studentName = document.getElementById("studentSelect").value;
        const className = document.getElementById("classSelect").value;

        if (!teacherAlias || !studentName || !className) {
            Swal.fire("Cảnh báo", "Vui lòng nhập đủ Mã GV, Lớp và Tên.", "warning");
            return;
        }
        
        sessionStorage.setItem('studentInfoForPdf', JSON.stringify({ teacherAlias, examCode, studentName, className }));
        window.location.href = '/pdf-exam.html'; // Chuyển hướng đến trang mới
    } else {
        // Gọi hàm startExam gốc của hệ thống cũ
        window.startExam();
    }
}