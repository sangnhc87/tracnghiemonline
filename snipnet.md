# Hướng Dẫn Tích Hợp "Kho Snippet" Chuyên Nghiệp vào Bất Kỳ Trang Web Nào

Tài liệu này hướng dẫn từng bước để tích hợp một dialog "Kho Snippet" mạnh mẽ, cho phép người dùng chèn nhanh các đoạn code/văn bản mẫu vào một trình soạn thảo. Hệ thống này có thể tùy biến dễ dàng và hoạt động độc lập.

**Yêu cầu:** Trang web cần có thư viện [SweetAlert2](https://sweetalert2.github.io/) và [Font Awesome](https://fontawesome.com/) đã được nhúng sẵn.

## Quy Trình Tích Hợp

### Bước 1: Chuẩn Bị File Dữ Liệu `snippets.json`

Đây là file chứa toàn bộ dữ liệu cho kho snippet của bạn. Nó có cấu trúc phân cấp gồm các "danh mục" (category) và các "mục con" (children).

Tạo một file tên là `snippets.json` và đặt nó cùng cấp với file HTML của bạn. Dưới đây là một cấu trúc mẫu:

```json
[
  {
    "name": "Cấu Trúc Câu Hỏi",
    "icon": "fas fa-file-alt",
    "children": [
      {
        "name": "Câu hỏi trắc nghiệm",
        "icon": "fas fa-plus-square",
        "description": "Tạo khung hoàn chỉnh cho một câu hỏi trắc nghiệm với 4 lựa chọn và lời giải.",
        "snippet": "\\begin{ex}\n  Câu ...: Nội dung câu hỏi.\n  \\choice\n  {*Đáp án đúng}\n  {Phương án 2}\n  {Phương án 3}\n  {Phương án 4}\n  \\loigiai{\n    Nội dung lời giải.\n  }\n\\end{ex}"
      },
      {
        "name": "Câu hỏi Đúng/Sai",
        "icon": "fas fa-check-double",
        "description": "Tạo khung câu hỏi dạng Đúng/Sai hoặc chọn 1 trong 2 đáp án.",
        "snippet": "\\begin{ex}\n  Câu ...: Nội dung câu hỏi.\n  \\choiceTF\n  \\loigiai{\n    Nội dung lời giải.\n  }\n\\end{ex}"
      },
      {
        "name": "Câu hỏi trả lời ngắn",
        "icon": "fas fa-pencil-alt",
        "description": "Tạo khung câu hỏi yêu cầu điền đáp án ngắn gọn.",
        "snippet": "\\begin{ex}\n  Câu ...: Nội dung câu hỏi.\n  \\shortans{$đáp án$}\n  \\loigiai{\n    Nội dung lời giải.\n  }\n\\end{ex}"
      }
    ]
  },
  {
    "name": "Hệ PT & Canh Dòng (Chuẩn KaTeX)",
    "icon": "fas fa-equals",
    "children": [
      {
        "name": "Hệ phương trình (dùng `cases`)",
        "icon": "fas fa-bars",
        "description": "Cách chuẩn và đơn giản nhất. Tự động tạo dấu `{` bên trái. Dùng `&` để canh lề.",
        "snippet": "\\begin{cases}\n  x + y &= 2 \\\\\n  2x - y &= 1\n\\end{cases}"
      },
      {
        "name": "Canh dòng biểu thức (dùng `aligned`)",
        "icon": "fas fa-align-left",
        "description": "Canh lề nhiều dòng công thức, không có dấu ngoặc hệ. Rất hữu ích để trình bày các bước giải.",
        "snippet": "\\begin{aligned}\n  f(x) &= (x+1)^2 \\\\\n       &= x^2 + 2x + 1\n\\end{aligned}"
      },
      {
        "name": "Hệ tùy chỉnh (dùng `array`)",
        "icon": "fas fa-cogs",
        "description": "Cách linh hoạt nhất. Dùng `array` kết hợp `\\left` và `\\right` để tạo hệ với mọi loại dấu ngoặc.",
        "snippet": "\\left\\{\n\\begin{array}{l}\n  x + y - z = 1 \\\\\n  2x - y + z = 2\n\\end{array}\n\\right."
      }
    ]
  },
  {
    "name": "Ma Trận & Mảng (Chuẩn KaTeX)",
    "icon": "fas fa-th",
    "children": [
      {
        "name": "Ma trận ngoặc tròn (pmatrix)",
        "icon": "fas fa-th",
        "description": "Môi trường `pmatrix` tự động tạo ma trận với dấu ngoặc tròn `()`.",
        "snippet": "\\begin{pmatrix}\n  a & b \\\\\n  c & d\n\\end{pmatrix}"
      },
      {
        "name": "Ma trận ngoặc vuông (bmatrix)",
        "icon": "fas fa-th-large",
        "description": "Môi trường `bmatrix` tự động tạo ma trận với dấu ngoặc vuông `[]`.",
        "snippet": "\\begin{bmatrix}\n  a & b \\\\\n  c & d\n\\end{bmatrix}"
      },
      {
        "name": "Định thức (vmatrix)",
        "icon": "fas fa-grip-lines-vertical",
        "description": "Môi trường `vmatrix` để tính định thức, tự động tạo dấu `| |`.",
        "snippet": "\\begin{vmatrix}\n  a & b \\\\\n  c & d\n\\end{vmatrix}"
      },
      {
        "name": "Ma trận bổ sung (dùng `array`)",
        "icon": "fas fa-table",
        "description": "Dùng `array` với `[cc|c]` để tạo ma trận bổ sung có đường kẻ dọc.",
        "snippet": "\\left[\n\\begin{array}{cc|c}\n  1 & 2 & 3 \\\\\n  4 & 5 & 6\n\\end{array}\n\\right]"
      }
    ]
  }
]
```

**Giải thích cấu trúc:**
*   Mảng ngoài cùng chứa các **danh mục**.
*   Mỗi danh mục có: `name` (tên hiển thị), `icon` (lớp Font Awesome), và `children` (mảng chứa các snippet).
*   Mỗi snippet trong `children` có: `name`, `description`, `icon`, và `snippet` (nội dung sẽ được chèn).

### Bước 2: Thêm HTML

Tại vị trí bạn muốn đặt nút mở kho snippet, hãy thêm đoạn mã HTML sau.

```html
<!-- Nút để mở Kho Snippet -->
<button id="open-snippet-dialog-btn" class="btn btn-primary">
    <i class="fas fa-book-open"></i> Kho Snippet
</button>
```

Và tại nơi bạn có trình soạn thảo (ví dụ: một `textarea` hoặc một cấu trúc phức tạp hơn), hãy đảm bảo nó có một `id` hoặc một `class` để JavaScript có thể tìm thấy.

**Ví dụ với một textarea đơn giản:**
```html
<textarea id="my-editor" style="width:100%; height: 300px;"></textarea>
```

### Bước 3: Thêm CSS

Dán toàn bộ đoạn CSS sau vào file CSS của bạn hoặc vào thẻ `<style>` trong file HTML. CSS này sẽ định dạng cho dialog của Kho Snippet.

```css
/* === CSS CHO DIALOG KHO SNIPPET === */

/* Tùy chỉnh lớp của SweetAlert2 để xóa padding/margin mặc định */
.snippet-dialog-custom-class .swal2-html-container {
    padding: 0 !important;
    margin: 0 !important;
}

/* Container chính của dialog */
.snippet-container {
    display: flex;
    height: 60vh; /* Chiều cao có thể tùy chỉnh */
    font-family: sans-serif; /* Hoặc font chữ của trang bạn */
    text-align: left;
}

/* Panel bên trái (Cây thư mục) */
.snippet-tree-panel {
    width: 240px;
    background-color: #f8f9fa;
    border-right: 1px solid #e9ecef;
    padding: 10px;
    overflow-y: auto;
    flex-shrink: 0;
}
.snippet-tree {
    list-style-type: none;
    padding: 0;
    margin: 0;
}
.snippet-tree li {
    margin-bottom: 2px;
}
.snippet-tree-item {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    cursor: pointer;
    border-radius: 5px;
    transition: background-color 0.2s, color 0.2s;
    font-size: 14px;
    user-select: none;
    color: #343a40;
}
.snippet-tree-item:hover {
    background-color: #e9ecef;
}
.snippet-tree-item.active {
    background-color: #007bff;
    color: white;
}
.snippet-tree-item .tree-icon {
    width: 25px;
    text-align: center;
    margin-right: 10px;
    font-size: 1.1em;
}

/* Panel bên phải (Chi tiết Snippet) */
.snippet-detail-panel {
    flex-grow: 1;
    padding: 20px;
    overflow-y: auto;
}
.snippet-detail-item {
    padding: 15px;
    border: 1px solid #e9ecef;
    border-radius: 6px;
    margin-bottom: 10px;
    cursor: pointer;
    transition: border-color 0.2s, box-shadow 0.2s;
}
.snippet-detail-item:hover {
    border-color: #007bff;
    box-shadow: 0 0 0 1px rgba(0, 123, 255, 0.25);
}
.snippet-detail-item .detail-name {
    font-weight: 600;
    font-size: 15px;
    margin-bottom: 5px;
    color: #212529;
    display: flex;
    align-items: center;
}
.snippet-detail-item .detail-icon {
    margin-right: 10px;
    color: #007bff;
}
.snippet-detail-item .detail-description {
    font-size: 13px;
    color: #6c757d;
    line-height: 1.4;
    margin: 0;
}
```

### Bước 4: Thêm JavaScript

Đây là "bộ não" của Kho Snippet. Dán toàn bộ đoạn code này vào thẻ `<script>` trong file HTML của bạn, hoặc vào một file `.js` riêng và nhúng vào trang.

```javascript
// Bọc trong một hàm IIFE để tránh xung đột biến toàn cục
(function() {
    // Chỉ chạy khi trang đã tải xong
    document.addEventListener('DOMContentLoaded', function() {
        const openBtn = document.getElementById('open-snippet-dialog-btn');
        if (!openBtn) {
            console.warn('Nút "open-snippet-dialog-btn" không được tìm thấy. Tính năng Kho Snippet bị vô hiệu hóa.');
            return;
        }

        let snippetData = null; // Cache dữ liệu snippet

        /**
         * Chèn một đoạn text vào trình soạn thảo đang được focus.
         * Hàm này có thể tìm thấy trình soạn thảo đang focus hoặc chọn một trình soạn thảo mặc định.
         * @param {string} text - Đoạn text cần chèn.
         */
        const insertSnippet = (text) => {
            // --- PHẦN CẦN TÙY CHỈNH ---
            // Thay đổi các bộ chọn (selector) này để phù hợp với trang của bạn
            const focusedEditorSelector = '.question-editor-frame.is-focused .question-textarea';
            const defaultEditorSelector = '#my-editor, .question-editor-frame .question-textarea'; 
            // -------------------------

            let targetEditor = document.querySelector(focusedEditorSelector);

            if (!targetEditor) {
                targetEditor = document.querySelector(defaultEditorSelector);
            }

            if (!targetEditor) {
                Swal.fire('Lỗi', 'Không tìm thấy khung soạn thảo nào để chèn snippet vào.', 'error');
                return;
            }

            const start = targetEditor.selectionStart;
            const end = targetEditor.selectionEnd;
            const originalValue = targetEditor.value;
            
            // Chèn snippet và di chuyển con trỏ chuột vào giữa snippet (nếu là $ $)
            let finalSnippet = text;
            let cursorPosition = start + text.length;
            if (text === "$ $" || text === "$$\n\t\n$$") {
                finalSnippet = text.substring(0, text.length / 2);
                cursorPosition = start + finalSnippet.length;
                finalSnippet += text.substring(text.length / 2);
            }

            targetEditor.value = originalValue.substring(0, start) + finalSnippet + originalValue.substring(end);
            targetEditor.selectionStart = targetEditor.selectionEnd = cursorPosition;
            
            targetEditor.dispatchEvent(new Event('input', { bubbles: true }));
            targetEditor.focus();
            Swal.close();
        };
        
        // --- CÁC HÀM BÊN DƯỚI THƯỜNG KHÔNG CẦN THAY ĐỔI ---
        const renderDetailPanel = (children) => {
            const detailPanel = document.getElementById('snippet-detail-panel');
            if (!detailPanel) return;
            
            let html = '';
            children.forEach(item => {
                const escapedSnippet = item.snippet.replace(/"/g, '"');
                html += `
                    <div class="snippet-detail-item" data-snippet="${escapedSnippet}">
                        <div class="detail-name"><i class="detail-icon ${item.icon || 'fas fa-code'}"></i><span>${item.name}</span></div>
                        <p class="detail-description">${item.description || 'Nhấp để chèn snippet.'}</p>
                    </div>`;
            });
            detailPanel.innerHTML = html;

            detailPanel.querySelectorAll('.snippet-detail-item').forEach(el => {
                el.addEventListener('click', () => {
                    insertSnippet(el.dataset.snippet);
                });
            });
        };

        const renderTreePanel = (data) => {
            const treePanel = document.getElementById('snippet-tree-panel');
            if (!treePanel) return;
            
            let html = '<ul class="snippet-tree">';
            data.forEach((category, index) => {
                html += `<li class="snippet-tree-item" data-index="${index}"><i class="tree-icon ${category.icon || 'fas fa-folder'}"></i><span>${category.name}</span></li>`;
            });
            html += '</ul>';
            treePanel.innerHTML = html;

            const items = treePanel.querySelectorAll('.snippet-tree-item');
            items.forEach(item => {
                item.addEventListener('click', () => {
                    items.forEach(i => i.classList.remove('active'));
                    item.classList.add('active');
                    const categoryIndex = parseInt(item.dataset.index, 10);
                    renderDetailPanel(data[categoryIndex].children);
                });
            });

            if (items.length > 0) items[0].click();
        };

        const openSnippetDialog = async () => {
            if (!snippetData) {
                try {
                    const response = await fetch('snippets.json'); 
                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                    snippetData = await response.json();
                } catch (error) {
                    Swal.fire('Lỗi', `Không thể tải được file snippets.json. Vui lòng kiểm tra lại. Lỗi: ${error.message}`, 'error');
                    return;
                }
            }

            Swal.fire({
                title: 'Kho Snippet Chuyên Nghiệp',
                html: `<div class="snippet-container"><div id="snippet-tree-panel" class="snippet-tree-panel"></div><div id="snippet-detail-panel" class="snippet-detail-panel"></div></div>`,
                width: '80vw',
                customClass: { popup: 'snippet-dialog-custom-class' },
                showConfirmButton: false,
                showCloseButton: true,
                didOpen: () => renderTreePanel(snippetData),
            });
        };

        openBtn.addEventListener('click', openSnippetDialog);
    });
})();
```

#### **Phần Tùy Chỉnh Quan Trọng Nhất trong JavaScript:**

Trong hàm `insertSnippet`, có một khu vực được đánh dấu `// --- PHẦN CẦN TÙY CHỈNH ---`. Đây là nơi bạn cấu hình để JavaScript biết trình soạn thảo của bạn là gì.

*   `focusedEditorSelector`: CSS selector để tìm trình soạn thảo **đang được focus**. Ví dụ: `.question-editor-frame.is-focused .question-textarea`.
*   `defaultEditorSelector`: CSS selector để tìm trình soạn thảo **mặc định** nếu không có cái nào đang được focus. Bạn có thể liệt kê nhiều selector, cách nhau bởi dấu phẩy. Ví dụ: `#my-editor, .question-editor-frame .question-textarea`.

**Cải tiến nhỏ:** Hàm `insertSnippet` đã được nâng cấp để khi chèn các snippet như `$ $` hoặc `$$ $$`, con trỏ chuột sẽ tự động đặt vào giữa, sẵn sàng để bạn gõ nội dung.

## Tổng Kết

Bằng cách làm theo 4 bước trên, bạn có thể dễ dàng tích hợp một "Kho Snippet" chuyên nghiệp và có khả năng tùy biến cao vào bất kỳ dự án web nào, giúp tăng tốc độ làm việc và đảm bảo tính nhất quán của code/văn bản.