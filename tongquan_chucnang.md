Chào bạn, tôi hiểu rất rõ code này. Đây là một hệ thống thi online khá hoàn chỉnh, sử dụng HTML/CSS/JS cho giao diện (front-end) và Firebase (Firestore, Functions, Auth, Storage) cho phần xử lý logic và lưu trữ (back-end).

Để trả lời câu hỏi của bạn về chức năng **"Thêm đề thi"**, tôi sẽ giải thích chi tiết các hàm và luồng xử lý liên quan.

### Tổng quan luồng xử lý "Thêm Đề Thi"

Khi một giáo viên thêm đề thi mới, luồng xử lý diễn ra như sau:

1.  **Giao diện (Front-end):** Giáo viên trên trang `teacherDashboard` bấm nút "Thêm đề thi".
2.  **Giao diện (Front-end):** Hàm JavaScript `showExamForm()` được gọi để hiển thị một form (cửa sổ modal) cho phép nhập thông tin đề thi.
3.  **Giao diện (Front-end):** Giáo viên điền đầy đủ thông tin (Mã đề, thời gian, đáp án, nội dung...) và nhấn "Lưu".
4.  **Giao diện (Front-end):** Hàm JavaScript `handleExamFormSubmit()` được kích hoạt. Hàm này thu thập tất cả dữ liệu từ form.
5.  **Giao diện (Front-end) → Máy chủ (Back-end):** `handleExamFormSubmit()` quyết định và gọi một trong hai hàm Cloud Function ở back-end để xử lý, tùy thuộc vào lựa chọn của giáo viên.
6.  **Máy chủ (Back-end):** Cloud Function nhận dữ liệu, xác thực, và lưu thông tin đề thi vào cơ sở dữ liệu Firestore (và có thể cả Firebase Storage).
7.  **Máy chủ (Back-end) → Giao diện (Front-end):** Hàm ở back-end trả về kết quả (thành công hoặc lỗi).
8.  **Giao diện (Front-end):** Giao diện nhận kết quả, hiển thị thông báo cho giáo viên và cập nhật lại danh sách đề thi.

---

### Chi tiết các hàm chính can thiệp và quản lý

Dưới đây là các hàm cụ thể chịu trách nhiệm cho từng bước.

#### 1. Phía Giao diện người dùng (Front-end: `index.html` và `public/js/main.js`)

Đây là nơi khởi đầu mọi thứ.

*   **`showExamForm()` (trong `main.js`)**
    *   **Chức năng:** Được gọi khi giáo viên bấm nút "Thêm đề thi".
    *   **Nhiệm vụ:** Đơn giản là hiển thị cái form (modal) có `id="examFormModal"` để giáo viên có thể nhập liệu. Nó cũng reset form để xóa dữ liệu cũ.

*   **`handleExamFormSubmit()` (trong `main.js`)**
    *   **Chức năng:** Đây là hàm **quan trọng nhất** ở phía front-end, được gọi khi giáo viên nhấn nút "Lưu" trên form.
    *   **Nhiệm vụ:**
        1.  **Thu thập dữ liệu:** Lấy tất cả giá trị từ các ô input như `examFormCode`, `examFormTime`, `examFormKeys`, `examFormContent`...
        2.  **Kiểm tra lựa chọn:** Nó kiểm tra xem checkbox `"Lưu nội dung lên Storage (Tối ưu cho đề dài)"` có được chọn hay không.
        3.  **Quyết định hàm Back-end:** Dựa vào checkbox trên, nó sẽ quyết định gọi hàm Cloud Function nào ở back-end:
            *   Nếu **KHÔNG** check: Gọi hàm `addExam`.
            *   Nếu **CÓ** check: Gọi hàm `addExamWithStorage`.
        4.  **Gửi yêu cầu:** Sử dụng `firebase.functions().httpsCallable(...)` để gửi dữ liệu đã thu thập đến hàm back-end tương ứng.
        5.  **Xử lý kết quả:** Chờ phản hồi từ back-end, sau đó dùng `Swal.fire(...)` (SweetAlert2) để thông báo thành công/thất bại cho giáo viên.

#### 2. Phía Máy chủ (Back-end: `functions/index.js`)

Đây là nơi xử lý logic và lưu trữ dữ liệu một cách an toàn.

*   **`exports.addExam` (trong `functions/index.js`)**
    *   **Chức năng:** Đây là hàm xử lý "thông thường" cho các đề thi ngắn hoặc đề PDF.
    *   **Nhiệm vụ:**
        1.  Nhận dữ liệu `examData` từ front-end.
        2.  Kiểm tra quyền (giáo viên có đăng nhập không).
        3.  Tạo một object đề thi mới.
        4.  **Quan trọng:** Nó lưu **toàn bộ nội dung** của đề thi (trường `content`) trực tiếp vào một document trong cơ sở dữ liệu **Firestore**. Cách này tiện lợi nhưng không tối ưu cho đề thi quá dài.
        5.  Nếu là đề PDF, nó sẽ lưu `examPdfUrl` thay vì `content`.
        6.  Trả về thông báo thành công.

*   **`exports.addExamWithStorage` (trong `functions/index.js`)**
    *   **Chức năng:** Đây là hàm xử lý "nâng cao", được thiết kế riêng cho các đề thi dạng TEXT rất dài.
    *   **Nhiệm vụ:**
        1.  Nhận dữ liệu `examData` từ front-end.
        2.  **Điểm khác biệt cốt lõi:**
            *   Nó lấy nội dung đề thi (`examData.content`) và **upload lên Firebase Storage** dưới dạng một file `.txt`.
            *   Nó **KHÔNG** lưu nội dung này vào Firestore.
        3.  Thay vào đó, nó tạo một document trong **Firestore**, nhưng chỉ lưu **đường dẫn** (`contentStoragePath`) đến file `.txt` vừa upload lên Storage.
        4.  Nó cũng thêm một trường `storageVersion: 2` để hệ thống biết rằng đây là loại đề thi có nội dung nằm trên Storage.
        5.  Trả về thông báo thành công.

### Tóm tắt

-   **Hàm quản lý chính ở Front-end là:** `handleExamFormSubmit()`. Nó giống như một người điều phối, nhận yêu cầu và gửi đến đúng bộ phận xử lý.
-   **Các hàm xử lý chính ở Back-end là:**
    1.  `addExam`: Dùng cho các đề thi có nội dung được lưu trực tiếp trong cơ sở dữ liệu (Firestore).
    2.  `addExamWithStorage`: Dùng cho các đề thi dài, nội dung được tách ra và lưu ở kho lưu trữ file (Firebase Storage) để tối ưu hiệu năng.

Cách thiết kế này rất tốt, vì nó giúp hệ thống không bị chậm khi xử lý những đề thi có nội dung lớn. Bạn đã hiểu đúng khi quan tâm đến luồng này, vì nó là một trong những chức năng cốt lõi của hệ thống.