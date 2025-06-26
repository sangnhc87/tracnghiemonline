// functions/index.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Khởi tạo Firebase Admin SDK. Đây là cách Cloud Functions kết nối với Firebase services.
// Đảm bảo rằng Firebase Admin SDK đã được khởi tạo một lần duy nhất.
admin.initializeApp();

// Lấy đối tượng Firestore database
const db = admin.firestore();

// Hàm tiện ích để xử lý placeholder hình ảnh trong nội dung câu hỏi và lời giải
const processImagePlaceholders = (textArray) => {
  if (!Array.isArray(textArray)) return []; // Đảm bảo đầu vào là mảng
  return textArray.map((text) => {
    // Chuyển đổi thành chuỗi trước khi replace để tránh lỗi nếu phần tử không phải chuỗi
    text = String(text);
    text = text.replace(/sangnhc1/g, "https://gitlab.com/nguyensangnhc/pic4web/-/raw/main/Hinh");
    text = text.replace(/sangnhc2/g, "https://gitlab.com/nguyensangnhc/tikz4web/-/raw/main/Hinh");
    text = text.replace(/sangnhc3/g, "https://gitlab.com/nguyensangnhc/tikz2png/-/raw/main/Hinh");
    text = text.replace(/sangnhc4/g, "https://gitlab.com/nguyensangnhc/png2link/-/raw/main/Hinh");
    return text;
  });
};

// --- CÁC HÀM DÀNH CHO GIÁO VIÊN (YÊU CẦU ĐĂNG NHẬP GOOGLE BẰNG FIREBASE AUTH) ---

/**
 * Hàm này được gọi khi giáo viên đăng nhập lần đầu hoặc quay lại.
 * Nó sẽ tạo hồ sơ giáo viên mới trong Firestore (nếu chưa có) và đặt thời gian dùng thử (180 ngày).
 * @param {Object} data - Dữ liệu không sử dụng.
 * @param {Object} context - Ngữ cảnh xác thực của người dùng.
 * @returns {Promise<Object>} Thông tin hồ sơ giáo viên.
 */
exports.onTeacherSignIn = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Chỉ giáo viên đã đăng nhập mới có thể thực hiện thao tác này.");
  }

  const userId = context.auth.uid; // UID của giáo viên từ Firebase Auth
  const email = context.auth.token.email; // Email của giáo viên
  const userName = context.auth.token.name || email; // Tên của giáo viên

  const userRef = db.collection("users").doc(userId);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    // Đây là giáo viên mới, tạo tài khoản và đặt thời gian dùng thử
    const trialEndDate = admin.firestore.Timestamp.fromMillis(Date.now() + 180 * 24 * 60 * 60 * 1000); // 180 ngày dùng thử
    await userRef.set({
      email: email,
      name: userName,
      role: "teacher", // Gán vai trò giáo viên
      trialEndDate: trialEndDate,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    functions.logger.info(`New teacher signed in: ${email}, assigned trial until ${trialEndDate.toDate().toISOString()}`);
    return { message: "Đăng ký thành công, bạn có 180 ngày dùng thử.", trialEndDate: trialEndDate.toDate().toISOString(), teacherAlias: null };
  } else {
    // Giáo viên đã tồn tại, trả về thông tin hiện có
    functions.logger.info(`Existing teacher signed in: ${email}`);
    return userDoc.data();
  }
});

/**
 * Hàm kiểm tra trạng thái dùng thử của giáo viên.
 * @param {Object} data - Dữ liệu không sử dụng.
 * @param {Object} context - Ngữ cảnh xác thực của người dùng.
 * @returns {Promise<Object>} Trạng thái dùng thử (còn hạn hay không, số ngày còn lại).
 */
