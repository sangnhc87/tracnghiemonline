// File: public/js/app-initializer.js

document.addEventListener('DOMContentLoaded', () => {
    const auth = firebase.auth();
    const db = firebase.firestore();

    // Hàm hiển thị lỗi chung và chuyển hướng
    function showErrorAndRedirect(message, redirectUrl = null) {
        document.body.innerHTML = `<div style="padding: 50px; text-align: center;"><h1>Lỗi</h1><p>${message}</p>${redirectUrl ? `<a href="${redirectUrl}">Quay lại trang đăng nhập</a>` : ''}</div>`;
        Swal.fire({
            title: 'Lỗi Truy Cập',
            text: message,
            icon: 'error',
            confirmButtonText: 'OK',
            allowOutsideClick: false,
        }).then(() => {
            if (redirectUrl) {
                window.location.href = redirectUrl;
            }
        });
    }

    // Hàm xác thực quyền sở hữu alias
    async function verifyOwnership(uid, alias) {
        if (!alias) return false;
        try {
            const query = await db.collection("users").where("alias", "==", alias).limit(1).get();
            return !query.empty && query.docs[0].id === uid;
        } catch (e) {
            console.error("Lỗi xác thực quyền sở hữu:", e);
            return false;
        }
    }

    // Luồng khởi động chính
    AuthHelper_initialize(
        auth,
        async (user) => { // onLogin
            // Lấy thông tin từ URL
            const urlParams = new URLSearchParams(window.location.search);
            const returnToUrl = urlParams.get('returnTo');
            const aliasFromUrl = urlParams.get('id');

            // Ưu tiên chuyển hướng nếu có
            if (returnToUrl) {
                window.location.href = returnToUrl;
                return;
            }

            // Tạo một object `context` để truyền vào hàm mainApp
            const appContext = {
                user: user,
                alias: aliasFromUrl,
                isOwner: await verifyOwnership(user.uid, aliasFromUrl)
            };
            
            // Tìm và gọi hàm mainApp của trang hiện tại
            if (typeof window.mainApp === 'function') {
                window.mainApp(appContext);
            } else {
                console.warn("Hàm 'mainApp(appContext)' chưa được định nghĩa trên trang này.");
            }
        },
        () => { // onLogout
            // Nếu người dùng đăng xuất, kiểm tra xem trang có yêu cầu đăng nhập không
            // Giả sử các trang cần đăng nhập sẽ có một thẻ meta đặc biệt
            const requireAuth = document.querySelector('meta[name="require-auth"]');
            if (requireAuth) {
                const returnUrl = window.location.href;
                const loginUrl = `/index.html#teacherLogin?returnTo=${encodeURIComponent(returnUrl)}`;
                showErrorAndRedirect("Bạn cần đăng nhập để truy cập trang này.", loginUrl);
            } else {
                 // Nếu trang không yêu cầu đăng nhập, gọi mainApp với context rỗng
                 if (typeof window.mainApp === 'function') {
                    window.mainApp({ user: null, alias: new URLSearchParams(window.location.search).get('id'), isOwner: false });
                 }
            }
        }
    );
});