// public/js/auth-manager.js (PHIÊN BẢN ĐỔI TÊN AN TOÀN)

let currentFirebaseUser = null;

function AuthHelper_initialize(authInstance, onLogin, onLogout) {
    authInstance.onAuthStateChanged(user => {
        if (user) {
            currentFirebaseUser = user;
            if (typeof onLogin === 'function') onLogin(user);
        } else {
            currentFirebaseUser = null;
            if (typeof onLogout === 'function') onLogout();
        }
    });
}

// trong auth-manager.js
function AuthHelper_signInWithGoogle(authInstance) {
    const provider = new firebase.auth.GoogleAuthProvider();
    authInstance.signInWithPopup(provider).catch(error => {
        // Kiểm tra mã lỗi
        if (error.code === 'auth/popup-closed-by-user') {
            // Nếu người dùng tự đóng popup, chỉ cần log ra console và không làm phiền họ.
            console.log('Đăng nhập Google đã bị người dùng hủy bỏ.');
        } else {
            // Đối với các lỗi khác (lỗi mạng, tài khoản bị vô hiệu hóa, ...), hãy hiển thị thông báo.
            console.error("Lỗi đăng nhập Google:", error);
            Swal.fire("Lỗi", "Lỗi đăng nhập Google: " + error.message, "error");
        }
    });
}

function AuthHelper_signOut(authInstance) {
    authInstance.signOut().catch(error => {
        console.error("Lỗi đăng xuất:", error);
        Swal.fire("Lỗi", "Lỗi khi đăng xuất: " + error.message, "error");
    });
}