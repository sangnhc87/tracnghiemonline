// functions/.eslintrc.js
module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "google",
  ],
  rules: {
    // Tắt các quy tắc gây phiền phức hoặc không cần thiết quá nghiêm ngặt:
    "max-len": "off", // VÔ HIỆU HÓA quy tắc độ dài dòng tối đa
    "arrow-parens": "off", // VÔ HIỆU HÓA yêu cầu dấu ngoặc đơn quanh tham số hàm mũi tên
    "require-jsdoc": "off", // <-- THÊM DÒNG NÀY ĐỂ TẮT KIỂM TRA JSDOC
    "no-trailing-spaces": "off", // VÔ HIỆU HÓA cấm khoảng trắng thừa ở cuối dòng (npm run lint -- --fix thường tự sửa)
    "prefer-const": "off", // VÔ HIỆU HÓA cảnh báo dùng const thay vì let
    "no-undef": "error", // Bật lỗi khi biến không được định nghĩa
    "new-cap": "error", // Bật lỗi khi dùng hàm không phải constructor với chữ hoa
    "eol-last": ["error", "always"], // Yêu cầu dòng trống ở cuối file

    // Các quy tắc khác mà bạn CÓ THỂ muốn giữ:
    "quotes": ["error", "double"], // Yêu cầu dùng dấu nháy kép (")
    "indent": ["error", 2], // Yêu cầu thụt lề 2 khoảng trắng
    "linebreak-style": ["error", "unix"], // Yêu cầu kết thúc dòng theo kiểu Unix
    "object-curly-spacing": ["error", "always"], // Yêu cầu khoảng trắng bên trong dấu ngoặc nhọn của đối tượng
    "comma-dangle": ["error", "always-multiline"], // Yêu cầu dấu phẩy cuối dòng cho đối tượng/mảng nhiều dòng
    "no-unused-vars": ["warn"], // Cảnh báo biến không sử dụng
    "no-empty": ["error", { "allowEmptyCatch": true }], // Cho phép khối catch rỗng
    "padded-blocks": "off", // Tắt yêu cầu dòng trống giữa các khối (block)
  },
  parserOptions: {
    ecmaVersion: 2020, // Hỗ trợ cú pháp ES2020 (async/await)
  },
};
