// File: js/admin.js

document.addEventListener('DOMContentLoaded', () => {
    // --- Khởi tạo Firebase ---
    const auth = firebase.auth();
    const functions = firebase.functions();

    // --- Các phần tử DOM (Chỉ khai báo một lần) ---
    const adminNameEl = document.getElementById('adminName');
    const adminSignOutBtn = document.getElementById('adminSignOutBtn');
    const userSearchInput = document.getElementById('userSearchInput');
    const accessFilter = document.getElementById('accessFilter');
    const refreshUsersBtn = document.getElementById('refreshUsersBtn');
    const userListContainer = document.getElementById('userList');
    const loadingOverlay = document.getElementById('loading-overlay'); // Lớp phủ loading

    // --- Biến toàn cục ---
    // [QUAN TRỌNG]: THAY 'YOUR_ADMIN_EMAIL@gmail.com' BẰNG EMAIL ADMIN CỦA BẠN!
    const ADMIN_EMAIL = 'nguyensangnhc@gmail.com'; 
    let allUsersData = []; // Lưu trữ tất cả dữ liệu người dùng đã tải

    // --- Hàm tiện ích Loading ---
    const showLoading = () => { if (loadingOverlay) loadingOverlay.style.display = 'flex'; };
    const hideLoading = () => { if (loadingOverlay) loadingOverlay.style.display = 'none'; };

    // --- Hàm chuyển đổi định dạng ngày tháng (nếu cần hiển thị) ---
    function formatDateToLocaleString(isoString) {
        if (!isoString) return 'N/A';
        const date = new Date(isoString);
        return date.toLocaleDateString('vi-VN', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });
    }

    // --- Xác thực Admin khi tải trang ---
    auth.onAuthStateChanged(user => {
        if (user && user.email === ADMIN_EMAIL) {
            adminNameEl.textContent = user.displayName || user.email;
            loadUsers(); // Tải danh sách người dùng
        } else {
            // Nếu không phải Admin, chuyển hướng và thông báo
            Swal.fire({
                icon: 'error',
                title: 'Truy cập bị từ chối',
                text: 'Bạn không có quyền quản trị. Vui lòng đăng nhập bằng tài khoản Admin.',
                allowOutsideClick: false,
                confirmButtonText: 'Đăng nhập lại'
            }).then(() => {
                auth.signOut(); // Đăng xuất để tránh nhầm lẫn
                window.location.href = '/'; // Chuyển về trang chủ
            });
        }
    });

    // --- Xử lý sự kiện các nút và input ---
    adminSignOutBtn.addEventListener('click', () => {
        auth.signOut().then(() => {
            window.location.href = '/';
        });
    });
    userSearchInput.addEventListener('input', applyFilters); // Lọc khi gõ
    accessFilter.addEventListener('change', applyFilters); // Lọc khi thay đổi loại truy cập
    refreshUsersBtn.addEventListener('click', loadUsers); // Tải lại danh sách

    // --- Các hàm chính ---

    // Tải danh sách người dùng từ Firebase Functions
    async function loadUsers() {
        userListContainer.innerHTML = '<p class="loading-text">Đang tải danh sách giáo viên...</p>';
        showLoading(); // Hiển thị loading
        try {
            const getUsersCallable = functions.httpsCallable('adminGetUsers');
            const result = await getUsersCallable();
            allUsersData = result.data; // Lưu trữ dữ liệu thô
            applyFilters(); // Áp dụng bộ lọc và hiển thị
        } catch (error) {
            // Sửa lỗi danger_color: dùng mã màu trực tiếp
            userListContainer.innerHTML = `<p class="loading-text" style="color: #dc3545;">Lỗi tải danh sách: ${error.message}</p>`;
            Swal.fire('Lỗi', `Không thể tải danh sách giáo viên: ${error.message}`, 'error');
        } finally {
            hideLoading(); // Ẩn loading
        }
    }

    // Áp dụng bộ lọc và tìm kiếm cho dữ liệu đã tải
    function applyFilters() {
        const searchTerm = userSearchInput.value.toLowerCase().trim();
        const filterType = accessFilter.value;
        
        let filteredUsers = allUsersData.filter(user => {
            // Lọc theo từ khóa tìm kiếm
            const matchesSearch = user.email.toLowerCase().includes(searchTerm) ||
                                  (user.name && user.name.toLowerCase().includes(searchTerm).trim()) || // trim() thêm ở đây
                                  (user.teacherAlias && user.teacherAlias.toLowerCase().includes(searchTerm).trim()); // trim() thêm ở đây
            
            if (!matchesSearch) return false;

            // Lọc theo trạng thái truy cập
            if (filterType === 'all') return true;

            const trialEndDate = user.trialEndDate ? new Date(user.trialEndDate) : null;
            const isExpired = !trialEndDate || trialEndDate.getTime() < Date.now();

            if (filterType === 'active') return !isExpired;
            if (filterType === 'expired') return isExpired;

            return true; // Mặc định
        });

        renderUserTable(filteredUsers);
    }

    // Hiển thị bảng người dùng
    function renderUserTable(users) {
        if (!users || users.length === 0) {
            userListContainer.innerHTML = '<p class="loading-text">Không tìm thấy giáo viên nào.</p>';
            return;
        }

        let tableHtml = `
            <table class="user-table">
                <thead>
                    <tr>
                        <th>Email</th>
                        <th>Tên</th>
                        <th>Mã giáo viên</th>
                        <th>Trạng thái</th>
                        <th>Ngày hết hạn</th>
                        <th>Hành động</th>
                    </tr>
                </thead>
                <tbody>
        `;

        users.forEach(user => {
            const trialEndDate = user.trialEndDate ? new Date(user.trialEndDate) : null;
            const isExpired = !trialEndDate || trialEndDate.getTime() < Date.now();
            const statusClass = isExpired ? 'expired' : 'active';
            const statusText = isExpired ? 'Hết hạn' : 'Đang hoạt động';
            
            // Lấy ngày hết hạn theo định dạng YYYY-MM-DD cho input type="date"
            const isoDateValue = trialEndDate ? trialEndDate.toISOString().split('T')[0] : '';

            tableHtml += `
                <tr>
                    <td>${user.email}</td>
                    <td>${user.name || 'N/A'}</td>
                    <td>${user.teacherAlias || 'N/A'}</td>
                    <td><span class="trial-status ${statusClass}">${statusText}</span></td>
                    <td>
                        <input type="date" class="date-input" id="date-${user.id}" value="${isoDateValue}">
                    </td>
                    <td>
                        <!-- ĐÃ SỬA: user.id ĐƯỢC BỌC TRONG DẤU NHÁY ĐƠN -->
                        <button class="save-btn" onclick="updateUserTrial('${user.id}', document.getElementById('date-${user.id}').value)"><i class="fas fa-save"></i> Lưu</button>
                    </td>
                </tr>
            `;
        });

        tableHtml += `</tbody></table>`;
        userListContainer.innerHTML = tableHtml;

        // Khởi tạo Flatpickr cho tất cả các input type="date" vừa được tạo
        // (Lưu ý: hàm flatpickr nhận selector, nên nó sẽ áp dụng cho tất cả các phần tử khớp)
        flatpickr(".date-input", {
            dateFormat: "Y-m-d", // Định dạng ngày tháng
            minDate: "today",     // Không cho chọn ngày trong quá khứ
        });
    }

    // Cập nhật ngày hết hạn cho người dùng
    // Gán hàm này vào window để nó có thể được gọi từ HTML onclick
    window.updateUserTrial = async (userId, newDateValue) => {
        if (!newDateValue) {
            Swal.fire('Lỗi', 'Vui lòng chọn ngày hết hạn mới.', 'warning');
            return;
        }
        
        showLoading();
        try {
            // newDateValue đã là định dạng YYYY-MM-DD từ input date, chỉ cần chuyển sang ISO string
            const newTrialEndDateISO = new Date(newDateValue).toISOString(); 
            const updateCallable = functions.httpsCallable('adminUpdateUserTrialDate');
            const result = await updateCallable({ userId: userId, newTrialEndDateISO: newTrialEndDateISO });
            
            Swal.fire('Thành công', result.data.message, 'success');
            loadUsers(); // Tải lại danh sách để cập nhật trạng thái
        } catch (error) {
            Swal.fire('Lỗi', `Không thể cập nhật ngày hết hạn: ${error.message}`, 'error');
        } finally {
            hideLoading();
        }
    };
});