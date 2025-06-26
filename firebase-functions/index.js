// functions/index.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Khởi tạo Firebase Admin SDK. Đây là cách Cloud Functions kết nối với Firebase services.
// Đảm bảo rằng Firebase Admin SDK đã được khởi tạo một lần duy nhất.
admin.initializeApp();

// Lấy đối tượng Firestore database
const db = admin.firestore();

/**
 * Hàm tiện ích để xử lý placeholder hình ảnh trong nội dung câu hỏi và lời giải.
 * @param {Array<string>} textArray - Mảng các chuỗi văn bản.
 * @return {Array<string>} Mảng các chuỗi đã được xử lý.
 */
const processImagePlaceholders = (textArray) => {
  if (!Array.isArray(textArray)) {
    return [];
  }
  return textArray.map((text) => {
    text = String(text);
    text = text.replace(/sangnhc1/g, "https://gitlab.com/nguyensangnhc/pic4web/-/raw/main/Hinh");
    text = text.replace(/sangnhc2/g, "https://gitlab.com/nguyensangnhc/tikz4web/-/raw/main/Hinh");
    text = text.replace(/sangnhc3/g, "https://gitlab.com/nguyensangnhc/tikz2png/-/raw/main/Hinh");
    text = text.replace(/sangnhc4/g, "https://gitlab.com/nguyensangnhc/png2link/-/raw/main/Hinh");
    return text;
  });
};

// --- CÁC HÀM DÀNH CHO GIÁO VIÊN (YÊU CẦU ĐĂNG NHẬP GOOGLE) ---

/**
 * Hàm này được gọi khi giáo viên đăng nhập lần đầu hoặc quay lại.
 * Tạo hồ sơ mới nếu chưa có, hoặc kiểm tra và chuẩn hóa hồ sơ cũ.
 * @param {Object} data - Dữ liệu không sử dụng.
 * @param {Object} context - Ngữ cảnh xác thực của người dùng.
 * @returns {Promise<Object>} Thông tin hồ sơ giáo viên.
 */
exports.onTeacherSignIn = functions.https.onCall(async (data, context) => {
  functions.logger.info("onTeacherSignIn: Hàm đã được gọi.");
  if (!context.auth) {
    functions.logger.error("onTeacherSignIn: Lỗi xác thực, không có context.auth.");
    throw new functions.https.HttpsError("unauthenticated", "Chỉ giáo viên đã đăng nhập mới có thể thực hiện thao tác này.");
  }

  const userId = context.auth.uid;
  const email = context.auth.token.email;
  const userName = context.auth.token.name || email;
  functions.logger.info(`onTeacherSignIn: Người dùng UID=${userId}, Email=${email} đang thử đăng nhập.`);

  const userRef = db.collection("users").doc(userId);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    // Đây là giáo viên mới, tạo tài khoản và đặt thời gian dùng thử
    const trialEndDate = admin.firestore.Timestamp.fromMillis(Date.now() + 180 * 24 * 60 * 60 * 1000);
    const newUserProfile = {
      email: email,
      name: userName,
      role: "teacher",
      trialEndDate: trialEndDate,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      teacherAlias: null,
    };
    await userRef.set(newUserProfile);
    functions.logger.info(`onTeacherSignIn: Đã tạo hồ sơ mới thành công cho ${userId}.`);
    return { message: "Đăng ký thành công, bạn có 180 ngày dùng thử.", trialEndDate: trialEndDate.toDate().toISOString(), teacherAlias: null };
  } else {
    // Giáo viên đã tồn tại, kiểm tra và chuẩn hóa dữ liệu cũ nếu cần
    const existingData = userDoc.data();
    let needsUpdate = false;
    functions.logger.info(`onTeacherSignIn: Hồ sơ giáo viên ${userId} đã tồn tại. Kiểm tra dữ liệu...`);

    if (!existingData.role || existingData.role !== "teacher") {
      existingData.role = "teacher";
      needsUpdate = true;
      functions.logger.warn(`onTeacherSignIn: Đã sửa trường 'role' cho ${userId}.`);
    }

    if (!existingData.trialEndDate || !(existingData.trialEndDate instanceof admin.firestore.Timestamp)) {
      existingData.trialEndDate = admin.firestore.Timestamp.fromMillis(Date.now() + 180 * 24 * 60 * 60 * 1000);
      needsUpdate = true;
      functions.logger.warn(`onTeacherSignIn: Đã đặt lại 'trialEndDate' cho ${userId}.`);
    }

    if (existingData.teacherAlias === undefined) {
      existingData.teacherAlias = null;
      needsUpdate = true;
      functions.logger.warn(`onTeacherSignIn: Đã thêm trường 'teacherAlias' cho ${userId}.`);
    }

    if (needsUpdate) {
      await userRef.update(existingData);
      functions.logger.info(`onTeacherSignIn: Đã cập nhật hồ sơ giáo viên ${userId} để sửa chữa thiếu sót.`);
    }

    functions.logger.info(`onTeacherSignIn: Đang trả về dữ liệu hồ sơ hiện có cho ${userId}.`);
    return existingData;
  }
});

