const express = require("express");
const multer = require("multer");
const cors = require("cors");
const ImageKit = require("imagekit");
const fs = require("fs");
const path = require("path"); // <-- Thêm dòng này

const app = express();

const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)){ fs.mkdirSync(uploadDir); }
const upload = multer({ dest: uploadDir });

app.use(cors()); // Có thể để cors() mặc định vì giờ cùng nguồn

// =======================================================
// BẮT ĐẦU PHẦN MỚI
// Phục vụ các file tĩnh từ thư mục gốc của dự án
app.use(express.static(path.join(__dirname)));

// Khi người dùng truy cập vào trang chủ, gửi file api_img.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'api_img.html'));
});
// KẾT THÚC PHẦN MỚI
// =======================================================


const imagekit = new ImageKit({
  publicKey: "public_Wvk92BGoz19QJ7wJmYRPKgwwBVQ=",
  privateKey: "private_QnKf5oPn9IUTDFbPxVlbRS6QBP0=",
  urlEndpoint: "https://ik.imagekit.io/sangnhc"
});

app.post("/upload", upload.single("file"), (req, res) => {
    // Giữ nguyên code upload
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const filePath = req.file.path;
    imagekit.upload({ file: fs.createReadStream(filePath), fileName: req.file.originalname, useUniqueFileName: true },
        (error, result) => {
            fs.unlinkSync(filePath);
            if (error) return res.status(500).json({ error: "Upload failed." });
            console.log("Upload success:", result.url);
            return res.json({ url: result.url });
        }
    );
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`✅ Server đang chạy. Mở trình duyệt và truy cập: http://localhost:${PORT}`);
});