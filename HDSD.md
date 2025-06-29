Chắc chắn rồi! Dưới đây là nội dung cho file `HƯỚNG DẪN SOẠN ĐỀ.md` được định dạng hoàn toàn bằng Markdown. Bạn chỉ cần sao chép toàn bộ nội dung trong khối code dưới đây và dán vào một file mới có tên `HƯỚNG DẪN SOẠN ĐỀ.md`.

```markdown
# Hướng dẫn Soạn thảo Đề thi Online

Tài liệu này hướng dẫn các quy ước và định dạng cần tuân thủ khi soạn nội dung cho các đề thi dạng **Văn bản (Soạn trực tiếp)** trên hệ thống. Việc tuân thủ đúng định dạng sẽ giúp hệ thống hiển thị và chấm điểm chính xác.

## Cấu trúc chung của một Đề thi

-   Mỗi câu hỏi được ngăn cách với nhau bằng **một hoặc nhiều dòng trống**.
-   Hệ thống hỗ trợ 3 loại câu hỏi chính:
    1.  **Trắc nghiệm nhiều lựa chọn (MC)**
    2.  **Mệnh đề Đúng/Sai (Table TF)**
    3.  **Điền số/văn bản ngắn (Numeric)**

---

## I. Định dạng chi tiết cho từng loại câu hỏi

### 1. Câu hỏi Trắc nghiệm nhiều lựa chọn (MC)

Đây là loại câu hỏi có 4 lựa chọn A, B, C, D.

**Quy tắc:**
-   Nội dung câu hỏi ở trên cùng.
-   Mỗi lựa chọn bắt đầu bằng `A.`, `B.`, `C.`, `D.` (chữ hoa, có dấu chấm và một khoảng trắng).
-   Nội dung của lựa chọn nằm ngay sau đó.

**Ví dụ:**
```
Câu 1: Thủ đô của Việt Nam là thành phố nào?
A. Thành phố Hồ Chí Minh
B. Đà Nẵng
C. Hải Phòng
D. Hà Nội
```

> **Lưu ý:** Hệ thống sẽ **luôn luôn tự động xáo trộn** thứ tự của các lựa chọn A, B, C, D cho mỗi học sinh.

### 2. Câu hỏi Mệnh đề Đúng/Sai (Table TF)

Đây là loại câu hỏi gồm nhiều mệnh đề nhỏ, học sinh cần xác định mỗi mệnh đề là Đúng hay Sai.

**Quy tắc:**
-   Nội dung câu hỏi ở trên cùng.
-   Mỗi mệnh đề bắt đầu bằng `a)`, `b)`, `c)`, `d)`... (chữ thường, có dấu ngoặc đơn và một khoảng trắng).

**Ví dụ:**
```
Câu 2: Cho các phát biểu sau về logarit (với a, b > 0, a ≠ 1):
a) log_a(1) = 0
b) log_a(a) = 1
c) log_a(b) chỉ xác định khi b > 1.
d) log_a(b^c) = c*log_a(b)
```

> **Lưu ý:** Đáp án cho câu hỏi này trong ô "Đáp án" sẽ là một chuỗi ký tự liền nhau, ví dụ: `TTST` (tương ứng a-Đúng, b-Đúng, c-Sai, d-Đúng).

### 3. Câu hỏi Điền số/Văn bản ngắn (Numeric)

Đây là loại câu hỏi không có lựa chọn sẵn. Học sinh phải tự nhập đáp án.

**Quy tắc:**
-   Chỉ cần viết nội dung câu hỏi.
-   **KHÔNG** có các dòng bắt đầu bằng `A.` hoặc `a)`.

**Ví dụ:**
```
Câu 3: Tính tích phân I = ∫(2x + 1)dx từ 0 đến 1.
```

> **Lưu ý:** Đáp án trong ô "Đáp án" phải là con số hoặc chuỗi ký tự chính xác mà bạn mong đợi học sinh nhập.

---

## II. Các chỉ thị Đặc biệt (Keywords)

Bạn có thể thêm các dòng lệnh đặc biệt (bắt đầu bằng `##`) vào nội dung câu hỏi để điều khiển cách hệ thống hiển thị và xử lý.

### 1. Phân nhóm Câu hỏi để Trộn (`##group-separator##`)

Mặc định, toàn bộ các câu hỏi trong đề sẽ được xáo trộn ngẫu nhiên. Nếu bạn muốn giữ cấu trúc đề thi (ví dụ: nhóm câu dễ, nhóm câu khó), bạn có thể chia chúng thành các nhóm. Các câu hỏi sẽ chỉ được trộn **bên trong** mỗi nhóm.

**Cách dùng:** Đặt dòng `##group-separator##` vào giữa các nhóm câu hỏi.