exports.checkTrialStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Chỉ giáo viên đã đăng nhập mới có thể kiểm tra.");
  }
  const userId = context.auth.uid;
  const userDoc = await db.collection("users").doc(userId).get();

  if (!userDoc.exists || userDoc.data().role !== "teacher") {
    throw new functions.https.HttpsError("permission-denied", "Bạn không phải giáo viên hoặc tài khoản không hợp lệ.");
  }

  const trialEndDate = userDoc.data().trialEndDate.toMillis();
  const remainingDays = Math.ceil((trialEndDate - Date.now()) / (1000 * 60 * 60 * 24)); // Số ngày còn lại

  return {
    isActive: remainingDays > 0, // True nếu còn trong thời gian dùng thử
    remainingDays: Math.max(0, remainingDays), // Đảm bảo không âm
  };
});

/**
 * Hàm cho giáo viên cập nhật mã Alias của mình. Alias là mã học sinh sẽ nhập để tìm giáo viên.
 * @param {Object} data - Chứa trường 'alias' mới.
 * @param {Object} context - Ngữ cảnh xác thực của người dùng.
 * @returns {Promise<Object>} Trạng thái cập nhật.
 */
exports.updateTeacherAlias = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Chỉ giáo viên đã đăng nhập mới có thể cập nhật Alias.");
  }
  const userId = context.auth.uid;
  const newAlias = String(data.alias).trim().toLowerCase(); // Chuyển thành chữ thường để đảm bảo duy nhất

  if (!newAlias || newAlias.length < 3 || newAlias.length > 20 || !/^[a-z0-9]+$/.test(newAlias)) {
    throw new functions.https.HttpsError("invalid-argument", "Alias phải từ 3 đến 20 ký tự và chỉ chứa chữ cái (không dấu), số, không có khoảng trắng hoặc ký tự đặc biệt.");
  }

  // Kiểm tra xem alias này đã có giáo viên khác sử dụng chưa
  const aliasCheck = await db.collection("users").where("teacherAlias", "==", newAlias).limit(1).get();
  if (!aliasCheck.empty && aliasCheck.docs[0].id !== userId) {
    throw new functions.https.HttpsError("already-exists", "Alias này đã có giáo viên khác sử dụng. Vui lòng chọn Alias khác.");
  }

  // Cập nhật alias cho giáo viên hiện tại
  await db.collection("users").doc(userId).update({ teacherAlias: newAlias });
  functions.logger.info(`Teacher ${userId} updated alias to ${newAlias}`);
  return { success: true, message: "Cập nhật Alias thành công!" };
});

/**
 * Hàm tải danh sách đề thi của một giáo viên (dành cho bảng điều khiển giáo viên).
 * Chỉ trả về thông tin không nhạy cảm (không có đáp án đúng).
 * @param {Object} data - Dữ liệu không sử dụng.
 * @param {Object} context - Ngữ cảnh xác thực của người dùng.
 * @returns {Promise<Array>} Danh sách các đề thi.
 */
exports.getTeacherExams = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Chỉ giáo viên đã đăng nhập mới có thể xem đề thi.");
  }
  const userId = context.auth.uid;

  // Kiểm tra thời gian dùng thử
  const userDoc = await db.collection("users").doc(userId).get();
  if (!userDoc.exists || userDoc.data().trialEndDate.toMillis() < Date.now()) {
    throw new functions.https.HttpsError("permission-denied", "Thời gian dùng thử của bạn đã hết. Vui lòng liên hệ quản trị viên.");
  }

  // Truy vấn đề thi thuộc về giáo viên này
  const examsSnapshot = await db.collection("exams").where("teacherId", "==", userId).get();
  const exams = examsSnapshot.docs.map((doc) => {
    const data = doc.data();
    // KHÔNG trả về keys và cores cho frontend của giáo viên khi liệt kê
    delete data.keys;
    delete data.cores;
    return { id: doc.id, ...data }; // Trả về cả ID document để dễ quản lý nếu cần
  });
  functions.logger.info(`Teacher ${userId} fetched ${exams.length} exams.`);
  return exams;
});

/**
 * Hàm tải danh sách lớp và học sinh của một giáo viên (dành cho bảng điều khiển giáo viên).
 * @param {Object} data - Dữ liệu không sử dụng.
 * @param {Object} context - Ngữ cảnh xác thực của người dùng.
 * @returns {Promise<Object>} Đối tượng chứa danh sách lớp và học sinh.
 */
