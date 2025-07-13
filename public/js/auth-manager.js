// File: public/js/auth-manager.js

// Biến toàn cục để lưu trạng thái người dùng hiện tại
let currentFirebaseUser = null;

/**
 * Khởi tạo trình theo dõi trạng thái xác thực của Firebase.
 * Hàm này nên được gọi trên MỌI trang cần biết người dùng đã đăng nhập hay chưa.
 * @param {function} onLogin - Callback sẽ được gọi khi người dùng đăng nhập.
 * @param {function} onLogout - Callback sẽ được gọi khi người dùng đăng xuất.
 */
function initializeAuth(onLogin, onLogout) {
    if (typeof firebase === 'undefined' || !firebase.auth) {
        console.error("Firebase Auth SDK chưa được tải. Chờ một lát và thử lại.");
        setTimeout(() => initializeAuth(onLogin, onLogout), 1000);
        return;
    }

    firebase.auth().onAuthStateChanged(user => {
        if (user) {
            // Người dùng đã đăng nhập
            console.log("AuthManager: Người dùng đã đăng nhập -", user.email);
            currentFirebaseUser = user;
            if (typeof onLogin === 'function') {
                onLogin(user);
            }
        } else {
            // Người dùng đã đăng xuất hoặc chưa đăng nhập
            console.log("AuthManager: Người dùng đã đăng xuất.");
            currentFirebaseUser = null;
            if (typeof onLogout === 'function') {
                onLogout();
            }
        }
    });
}

/**
 * Thực hiện đăng nhập bằng Google.
 */
function signInWithGoogle() {
    if (typeof firebase === 'undefined') return;
    const provider = new firebase.auth.GoogleAuthProvider();
    firebase.auth().signInWithPopup(provider).catch(error => {
        console.error("Lỗi đăng nhập Google:", error);
        Swal.fire("Lỗi", "Lỗi đăng nhập Google: " + error.message, "error");
    });
}

/**
 * Thực hiện đăng xuất.
 */
function signOut() {
    if (typeof firebase === 'undefined') return;
    firebase.auth().signOut().catch(error => {
        console.error("Lỗi đăng xuất:", error);
        Swal.fire("Lỗi", "Lỗi khi đăng xuất: " + error.message, "error");
    });
}