/**
 * Hàm kiểm tra trạng thái dùng thử của giáo viên.
 * @param {Object} data - Dữ liệu không sử dụng.
 * @param {Object} context - Ngữ cảnh xác thực của người dùng.
 * @returns {Promise<Object>} Trạng thái dùng thử.
 */
exports.checkTrialStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Chỉ giáo viên đã đăng nhập mới có thể kiểm tra.");
  }
  const userId = context.auth.uid;
  const userDoc = await db.collection("users").doc(userId).get();

  if (!userDoc.exists || !userDoc.data() || userDoc.data().role !== "teacher") {
    throw new functions.https.HttpsError("permission-denied", "Bạn không phải giáo viên hoặc tài khoản không hợp lệ.");
  }

  const trialEndDate = userDoc.data().trialEndDate;
  if (!trialEndDate || !(trialEndDate instanceof admin.firestore.Timestamp)) {
    return { isActive: false, remainingDays: 0, message: "Lỗi dữ liệu thời gian dùng thử." };
  }

  const remainingDays = Math.ceil((trialEndDate.toMillis() - Date.now()) / (1000 * 60 * 60 * 24));
  return { isActive: remainingDays > 0, remainingDays: Math.max(0, remainingDays) };
});

/**
 * Hàm cho giáo viên cập nhật mã Alias của mình.
 * @param {Object} data - Chứa trường 'alias' mới.
 * @param {Object} context - Ngữ cảnh xác thực của người dùng.
 * @returns {Promise<Object>} Trạng thái cập nhật.
 */
exports.updateTeacherAlias = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Chỉ giáo viên đã đăng nhập mới có thể cập nhật Alias.");
  }
  const userId = context.auth.uid;
  const newAlias = String(data.alias).trim().toLowerCase();

  if (!newAlias || newAlias.length < 3 || newAlias.length > 20 || !/^[a-z0-9]+$/.test(newAlias)) {
    throw new functions.https.HttpsError("invalid-argument", "Alias phải từ 3 đến 20 ký tự và chỉ chứa chữ cái (không dấu), số, không có khoảng trắng hoặc ký tự đặc biệt.");
  }

  const aliasCheck = await db.collection("users").where("teacherAlias", "==", newAlias).limit(1).get();
  if (!aliasCheck.empty && aliasCheck.docs[0].id !== userId) {
    throw new functions.https.HttpsError("already-exists", "Alias này đã có giáo viên khác sử dụng. Vui lòng chọn Alias khác.");
  }

  await db.collection("users").doc(userId).update({ teacherAlias: newAlias });
  functions.logger.info(`Teacher ${userId} updated alias to ${newAlias}`);
  return { success: true, message: "Cập nhật Alias thành công!" };
});

/**
 * Hàm tải danh sách đề thi của một giáo viên.
 * @param {Object} data - Dữ liệu không sử dụng.
 * @param {Object} context - Ngữ cảnh xác thực của người dùng.
 * @returns {Promise<Array>} Danh sách các đề thi.
 */
exports.getTeacherExams = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Chỉ giáo viên đã đăng nhập mới có thể xem đề thi.");
  }
  const userId = context.auth.uid;
  const userDoc = await db.collection("users").doc(userId).get();
  if (!userDoc.exists || !userDoc.data() || !userDoc.data().trialEndDate || userDoc.data().trialEndDate.toMillis() < Date.now()) {
    throw new functions.https.HttpsError("permission-denied", "Thời gian dùng thử của bạn đã hết. Vui lòng liên hệ quản trị viên.");
  }
  const examsSnapshot = await db.collection("exams").where("teacherId", "==", userId).get();
  const exams = examsSnapshot.docs.map((doc) => {
    const examData = doc.data();
    delete examData.keys;
    delete examData.cores;
    return { id: doc.id, ...examData };
  });
  return exams;
});