exports.getTeacherClasses = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Chỉ giáo viên đã đăng nhập mới có thể xem danh sách lớp.");
  }
  const userId = context.auth.uid;

  // Kiểm tra thời gian dùng thử
  const userDoc = await db.collection("users").doc(userId).get();
  if (!userDoc.exists || userDoc.data().trialEndDate.toMillis() < Date.now()) {
    throw new functions.https.HttpsError("permission-denied", "Thời gian dùng thử của bạn đã hết.");
  }

  const classesSnapshot = await db.collection("classes").where("teacherId", "==", userId).get();
  const classData = {};
  classesSnapshot.forEach((doc) => {
    classData[doc.data().name] = doc.data().students || [];
  });
  functions.logger.info(`Teacher ${userId} fetched ${Object.keys(classData).length} classes.`);
  return classData;
});

/**
 * Hàm cho giáo viên tải lên danh sách đề thi.
 * Dữ liệu cần có các trường: examCode, keys, cores, questionTexts, explanations, timeLimit.
 * Hàm này cũng sẽ tự động suy luận và lưu `questionTypes` và `tfCounts` vào Firestore.
 * @param {Object} data - Chứa mảng 'exams' cần tải lên.
 * @param {Object} context - Ngữ cảnh xác thực của người dùng.
 * @returns {Promise<Object>} Trạng thái tải lên.
 */
exports.uploadExams = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Chỉ giáo viên mới có thể tải lên đề thi.");
  }
  const userId = context.auth.uid;

  // Kiểm tra thời gian dùng thử
  const userDoc = await db.collection("users").doc(userId).get();
  if (!userDoc.exists || userDoc.data().trialEndDate.toMillis() < Date.now()) {
    throw new functions.https.HttpsError("permission-denied", "Thời gian dùng thử của bạn đã hết. Không thể tải lên đề thi.");
  }

  const examsToUpload = data.exams; // Frontend sẽ gửi một mảng các đối tượng đề thi

  if (!Array.isArray(examsToUpload) || examsToUpload.length === 0) {
    throw new functions.https.HttpsError("invalid-argument", "Không có dữ liệu đề thi để tải lên.");
  }

  const batch = db.batch(); // Sử dụng batch để ghi nhiều document hiệu quả hơn
  let uploadedCount = 0;
  for (const exam of examsToUpload) {
    const examCode = exam.examCode;
    if (examCode) {
      // Chuẩn hóa dữ liệu từ CSV/JSON
      const keysStrArray = String(exam.keys || "").split("|").filter((x) => x !== "");
      const coreStrArray = String(exam.cores || "").split("|").filter((x) => x !== "");
      const questionTextsArray = String(exam.questionTexts || "").split(/\r?\n/);
      const explanationsArray = String(exam.explanations || "").split(/\r?\n/);

      // Suy luận `questionTypes` và `tfCounts` từ `keysStrArray`
      const questionTypes = keysStrArray.map((key) => {
        if (key.length === 1 && ["A", "B", "C", "D"].includes(key)) return "MC";
        if (/^[TF]+$/.test(key)) return "TF";
        if (/^-?[0-9.]+$/.test(key)) return "Numeric";
        return "Unknown"; // Trường hợp không xác định được loại
      });
      const tfCounts = keysStrArray.map((key) => (/^[TF]+$/.test(key) ? key.length : 0));

      // Tạo một Document ID tự động trong collection 'exams'
      const newExamRef = db.collection("exams").doc();
      batch.set(newExamRef, {
        teacherId: userId,
        examCode: String(exam.examCode).trim(),
        keys: keysStrArray,
        cores: coreStrArray,
        questionTexts: questionTextsArray,
        explanations: explanationsArray,
        timeLimit: exam.timeLimit ? parseInt(exam.timeLimit, 10) : 90,
        questionTypes: questionTypes, // Lưu loại câu hỏi
        tfCounts: tfCounts, // Lưu số lượng sub-questions cho TF
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      uploadedCount++;
    }
  }
  await batch.commit();
  functions.logger.info(`Teacher ${userId} uploaded ${uploadedCount} exams.`);
  return { success: true, message: `Đã tải lên ${uploadedCount} đề thi thành công!` };
});

