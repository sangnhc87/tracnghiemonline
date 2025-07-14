// File: public/js/auth-manager.js

// Biến toàn cục để lưu trạng thái người dùng hiện tại (giữ nguyên)
let currentFirebaseUser = null;

/**
 * Khởi tạo trình theo dõi trạng thái xác thực của Firebase.
 * @param {object} authInstance - Đối tượng auth đã được khởi tạo từ main.js
 * @param {function} onLogin - Callback sẽ được gọi khi người dùng đăng nhập.
 * @param {function} onLogout - Callback sẽ được gọi khi người dùng đăng xuất.
 */
function initializeAuth(authInstance, onLogin, onLogout) {
    // Không cần kiểm tra firebase.auth nữa, vì chúng ta đã nhận nó trực tiếp
    
    authInstance.onAuthStateChanged(user => {
        if (user) {
            console.log("AuthManager: Người dùng đã đăng nhập -", user.email);
            currentFirebaseUser = user;
            if (typeof onLogin === 'function') {
                onLogin(user);
            }
        } else {
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
 * @param {object} authInstance - Đối tượng auth đã được khởi tạo từ main.js
 */
function signInWithGoogle(authInstance) {
    const provider = new firebase.auth.GoogleAuthProvider(); // Giữ nguyên, vì đây là class
    authInstance.signInWithPopup(provider).catch(error => {
        console.error("Lỗi đăng nhập Google:", error);
        Swal.fire("Lỗi", "Lỗi đăng nhập Google: " + error.message, "error");
    });
}

/**
 * Thực hiện đăng xuất.
 * @param {object} authInstance - Đối tượng auth đã được khởi tạo từ main.js
 */
function signOut(authInstance) {
    authInstance.signOut().catch(error => {
        console.error("Lỗi đăng xuất:", error);
        Swal.fire("Lỗi", "Lỗi khi đăng xuất: " + error.message, "error");
    });
}