/**
 * Hàm tải danh sách lớp và học sinh của một giáo viên.
 * @param {Object} data - Dữ liệu không sử dụng.
 * @param {Object} context - Ngữ cảnh xác thực của người dùng.
 * @returns {Promise<Object>} Đối tượng chứa danh sách lớp và học sinh.
 */
exports.getTeacherClasses = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Chỉ giáo viên đã đăng nhập mới có thể xem danh sách lớp.");
  }
  const userId = context.auth.uid;
  const userDoc = await db.collection("users").doc(userId).get();
  if (!userDoc.exists || !userDoc.data() || !userDoc.data().trialEndDate || userDoc.data().trialEndDate.toMillis() < Date.now()) {
    throw new functions.https.HttpsError("permission-denied", "Thời gian dùng thử của bạn đã hết.");
  }
  const classesSnapshot = await db.collection("classes").where("teacherId", "==", userId).get();
  const classData = {};
  classesSnapshot.forEach((doc) => {
    classData[doc.data().name] = doc.data().students || [];
  });
  return classData;
});

/**
 * Hàm cho giáo viên tải lên danh sách đề thi từ file CSV/JSON.
 * @param {Object} data - Chứa mảng 'exams' cần tải lên.
 * @param {Object} context - Ngữ cảnh xác thực của người dùng.
 * @returns {Promise<Object>} Trạng thái tải lên.
 */