/**
 * Hàm cho giáo viên tải lên danh sách lớp và học sinh.
 * Dữ liệu cần có các trường: name (tên lớp), students (danh sách học sinh).
 * @param {Object} data - Chứa mảng 'classes' cần tải lên.
 * @param {Object} context - Ngữ cảnh xác thực của người dùng.
 * @returns {Promise<Object>} Trạng thái tải lên.
 */
exports.uploadClasses = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Chỉ giáo viên mới có thể tải lên danh sách lớp.");
  }
  const userId = context.auth.uid;

  // Kiểm tra thời gian dùng thử
  const userDoc = await db.collection("users").doc(userId).get();
  if (!userDoc.exists || userDoc.data().trialEndDate.toMillis() < Date.now()) {
    throw new functions.https.HttpsError("permission-denied", "Thời gian dùng thử của bạn đã hết. Không thể tải lên danh sách lớp.");
  }

  const classesToUpload = data.classes; // Frontend gửi mảng các đối tượng lớp

  if (!Array.isArray(classesToUpload) || classesToUpload.length === 0) {
    throw new functions.https.HttpsError("invalid-argument", "Không có dữ liệu lớp để tải lên.");
  }

  const batch = db.batch();
  let uploadedCount = 0;
  for (const _class of classesToUpload) {
    const className = _class.name;
    if (className) {
      const studentsArray = Array.isArray(_class.students) ? _class.students.map((s) => String(s).trim()).filter((s) => s !== "") : String(_class.students || "").split(",").map((s) => String(s).trim()).filter((s) => s !== "");

      // Tạo Document ID tự động trong collection 'classes'
      const newClassRef = db.collection("classes").doc();
      batch.set(newClassRef, {
        teacherId: userId,
        name: String(_class.name).trim(),
        students: studentsArray,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      uploadedCount++;
    }
  }
  await batch.commit();
  functions.logger.info(`Teacher ${userId} uploaded ${uploadedCount} classes.`);
  return { success: true, message: `Đã tải lên ${uploadedCount} lớp học thành công!` };
});


// --- CÁC HÀM DÀNH CHO HỌC SINH (KHÔNG YÊU CẦU ĐĂNG NHẬP FIREBASE AUTH) ---

/**
 * Hàm tải danh sách lớp và học sinh cho học sinh, dựa vào Alias của giáo viên.
 * @param {Object} data - Chứa 'teacherAlias'.
 * @param {Object} context - Ngữ cảnh xác thực (không bắt buộc).
 * @returns {Promise<Object>} Đối tượng chứa danh sách lớp và học sinh.
 */
exports.getClassesForStudent = functions.https.onCall(async (data, context) => {
  const teacherAlias = String(data.teacherAlias).trim().toLowerCase();
  if (!teacherAlias) {
    throw new functions.https.HttpsError("invalid-argument", "Mã giáo viên (Alias) là bắt buộc.");
  }

  // Tìm giáo viên dựa trên alias
  const teacherSnapshot = await db.collection("users").where("teacherAlias", "==", teacherAlias).limit(1).get();
  if (teacherSnapshot.empty) {
    throw new functions.https.HttpsError("not-found", "Không tìm thấy giáo viên với Alias này. Vui lòng kiểm tra lại mã.");
  }
  const teacherDoc = teacherSnapshot.docs[0];
  const teacherId = teacherDoc.id;
  const teacherData = teacherDoc.data();

  // Kiểm tra xem giáo viên có còn trong thời gian dùng thử không
  if (teacherData.trialEndDate && teacherData.trialEndDate.toMillis() < Date.now()) {
    throw new functions.https.HttpsError("permission-denied", "Giáo viên này đã hết thời gian dùng thử. Vui lòng liên hệ giáo viên của bạn.");
  }

  // Lấy danh sách lớp của giáo viên đó
  const classesSnapshot = await db.collection("classes").where("teacherId", "==", teacherId).get();
  const classData = {};
  classesSnapshot.forEach((doc) => {
    classData[doc.data().name] = doc.data().students || [];
  });
  functions.logger.info(`Student requested classes for alias ${teacherAlias}, found ${Object.keys(classData).length} classes.`);
  return classData;
});