**Ví dụ:**
```
// ----- NHÓM 1: 2 CÂU NHẬN BIẾT (sẽ được trộn với nhau) -----
Câu 1: Trái Đất có hình gì?
A. Hình vuông
B. Hình cầu
C. Hình tam giác
D. Hình chữ nhật

Câu 2: Nước sôi ở bao nhiêu độ C (ở áp suất tiêu chuẩn)?

##group-separator##

// ----- NHÓM 2: 2 CÂU VẬN DỤNG (sẽ được trộn với nhau) -----
Câu 3: Giải phương trình x^2 - 3x + 2 = 0.

Câu 4: Cho các phát biểu sau:
a) 1 + 1 = 2
b) 2 * 2 = 5
```

### 2. KHÔNG trộn thứ tự Mệnh đề (`##no-shuffle`)

Đối với câu hỏi dạng Mệnh đề Đúng/Sai, đôi khi thứ tự các mệnh đề có logic và bạn không muốn xáo trộn chúng.

**Cách dùng:** Đặt dòng `##no-shuffle` ở cuối nội dung câu hỏi đó.

**Ví dụ:**
```
Câu 5: Xét các bước giải phương trình log(x) + log(x-3) = 2:
a) Bước 1: Điều kiện x > 3.
b) Bước 2: log(x(x-3)) = 2.
c) Bước 3: x(x-3) = 10^2 = 100.
d) Bước 4: Giải phương trình x^2 - 3x - 100 = 0 và kết hợp điều kiện.
##no-shuffle
```
> Trong ví dụ này, hệ thống sẽ **luôn hiển thị** các mệnh đề theo thứ tự a, b, c, d. Nếu không có `##no-shuffle`, thứ tự này có thể bị xáo trộn (ví dụ: c, a, d, b).

### 3. Tùy chỉnh Layout cho Lựa chọn MC (`##2x2`, `##1x4`, `##4x1`)

Bạn có thể gợi ý cách hiển thị các lựa chọn A, B, C, D để phù hợp với nội dung (ví dụ khi các lựa chọn là hình ảnh).

**Cách dùng:** Đặt dòng chỉ thị layout ở bất kỳ đâu trong nội dung câu hỏi.
-   `##2x2`: Hiển thị trên lưới 2 cột, 2 hàng (mặc định).
-   `##1x4`: Hiển thị trên 1 cột, 4 hàng (mỗi đáp án một dòng).
-   `##4x1`: Hiển thị trên 4 cột, 1 hàng.

**Ví dụ:**
```
Câu 6: Chọn hình ảnh đúng.
A. (Nội dung hình ảnh A)
B. (Nội dung hình ảnh B)
C. (Nội dung hình ảnh C)
D. (Nội dung hình ảnh D)
##1x4
```

---

## III. Thêm Lời giải chi tiết

Để thêm lời giải cho một câu hỏi, hãy bọc nội dung lời giải trong cặp thẻ `\begin{loigiai}` và `\end{loigiai}`. Lời giải sẽ chỉ hiển thị cho học sinh sau khi đã nộp bài.

**Ví dụ:**
```
Câu 7: 2 + 2 bằng mấy?
A. 3
B. 4
C. 5
D. 6

\begin{loigiai}
Đây là phép cộng cơ bản.
Ta có: 2 + 2 = 4.
Vậy đáp án đúng là B.
\end{loigiai}
```

## IV. Nhúng hình ảnh và Công thức Toán học

### 1. Công thức Toán học (LaTeX)

-   Sử dụng cú pháp LaTeX để hiển thị công thức toán.
-   **Công thức inline (trên cùng một dòng):** Bọc bởi `$...$` hoặc `\(...\)`. Ví dụ: `Phương trình $x^2 + 1 = 0$ vô nghiệm.`
-   **Công thức display (riêng một dòng và canh giữa):** Bọc bởi `$$...$$` hoặc `\[...\]`. Ví dụ: `$$ \int_{a}^{b} f(x)dx = F(b) - F(a) $$`

### 2. Hình ảnh

-   Sử dụng cú pháp Markdown để chèn hình ảnh: `![Mô tả ảnh](Đường_dẫn_đến_ảnh)`
-   Đường dẫn đến ảnh phải là một URL công khai trên Internet.
-   Hệ thống có hỗ trợ các từ khóa viết tắt để chèn ảnh nhanh từ các kho ảnh GitLab của bạn:
    -   `sangnhc1`: Thay thế cho `https://gitlab.com/nguyensangnhc/pic4web/-/raw/main/Hinh`
    -   `sangnhc2`: Thay thế cho `https://gitlab.com/nguyensangnhc/tikz4web/-/raw/main/Hinh`
    -   `sangnhc3`: Thay thế cho `https://gitlab.com/nguyensangnhc/tikz2png/-/raw/main/Hinh`
    -   `sangnhc4`: Thay thế cho `https://gitlab.com/nguyensangnhc/png2link/-/raw/main/Hinh`

**Ví dụ chèn ảnh:**
`![Đồ thị hàm số](sangnhc1/dothi_hamso_bac3.png)`

```