exports.uploadExams = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Chỉ giáo viên mới có thể tải lên đề thi.");
  }
  const userId = context.auth.uid;
  const userDoc = await db.collection("users").doc(userId).get();
  if (!userDoc.exists || !userDoc.data() || !userDoc.data().trialEndDate || userDoc.data().trialEndDate.toMillis() < Date.now()) {
    throw new functions.https.HttpsError("permission-denied", "Thời gian dùng thử của bạn đã hết. Không thể tải lên đề thi.");
  }
  const examsToUpload = data.exams;
  if (!Array.isArray(examsToUpload) || examsToUpload.length === 0) {
    throw new functions.https.HttpsError("invalid-argument", "Không có dữ liệu đề thi để tải lên.");
  }
  const batch = db.batch();
  for (const exam of examsToUpload) {
    if (exam.examCode) {
      const keysStrArray = String(exam.keys || "").split("|").filter((x) => x !== "");
      const questionTypes = keysStrArray.map((key) => {
        if (key.length === 1 && ["A", "B", "C", "D"].includes(key)) return "MC";
        if (/^[TF]+$/.test(key)) return "TF";
        if (/^-?[0-9.]+$/.test(key)) return "Numeric";
        return "Unknown";
      });
      const tfCounts = keysStrArray.map((key) => (/^[TF]+$/.test(key) ? key.length : 0));
      const newExamRef = db.collection("exams").doc();
      batch.set(newExamRef, {
        teacherId: userId,
        examCode: String(exam.examCode).trim(),
        keys: keysStrArray,
        cores: String(exam.cores || "").split("|").filter((x) => x !== ""),
        questionTexts: String(exam.questionTexts || "").split(/\r?\n/),
        explanations: String(exam.explanations || "").split(/\r?\n/),
        timeLimit: exam.timeLimit ? parseInt(exam.timeLimit, 10) : 90,
        questionTypes: questionTypes,
        tfCounts: tfCounts,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }
  await batch.commit();
  return { success: true, message: `Đã tải lên ${examsToUpload.length} đề thi.` };
});

/**
 * Hàm cho giáo viên tải lên danh sách lớp và học sinh từ file CSV/JSON.
 * @param {Object} data - Chứa mảng 'classes' cần tải lên.
 * @param {Object} context - Ngữ cảnh xác thực của người dùng.
 * @returns {Promise<Object>} Trạng thái tải lên.
 */
exports.uploadClasses = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Chỉ giáo viên mới có thể tải lên danh sách lớp.");
  }
  const userId = context.auth.uid;
  const userDoc = await db.collection("users").doc(userId).get();
  if (!userDoc.exists || !userDoc.data() || !userDoc.data().trialEndDate || userDoc.data().trialEndDate.toMillis() < Date.now()) {
    throw new functions.https.HttpsError("permission-denied", "Thời gian dùng thử của bạn đã hết.");
  }
  const classesToUpload = data.classes;
  if (!Array.isArray(classesToUpload) || classesToUpload.length === 0) {
    throw new functions.https.HttpsError("invalid-argument", "Không có dữ liệu lớp để tải lên.");
  }
  const batch = db.batch();
  for (const _class of classesToUpload) {
    if (_class.name) {
      const studentsArray = Array.isArray(_class.students) ? _class.students.map((s) => String(s).trim()).filter((s) => s) : String(_class.students || "").split(",").map((s) => String(s).trim()).filter((s) => s);
      const newClassRef = db.collection("classes").doc();
      batch.set(newClassRef, {
        teacherId: userId,
        name: String(_class.name).trim(),
        students: studentsArray,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }
  await batch.commit();
  return { success: true, message: `Đã tải lên ${classesToUpload.length} lớp học.` };
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
  const teacherSnapshot = await db.collection("users").where("teacherAlias", "==", teacherAlias).limit(1).get();
  if (teacherSnapshot.empty) {
    throw new functions.https.HttpsError("not-found", "Không tìm thấy giáo viên với Alias này.");
  }
  const teacherDoc = teacherSnapshot.docs[0];
  const teacherData = teacherDoc.data();
  if (!teacherData.trialEndDate || teacherData.trialEndDate.toMillis() < Date.now()) {
    throw new functions.https.HttpsError("permission-denied", "Giáo viên này đã hết hạn dùng thử.");
  }
  const classesSnapshot = await db.collection("classes").where("teacherId", "==", teacherDoc.id).get();
  const classData = {};
  classesSnapshot.forEach((doc) => {
    classData[doc.data().name] = doc.data().students || [];
  });
  return classData;
});

/**
 * Hàm tải đề thi cho học sinh. Chỉ trả về thông tin không nhạy cảm.
 * @param {Object} data - Chứa 'teacherAlias' và 'examCode'.
 * @param {Object} context - Ngữ cảnh xác thực (không bắt buộc).
 * @returns {Promise<Object>} Đối tượng đề thi (chỉ phần không nhạy cảm).
 */
exports.loadExamForStudent = functions.https.onCall(async (data, context) => {
  const { teacherAlias, examCode } = data;
  if (!teacherAlias || !examCode) {
    throw new functions.https.HttpsError("invalid-argument", "Mã giáo viên và Mã đề là bắt buộc.");
  }
  const teacherSnapshot = await db.collection("users").where("teacherAlias", "==", teacherAlias).limit(1).get();
  if (teacherSnapshot.empty) {
    throw new functions.https.HttpsError("not-found", "Không tìm thấy giáo viên với Alias này.");
  }
  const teacherDoc = teacherSnapshot.docs[0];
  const teacherData = teacherDoc.data();
  if (!teacherData.trialEndDate || teacherData.trialEndDate.toMillis() < Date.now()) {
    throw new functions.https.HttpsError("permission-denied", "Giáo viên này đã hết hạn dùng thử.");
  }
  const examSnapshot = await db.collection("exams")
    .where("teacherId", "==", teacherDoc.id)
    .where("examCode", "==", examCode)
    .limit(1)
    .get();
  if (examSnapshot.empty) {
    throw new functions.https.HttpsError("not-found", `Không tìm thấy đề thi ${examCode} của giáo viên này.`);
  }
  const examData = examSnapshot.docs[0].data();
  return {
    questionTexts: processImagePlaceholders(examData.questionTexts),
    explanations: processImagePlaceholders(examData.explanations),
    timeLimit: examData.timeLimit || 90,
    questionTypes: examData.questionTypes || [],
    tfCounts: examData.tfCounts || [],
  };
});

/**
 * Hàm chấm điểm và nộp bài. Toàn bộ logic chấm điểm được thực hiện an toàn trên server.
 * @param {Object} data - Chứa 'teacherAlias', 'examCode', 'studentName', 'className', và 'answers'.
 * @param {Object} context - Ngữ cảnh xác thực (không bắt buộc).
 * @returns {Promise<Object>} Điểm số và chi tiết kết quả để client hiển thị.
 */
exports.submitExam = functions.https.onCall(async (data, context) => {
  const { teacherAlias, examCode, studentName, className, answers } = data;
  if (!teacherAlias || !examCode || !studentName || !className || !answers) {
    throw new functions.https.HttpsError("invalid-argument", "Thiếu dữ liệu nộp bài.");
  }
  const teacherSnapshot = await db.collection("users").where("teacherAlias", "==", teacherAlias).limit(1).get();
  if (teacherSnapshot.empty) {
    throw new functions.https.HttpsError("not-found", "Không tìm thấy giáo viên với Alias này.");
  }
  const teacherDoc = teacherSnapshot.docs[0];
  const teacherData = teacherDoc.data();
  if (!teacherData.trialEndDate || teacherData.trialEndDate.toMillis() < Date.now()) {
    throw new functions.https.HttpsError("permission-denied", "Giáo viên này đã hết hạn dùng thử.");
  }
  const examSnapshot = await db.collection("exams")
    .where("teacherId", "==", teacherDoc.id)
    .where("examCode", "==", examCode)
    .limit(1)
    .get();
  if (examSnapshot.empty) {
    throw new functions.https.HttpsError("not-found", `Không tìm thấy đề thi ${examCode} để chấm điểm.`);
  }
  const examData = examSnapshot.docs[0].data();
  const keys = examData.keys;
  const cores = examData.cores;
  const questionTypes = examData.questionTypes || [];
  let score = 0;
  const detailedResults = {};
  keys.forEach((key, i) => {
    let questionScore = 0;
    const userAnswer = answers[`q${i}`];
    const type = questionTypes[i] || "Unknown";
    if (type === "MC") {
      if (userAnswer === key) {
        questionScore = parseFloat(cores[0] || 0);
      }
      detailedResults[`q${i}`] = { userAnswer: userAnswer, correctAnswer: key, scoreEarned: questionScore, type: "MC" };
    } else if (type === "TF") {
      const totalTF = key.length;
      let countCorrect = 0;
      const userSubAnswers = [];
      for (let j = 0; j < totalTF; j++) {
        const subAnswer = answers[`q${i}_sub${j}`];
        userSubAnswers.push(subAnswer);
        if (subAnswer === key[j]) {
          countCorrect++;
        }
      }
      const tfScores = (cores[1] || "").split(",").map((x) => parseFloat(x));
      if (countCorrect >= 1 && countCorrect <= tfScores.length) {
        questionScore = tfScores[countCorrect - 1];
      }
      detailedResults[`q${i}`] = { userAnswer: userSubAnswers, correctAnswer: key, scoreEarned: questionScore, type: "TF" };
    } else if (type === "Numeric") {
      if (parseFloat(userAnswer) === parseFloat(key)) {
        questionScore = parseFloat(cores[2] || 0);
      }
      detailedResults[`q${i}`] = { userAnswer: userAnswer, correctAnswer: key, scoreEarned: questionScore, type: "Numeric" };
    }
    score += questionScore;
  });
  await db.collection("submissions").add({
    teacherId: teacherDoc.id,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    examCode: examCode,
    studentName: studentName,
    className: className,
    answers: answers,
    score: parseFloat(score.toFixed(2)),
  });
  return {
    score: parseFloat(score.toFixed(2)),
    examData: {
      keysStr: keys,
      coreStr: cores,
      questionTexts: processImagePlaceholders(examData.questionTexts),
      explanations: processImagePlaceholders(examData.explanations),
      timeLimit: examData.timeLimit,
    },
    detailedResults: detailedResults,
  };
});

/**
 * Hàm kiểm tra đơn giản để xem Cloud Functions có hoạt động không.
 * @param {Object} data - Dữ liệu không sử dụng.
 * @param {Object} context - Ngữ cảnh xác thực (không bắt buộc).
 * @returns {Object} Một thông báo thành công.
 */
exports.helloWorldTest = functions.https.onCall((data, context) => {
  functions.logger.info("Hello World Test: Hàm đã được gọi!");
  return { message: "Hello from Firebase Cloud Functions!" };
});