/**
 * Hàm tải đề thi cho học sinh. Chỉ trả về thông tin không nhạy cảm (câu hỏi, lời giải, thời gian, loại câu hỏi).
 * Không trả về đáp án đúng.
 * @param {Object} data - Chứa 'teacherAlias' và 'examCode'.
 * @param {Object} context - Ngữ cảnh xác thực (không bắt buộc).
 * @returns {Promise<Object>} Đối tượng đề thi (chỉ phần không nhạy cảm).
 */
exports.loadExamForStudent = functions.https.onCall(async (data, context) => {
  const { teacherAlias, examCode } = data;
  if (!teacherAlias || !examCode) {
    throw new functions.https.HttpsError("invalid-argument", "Mã giáo viên (Alias) và Mã đề thi là bắt buộc.");
  }

  // Tìm giáo viên
  const teacherSnapshot = await db.collection("users").where("teacherAlias", "==", teacherAlias).limit(1).get();
  if (teacherSnapshot.empty) {
    throw new functions.https.HttpsError("not-found", "Không tìm thấy giáo viên với Alias này.");
  }
  const teacherDoc = teacherSnapshot.docs[0];
  const teacherId = teacherDoc.id;
  const teacherData = teacherDoc.data();

  // Kiểm tra thời gian dùng thử
  if (teacherData.trialEndDate && teacherData.trialEndDate.toMillis() < Date.now()) {
    throw new functions.https.HttpsError("permission-denied", "Giáo viên này đã hết thời gian dùng thử. Không thể bắt đầu bài thi.");
  }

  // Tìm đề thi thuộc về giáo viên và có mã đề tương ứng
  const examSnapshot = await db.collection("exams")
    .where("teacherId", "==", teacherId)
    .where("examCode", "==", examCode)
    .limit(1)
    .get();
  if (examSnapshot.empty) {
    throw new functions.https.HttpsError("not-found", `Không tìm thấy đề thi ${examCode} của giáo viên này.`);
  }

  const examData = examSnapshot.docs[0].data();
  functions.logger.info(`Student requested exam ${examCode} for alias ${teacherAlias}.`);

  return {
    questionTexts: processImagePlaceholders(examData.questionTexts),
    explanations: processImagePlaceholders(examData.explanations),
    timeLimit: examData.timeLimit || 90,
    questionTypes: examData.questionTypes || [], // Gửi loại câu hỏi để frontend render đúng
    tfCounts: examData.tfCounts || [], // Gửi số lượng sub-questions cho TF
    // KHÔNG GỬI keys và cores xuống client để bảo mật
  };
});

/**
 * Hàm chấm điểm và nộp bài. Toàn bộ logic chấm điểm được thực hiện an toàn trên server.
 * @param {Object} data - Chứa 'teacherAlias', 'examCode', 'studentName', 'className', và 'answers' của học sinh.
 * @param {Object} context - Ngữ cảnh xác thực (không bắt buộc).
 * @returns {Promise<Object>} Điểm số và chi tiết kết quả để client hiển thị.
 */
