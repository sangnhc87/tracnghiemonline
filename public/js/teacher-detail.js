document.addEventListener('DOMContentLoaded', () => {
    // -------------------------------------------------------------------
    // BƯỚC 1: KHỞI TẠO VÀ KHAI BÁO
    // -------------------------------------------------------------------

    // Khởi tạo các dịch vụ Firebase
    const auth = firebase.auth();
    const functions = firebase.app().functions("asia-southeast1");

    // Lấy các phần tử DOM quan trọng trên trang
    const getEl = id => document.getElementById(id);
    const loadingOverlay = getEl('loading-overlay');
    const teacherEmailEl = getEl('teacher-email');
    const teacherNameEl = getEl('teacher-name');
    const teacherAliasEl = getEl('teacher-alias');
    const teacherCreatedEl = getEl('teacher-created');
    const storageUsageEl = getEl('storage-usage');
    const storageFilesEl = getEl('storage-files');
    const examListContainer = getEl('exam-list-container');

    // Lấy UID của giáo viên cần xem từ thanh địa chỉ (URL)
    const urlParams = new URLSearchParams(window.location.search);
    const teacherUid = urlParams.get('uid');


    // -------------------------------------------------------------------
    // BƯỚC 2: KIỂM TRA QUYỀN VÀ BẮT ĐẦU TẢI DỮ LIỆU
    // -------------------------------------------------------------------

    // Nếu không có UID trong URL, báo lỗi và dừng lại
    if (!teacherUid) {
        document.body.innerHTML = '<h1 style="text-align: center; margin-top: 50px;">Lỗi: Không tìm thấy UID của giáo viên trong địa chỉ URL.</h1>';
        if (loadingOverlay) loadingOverlay.style.display = 'none';
        return;
    }

    // Lắng nghe trạng thái đăng nhập của Admin
    auth.onAuthStateChanged(user => {
        // Chỉ tiếp tục nếu có người dùng đăng nhập VÀ email của họ là email admin
        if (user && user.email === 'nguyensangnhc@gmail.com') { // <<< THAY EMAIL ADMIN CỦA BẠN VÀO ĐÂY
            loadTeacherDetails(); // Bắt đầu tải dữ liệu chi tiết
        } else {
            // Nếu không phải admin, báo lỗi và chuyển hướng về trang chủ
            Swal.fire('Truy cập bị từ chối', 'Bạn không có quyền truy cập trang này.', 'error')
               .then(() => window.location.href = '/');
        }
    });


    // -------------------------------------------------------------------
    // BƯỚC 3: CÁC HÀM CHÍNH (GỌI SERVER VÀ HIỂN THỊ)
    // -------------------------------------------------------------------

    // Hàm chính để gọi Cloud Function và nhận dữ liệu chi tiết
    async function loadTeacherDetails() {
        if (loadingOverlay) loadingOverlay.style.display = 'flex';
        try {
            // Gọi Cloud Function 'adminGetTeacherDetails'
            const getDetailsCallable = functions.httpsCallable('adminGetTeacherDetails');
            const result = await getDetailsCallable({ teacherUid: teacherUid });
            const data = result.data;

            // Cập nhật giao diện với dữ liệu nhận được
            displayProfileInfo(data.profile);
            displayStorageInfo(data.storageUsage);
            renderExamTable(data.exams);

        } catch (error) {
            Swal.fire('Lỗi tải dữ liệu', `Không thể tải chi tiết: ${error.message}`, 'error');
            examListContainer.innerHTML = `<p style="color: red;">Lỗi: ${error.message}</p>`;
        } finally {
            if (loadingOverlay) loadingOverlay.style.display = 'none';
        }
    }

    // Hàm hiển thị thông tin cá nhân của giáo viên
    function displayProfileInfo(profile) {
        if (!profile) return;
        teacherEmailEl.textContent = profile.email || 'N/A';
        teacherNameEl.textContent = profile.name || 'N/A';
        teacherAliasEl.textContent = profile.teacherAlias || 'Chưa có';
        if (profile.createdAt && profile.createdAt._seconds) {
            teacherCreatedEl.textContent = new Date(profile.createdAt._seconds * 1000).toLocaleString('vi-VN');
        } else {
            teacherCreatedEl.textContent = 'N/A';
        }
    }

    // Hàm hiển thị thông tin dung lượng lưu trữ
    function displayStorageInfo(storage) {
        if (!storage) return;
        storageUsageEl.textContent = `${storage.totalSizeMB} MB`;
        storageFilesEl.textContent = `${storage.totalFiles} files`;
    }

    // Hàm vẽ bảng danh sách đề thi
    function renderExamTable(exams) {
        if (!exams || exams.length === 0) {
            examListContainer.innerHTML = '<p>Giáo viên này chưa tạo đề thi nào.</p>';
            return;
        }

        let tableHtml = `
            <table class="user-table">
                <thead>
                    <tr>
                        <th>STT</th>
                        <th>Mã đề</th>
                        <th>Loại</th>
                        <th>Ngày tạo</th>
                        <th>Hành động</th>
                    </tr>
                </thead>
                <tbody>`;
        
        exams.forEach((exam, index) => {
            const createdAt = (exam.createdAt && exam.createdAt._seconds) 
                                ? new Date(exam.createdAt._seconds * 1000).toLocaleDateString('vi-VN') 
                                : 'N/A';

            // Kiểm tra xem đề có nội dung trên Storage không
            const hasStorageContent = exam.storageVersion === 2 && exam.contentStoragePath;

            tableHtml += `
                <tr>
                    <td>${index + 1}</td>
                    <td>${exam.examCode}</td>
                    <td>${exam.examType || 'TEXT'}</td>
                    <td>${createdAt}</td>
                    <td class="action-buttons">
                        <!-- Nút XEM: Chỉ hiển thị nếu có nội dung trên Storage -->
                        ${hasStorageContent ? 
                            `<button class="btn btn-view" onclick="adminViewExamContent('${exam.id}')" title="Xem nội dung"><i class="fas fa-search"></i> Xem</button>` 
                            : ''
                        }
                        
                        <!-- Nút XÓA -->
                        <button class="btn-delete" onclick="adminDeleteExam('${exam.id}', '${exam.examCode}')" title="Xóa"><i class="fas fa-trash-alt"></i> Xóa</button>
                    </td>
                </tr>
            `;
        });
        
        tableHtml += `</tbody></table>`;
        examListContainer.innerHTML = tableHtml;
    }


    // -------------------------------------------------------------------
    // BƯỚC 4: CÁC HÀM HÀNH ĐỘNG (GÁN VÀO WINDOW)
    // -------------------------------------------------------------------

    // Hàm xem nội dung đề thi (gọi khi click nút "Xem")
    window.adminViewExamContent = async (examId) => {
        if (loadingOverlay) loadingOverlay.style.display = 'flex';
        try {
            // Gọi Cloud Function 'adminGetExamContent'
            const getContentCallable = functions.httpsCallable('adminGetExamContent');
            const result = await getContentCallable({ examId: examId });
            const content = result.data.content;
            
            // Hiển thị nội dung bằng SweetAlert2
            Swal.fire({
                title: 'Nội dung đề thi',
                html: `<pre style="text-align: left; white-space: pre-wrap; word-wrap: break-word; max-height: 70vh; overflow-y: auto;">${content}</pre>`,
                width: '80%',
                confirmButtonText: 'Đóng'
            });

        } catch (error) {
            Swal.fire('Lỗi', `Không thể tải nội dung đề thi: ${error.message}`, 'error');
        } finally {
            if (loadingOverlay) loadingOverlay.style.display = 'none';
        }
    };

    // Hàm xóa đề thi (gọi khi click nút "Xóa")
    window.adminDeleteExam = (examId, examCode) => {
        Swal.fire({
            title: 'Xác nhận xóa',
            html: `Bạn có chắc muốn xóa vĩnh viễn đề <b>"${examCode}"</b> của giáo viên này?<br>Hành động này không thể hoàn tác!`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonText: 'Hủy',
            confirmButtonText: 'Xóa ngay!'
        }).then(async (result) => {
            if (result.isConfirmed) {
                if (loadingOverlay) loadingOverlay.style.display = 'flex';
                try {
                    // Dùng lại hàm deleteExam đã có
                    const deleteCallable = functions.httpsCallable('deleteExam'); 
                    await deleteCallable({ examId: examId });
                    Swal.fire('Đã xóa!', `Đề thi ${examCode} đã được xóa.`, 'success');
                    loadTeacherDetails(); // Tải lại dữ liệu sau khi xóa để cập nhật danh sách
                } catch (error) {
                    Swal.fire('Lỗi!', `Không thể xóa đề thi: ${error.message}`, 'error');
                } finally {
                    if (loadingOverlay) loadingOverlay.style.display = 'none';
                }
            }
        });
    };

});