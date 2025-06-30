// File: js/main.js (hoặc file JS của trang index.html)

// THAY THẾ HÀM NÀY
async function updateTeacherUI(user) {
    showLoading();
    try {
        // Gọi hàm onTeacherSignIn như cũ để đảm bảo hồ sơ được tạo/cập nhật
        const res = await functions.httpsCallable("onTeacherSignIn")();
        const data = res.data;
        
        // Tính toán ngày hết hạn
        // Dòng này rất quan trọng để xử lý cả 2 định dạng timestamp
        const trialDate = data.trialEndDate?.seconds 
            ? new Date(data.trialEndDate.seconds * 1000) 
            : (data.trialEndDate ? new Date(data.trialEndDate) : null);
            
        const trialDays = trialDate ? Math.max(0, Math.ceil((trialDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0;
        
        // Tạo HTML để hiển thị
        const userInfoHtml = `
            <p><strong>Tên:</strong> ${user.displayName || user.email}</p>
            <p><strong>Alias:</strong> <span id="currentAliasDisplay">${data.teacherAlias || "Chưa có"}</span></p>
            <p><strong>Trạng thái:</strong> 
                ${trialDays > 0 
                    ? `<span style="color: green;">Còn ${trialDays} ngày dùng thử</span>` 
                    : `<span style="color: red;">Đã hết hạn dùng thử</span>`
                }
            </p>`;
        
        // Gán vào phần tử teacherInfo
        getEl("teacherInfo").innerHTML = userInfoHtml;
        getEl("teacherInfo").style.display = "block";
        getEl("teacherActions").style.display = "flex";
        getEl("teacherAliasInput").value = data.teacherAlias || "";
        
        // Gán tên cho dashboard
        const teacherDashboardNameEl = getEl("teacherDashboardName");
        if (teacherDashboardNameEl) {
            teacherDashboardNameEl.textContent = user.displayName || user.email;
        }

    } catch (error) {
        Swal.fire("Lỗi", `Lỗi xử lý đăng nhập: ${error.message || "Không thể lấy thông tin người dùng."}`, "error");
        auth.signOut();
    } finally {
        hideLoading();
    }
}


// File: js/pdf-teacher.js (Bản nâng cấp)

document.addEventListener('DOMContentLoaded', () => {
    // ... các biến và đối tượng DOM khác ...
    const auth = firebase.auth();
    const functions = firebase.functions();

    auth.onAuthStateChanged(user => {
        if (user) {
            // Thay vì gọi loadPdfExams() ngay, hãy gọi hàm kiểm tra quyền
            checkAccessAndProceed(user);
        } else {
            window.location.href = '/';
        }
    });

    /**
     * [MỚI] Hàm kiểm tra quyền truy cập trước khi chạy các chức năng chính
     */
    async function checkAccessAndProceed(user) {
        try {
            const checkAccessCallable = functions.httpsCallable('checkTeacherAccess');
            const result = await checkAccessCallable();
            const accessInfo = result.data;

            if (accessInfo.hasAccess) {
                // Nếu được phép, chạy các hàm như bình thường
                if (teacherNameEl) teacherNameEl.textContent = user.displayName || user.email;
                loadPdfExams();
            } else {
                // Nếu hết hạn, hiển thị thông báo và vô hiệu hóa form
                Swal.fire({
                    icon: 'error',
                    title: 'Tài khoản đã hết hạn',
                    text: 'Bạn không thể thêm hoặc sửa đề thi. Vui lòng liên hệ quản trị viên.',
                    allowOutsideClick: false
                });
                // Vô hiệu hóa các nút và form
                document.querySelectorAll('#pdfExamForm input, #pdfExamForm button').forEach(el => {
                    el.disabled = true;
                });
            }
        } catch (error) {
            Swal.fire('Lỗi nghiêm trọng', `Không thể kiểm tra quyền truy cập: ${error.message}`, 'error');
        }
    }
    
    // ... các hàm còn lại của bạn (handlePdfExamFormSubmit, loadPdfExams...) giữ nguyên ...
});


/*thêm quản lý đăng nhập*/

/**
 * [MỚI & AN TOÀN] Kiểm tra quyền truy cập của giáo viên.
 * Trả về thông tin trạng thái tài khoản và ngày hết hạn.
 */
exports.checkTeacherAccess = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
    }

    const userRef = db.collection("users").doc(context.auth.uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
        // Trường hợp rất hiếm: đã auth nhưng chưa có record trong DB.
        // Có thể gọi lại hàm onTeacherSignIn để tạo.
        // Hoặc đơn giản là báo lỗi.
        throw new functions.https.HttpsError("not-found", "Không tìm thấy hồ sơ người dùng.");
    }

    const userData = userDoc.data();
    const trialEndDate = userData.trialEndDate; // Đây là một Timestamp object

    if (!trialEndDate) {
        // Nếu không có ngày hết hạn -> coi như hết hạn
        return {
            hasAccess: false,
            message: "Tài khoản không có thông tin dùng thử.",
            daysRemaining: 0
        };
    }

    // Chuyển đổi Timestamp sang mili giây để so sánh
    const trialEndDateMillis = trialEndDate.toMillis();
    const nowMillis = Date.now();
    const daysRemaining = Math.max(0, Math.ceil((trialEndDateMillis - nowMillis) / (1000 * 60 * 60 * 24)));

    return {
        hasAccess: nowMillis < trialEndDateMillis, // True nếu chưa hết hạn
        trialEndDate: trialEndDate.toDate().toISOString(), // Trả về dạng chuỗi ISO cho dễ dùng ở client
        daysRemaining: daysRemaining
    };
});