exports.submitExam = functions.https.onCall(async (data, context) => {
  const { teacherAlias, examCode, studentName, className, answers } = data;

  if (!teacherAlias || !examCode || !studentName || !className || !answers) {
    throw new functions.https.HttpsError("invalid-argument", "Thiếu dữ liệu nộp bài bắt buộc.");
  }

  // Tìm giáo viên
  const teacherSnapshot = await db.collection("users").where("teacherAlias", "==", teacherAlias).limit(1).get();
  if (teacherSnapshot.empty) {
    throw new functions.https.HttpsError("not-found", "Không tìm thấy giáo viên với Alias này.");
  }
  const teacherDoc = teacherSnapshot.docs[0];
  const teacherId = teacherDoc.id;
  const teacherData = teacherDoc.data();

  // Kiểm tra thời gian dùng thử
  if (teacherData.trialEndDate && teacherData.trialEndDate.toMillis() < Date.now()) {
    throw new functions.https.HttpsError("permission-denied", "Giáo viên này đã hết thời gian dùng thử. Bài thi không thể nộp.");
  }

  // Tìm đề thi gốc để lấy đáp án và cấu hình điểm
  const examSnapshot = await db.collection("exams")
    .where("teacherId", "==", teacherId)
    .where("examCode", "==", examCode)
    .limit(1)
    .get();
  if (examSnapshot.empty) {
    throw new functions.https.HttpsError("not-found", `Không tìm thấy đề thi ${examCode} của giáo viên này để chấm điểm.`);
  }

  const examData = examSnapshot.docs[0].data();
  const keys = examData.keys; // Đáp án đúng từ DB
  const cores = examData.cores; // Cấu hình điểm từ DB
  const questionTypes = examData.questionTypes || []; // Loại câu hỏi từ DB

  let score = 0;
  const detailedResults = {}; // Chi tiết kết quả từng câu để gửi lại client

  keys.forEach((key, i) => {
    let questionScore = 0;
    const userAnswer = answers[`q${i}`]; // Lấy đáp án của học sinh cho câu i
    const type = questionTypes[i] || "Unknown"; // Lấy loại câu hỏi đã được xác định trước

    // Logic chấm điểm (giống hệt logic cũ của bạn trong GAS)
    if (type === "MC") {
      if (userAnswer === key) {
        questionScore = parseFloat(cores[0] || 0);
      }
      detailedResults[`q${i}`] = {
        userAnswer: userAnswer,
        correctAnswer: key,
        scoreEarned: questionScore,
        type: "MC",
      };
    } else if (type === "TF") {
      const totalTF = key.length;
      let countCorrect = 0;
      const userSubAnswers = [];
      for (let j = 0; j < totalTF; j++) {
        const subAnswer = answers[`q${i}_sub${j}`];
        userSubAnswers.push(subAnswer); // Lưu trữ tất cả đáp án con của người dùng
        if (subAnswer === key[j]) {
          countCorrect++;
        }
      }
      const tfScores = (cores[1] || "").split(",").map((x) => parseFloat(x));
      if (countCorrect >= 1 && countCorrect <= tfScores.length) {
        questionScore = tfScores[countCorrect - 1];
      }
      detailedResults[`q${i}`] = {
        userAnswer: userSubAnswers, // Lưu mảng đáp án con của người dùng
        correctAnswer: key,
        scoreEarned: questionScore,
        type: "TF",
      };
    } else if (type === "Numeric") {
      if (parseFloat(userAnswer) === parseFloat(key)) {
        questionScore = parseFloat(cores[2] || 0);
      }
      detailedResults[`q${i}`] = {
        userAnswer: userAnswer,
        correctAnswer: key,
        scoreEarned: questionScore,
        type: "Numeric",
      };
    }
    score += questionScore;
  });

  // Lưu kết quả nộp bài vào collection 'submissions'
  await db.collection("submissions").add({
    teacherId: teacherId, // Liên kết với giáo viên
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    examCode: examCode,
    studentName: studentName,
    className: className,
    answers: answers, // Lưu lại toàn bộ đáp án thô của học sinh
    score: parseFloat(score.toFixed(2)), // Điểm đã làm tròn
  });
  functions.logger.info(`Student ${studentName} submitted exam ${examCode} for teacher ${teacherAlias} with score ${score.toFixed(2)}.`);


  // Trả về kết quả cho client để hiển thị
  return {
    score: parseFloat(score.toFixed(2)),
    examData: { // Gửi lại dữ liệu đề thi cần thiết cho việc hiển thị (đáp án đúng, lời giải)
      keysStr: keys, // Rất quan trọng: Gửi đáp án đúng để frontend tô màu
      coreStr: cores, // Để frontend tính điểm T-F letter grade
      questionTexts: processImagePlaceholders(examData.questionTexts), // Đảm bảo hình ảnh được xử lý
      explanations: processImagePlaceholders(examData.explanations),
      timeLimit: examData.timeLimit,
    },
    detailedResults: detailedResults, // Chi tiết từng câu
  };
});
