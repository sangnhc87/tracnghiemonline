module.exports = {
  root: true, // Đảm bảo ESLint chỉ áp dụng cấu hình này cho thư mục gốc của Functions
  env: {
    es6: true,
    node: true,
  },
  // Kế thừa các quy tắc khuyến nghị từ ESLint và Google
  // Lưu ý: "google" có thể rất nghiêm ngặt, chúng ta sẽ ghi đè các quy tắc đó dưới đây.
  extends: [
    "eslint:recommended",
    "google",
  ],
  rules: {
    // Tắt các quy tắc gây phiền phức hoặc không cần thiết quá nghiêm ngặt:
    "max-len": "off", // VÔ HIỆU HÓA quy tắc độ dài dòng tối đa
    "arrow-parens": "off", // VÔ HIỆU HÓA yêu cầu dấu ngoặc đơn quanh tham số hàm mũi tên
    "require-jsdoc": "off", // VÔ HIỆU HÓA yêu cầu JSDoc comments cho hàm
    "no-trailing-spaces": "off", // VÔ HIỆU HÓA cấm khoảng trắng thừa ở cuối dòng (npm run lint -- --fix thường tự sửa)

    // Các quy tắc khác mà bạn CÓ THỂ muốn chỉnh sửa (hoặc để mặc định nếu không lỗi):
    "quotes": ["error", "double"], // Yêu cầu dùng dấu nháy kép (")
    "indent": ["error", 2], // Yêu cầu thụt lề 2 khoảng trắng
    "linebreak-style": ["error", "unix"], // Yêu cầu kết thúc dòng theo kiểu Unix
    "object-curly-spacing": ["error", "always"], // Yêu cầu khoảng trắng bên trong dấu ngoặc nhọn của đối tượng
    "comma-dangle": ["error", "always-multiline"], // Yêu cầu dấu phẩy cuối dòng cho đối tượng/mảng nhiều dòng
    "prefer-const": ["warn"], // Gợi ý dùng const thay vì let nếu biến không bị gán lại (chỉ là cảnh báo)
    "no-unused-vars": ["warn"], // Cảnh báo biến không sử dụng
    "no-empty": ["error", { "allowEmptyCatch": true }], // Cho phép khối catch rỗng
    "padded-blocks": "off", // Tắt yêu cầu dòng trống giữa các khối (block)
  },
  parserOptions: {
    ecmaVersion: 2020, // Hỗ trợ cú pháp ES2020 (async/await)
  },
};
