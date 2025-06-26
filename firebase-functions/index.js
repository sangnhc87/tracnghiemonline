// firebase-functions/index.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

/**
 * Hàm tiện ích để xử lý placeholder hình ảnh.
 * @param {Array<string>} textArray Mảng các chuỗi văn bản.
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

// --- CÁC HÀM DÀNH CHO GIÁO VIÊN ---

/**
 * Tạo/cập nhật hồ sơ giáo viên khi đăng nhập.
 * @param {Object} data Dữ liệu không sử dụng.
 * @param {Object} context Ngữ cảnh xác thực của người dùng.
 * @return {Promise<Object>} Thông tin hồ sơ giáo viên.
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
    return {
      message: "Đăng ký thành công, bạn có 180 ngày dùng thử.",
      trialEndDate: trialEndDate.toDate().toISOString(),
      teacherAlias: null,
    };
  } else {
    const existingData = userDoc.data();
    let needsUpdate = false;

    if (!existingData.role || existingData.role !== "teacher") {
      existingData.role = "teacher";
      needsUpdate = true;
    }
    if (!existingData.trialEndDate || !(existingData.trialEndDate instanceof admin.firestore.Timestamp)) {
      existingData.trialEndDate = admin.firestore.Timestamp.fromMillis(Date.now() + 180 * 24 * 60 * 60 * 1000);
      needsUpdate = true;
    }
    if (existingData.teacherAlias === undefined) {
      existingData.teacherAlias = null;
      needsUpdate = true;
    }

    if (needsUpdate) {
      await userRef.update(existingData);
      functions.logger.info(`onTeacherSignIn: Đã cập nhật hồ sơ giáo viên ${userId} để sửa chữa thiếu sót.`);
    }
    return existingData;
  }
});

/**
 * Kiểm tra trạng thái dùng thử của giáo viên.
 * @param {Object} data Dữ liệu không sử dụng.
 * @param {Object} context Ngữ cảnh xác thực của người dùng.
 * @return {Promise<Object>} Trạng thái dùng thử.
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
 * Cập nhật mã Alias của giáo viên.
 * @param {Object} data Chứa trường 'alias' mới.
 * @param {Object} context Ngữ cảnh xác thực của người dùng.
 * @return {Promise<Object>} Trạng thái cập nhật.
 */
exports.updateTeacherAlias = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Chỉ giáo viên đã đăng nhập mới có thể cập nhật Alias.");
  }
  const userId = context.auth.uid;
  const newAlias = String(data.alias).trim().toLowerCase();
  if (!newAlias || newAlias.length < 3 || newAlias.length > 20 || !/^[a-z0-9]+$/.test(newAlias)) {
    throw new functions.https.HttpsError("invalid-argument", "Alias phải từ 3-20 ký tự, chỉ chứa chữ và số.");
  }
  const aliasCheck = await db.collection("users").where("teacherAlias", "==", newAlias).limit(1).get();
  if (!aliasCheck.empty && aliasCheck.docs[0].id !== userId) {
    throw new functions.https.HttpsError("already-exists", "Alias này đã có người dùng khác sử dụng.");
  }
  await db.collection("users").doc(userId).update({ teacherAlias: newAlias });
  return { success: true, message: "Cập nhật Alias thành công!" };
});

/**
 * Lấy toàn bộ dữ liệu (đề thi và lớp học) của một giáo viên.
 * @param {Object} data Dữ liệu không sử dụng.
 * @param {Object} context Ngữ cảnh xác thực.
 * @return {Promise<Object>} Object chứa mảng 'exams' và 'classes'.
 */
exports.getTeacherFullData = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Chỉ giáo viên được phép.");
  }
  const userId = context.auth.uid;
  const examsSnapshot = await db.collection("exams").where("teacherId", "==", userId).get();
  const exams = examsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const classesSnapshot = await db.collection("classes").where("teacherId", "==", userId).get();
  const classes = classesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return { exams, classes };
});

/**
 * Xóa một lớp học.
 * @param {Object} data Chứa 'classId'.
 * @param {Object} context Ngữ cảnh xác thực.
 * @return {Promise<Object>} Trạng thái xóa.
 */
exports.deleteClass = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Chỉ giáo viên được phép.");
  }
  const userId = context.auth.uid;
  const { classId } = data;
  if (!classId) {
    throw new functions.https.HttpsError("invalid-argument", "Thiếu ID của lớp.");
  }
  const classRef = db.collection("classes").doc(classId);
  const doc = await classRef.get();
  if (!doc.exists || doc.data().teacherId !== userId) {
    throw new functions.https.HttpsError("permission-denied", "Không có quyền xóa.");
  }
  await classRef.delete();
  return { success: true, message: "Đã xóa lớp học." };
});

/**
 * Xóa một đề thi.
 * @param {Object} data Chứa 'examId'.
 * @param {Object} context Ngữ cảnh xác thực.
 * @return {Promise<Object>} Trạng thái xóa.
 */
exports.deleteExam = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Chỉ giáo viên được phép.");
  }
  const userId = context.auth.uid;
  const { examId } = data;
  if (!examId) {
    throw new functions.https.HttpsError("invalid-argument", "Thiếu ID của đề thi.");
  }
  const examRef = db.collection("exams").doc(examId);
  const doc = await examRef.get();
  if (!doc.exists || doc.data().teacherId !== userId) {
    throw new functions.https.HttpsError("permission-denied", "Không có quyền xóa.");
  }
  await examRef.delete();
  return { success: true, message: "Đã xóa đề thi." };
});

/**
 * Lưu tất cả dữ liệu (đề thi và lớp học) từ dashboard của giáo viên.
 * @param {Object} data Chứa mảng 'exams' và 'classes'.
 * @param {Object} context Ngữ cảnh xác thực.
 * @return {Promise<Object>} Trạng thái lưu.
 */
exports.saveAllData = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Chỉ giáo viên được phép.");
  }
  const userId = context.auth.uid;
  const { exams, classes } = data;
  const batch = db.batch();

  if (Array.isArray(exams)) {
    for (const exam of exams) {
      const keysStrArray = String(exam.keys || "").split("|");
      const examData = {
        teacherId: userId,
        examCode: String(exam.examCode).trim(),
        keys: keysStrArray,
        cores: String(exam.cores || "").split("|"),
        questionTexts: String(exam.questionTexts || "").split(/\r?\n/),
        explanations: String(exam.explanations || "").split(/\r?\n/),
        timeLimit: exam.timeLimit || 90,
        questionTypes: keysStrArray.map((k) => "ABCD".includes(k) ? "MC" : /^[TF]+$/.test(k) ? "TF" : "Numeric"),
        tfCounts: keysStrArray.map((k) => /^[TF]+$/.test(k) ? k.length : 0),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (exam.id) {
        batch.update(db.collection("exams").doc(exam.id), examData);
      } else {
        examData.createdAt = admin.firestore.FieldValue.serverTimestamp();
        batch.set(db.collection("exams").doc(), examData);
      }
    }
  }

  if (Array.isArray(classes)) {
    for (const cls of classes) {
      const classData = {
        teacherId: userId,
        name: String(cls.name).trim(),
        students: Array.isArray(cls.students) ? cls.students : [],
      };
      if (cls.id) {
        batch.update(db.collection("classes").doc(cls.id), classData);
      } else {
        classData.createdAt = admin.firestore.FieldValue.serverTimestamp();
        batch.set(db.collection("classes").doc(), classData);
      }
    }
  }

  await batch.commit();
  return { success: true, message: "Đã lưu tất cả thay đổi!" };
});

// --- CÁC HÀM DÀNH CHO HỌC SINH ---

/**
 * Tải danh sách lớp cho học sinh.
 * @param {Object} data Chứa 'teacherAlias'.
 * @param {Object} context Ngữ cảnh xác thực (không bắt buộc).
 * @return {Promise<Object>} Đối tượng chứa danh sách lớp.
 */
exports.getClassesForStudent = functions.https.onCall(async (data, context) => {
  const teacherAlias = String(data.teacherAlias).trim().toLowerCase();
  if (!teacherAlias) {
    throw new functions.https.HttpsError("invalid-argument", "Mã giáo viên là bắt buộc.");
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
 * Tải đề thi cho học sinh (chỉ phần không nhạy cảm).
 * @param {Object} data Chứa 'teacherAlias' và 'examCode'.
 * @param {Object} context Ngữ cảnh xác thực (không bắt buộc).
 * @return {Promise<Object>} Đối tượng đề thi.
 */
exports.loadExamForStudent = functions.https.onCall(async (data, context) => {
  const { teacherAlias, examCode } = data;
  if (!teacherAlias || !examCode) {
    throw new functions.https.HttpsError("invalid-argument", "Mã giáo viên và Mã đề là bắt buộc.");
  }
  const teacherSnapshot = await db.collection("users").where("teacherAlias", "==", teacherAlias).limit(1).get();
  if (teacherSnapshot.empty) {
    throw new functions.https.HttpsError("not-found", "Không tìm thấy giáo viên.");
  }
  const teacherDoc = teacherSnapshot.docs[0];
  const teacherData = teacherDoc.data();
  if (!teacherData.trialEndDate || teacherData.trialEndDate.toMillis() < Date.now()) {
    throw new functions.https.HttpsError("permission-denied", "Giáo viên đã hết hạn dùng thử.");
  }
  const examSnapshot = await db.collection("exams")
    .where("teacherId", "==", teacherDoc.id)
    .where("examCode", "==", examCode)
    .limit(1)
    .get();
  if (examSnapshot.empty) {
    throw new functions.https.HttpsError("not-found", `Không tìm thấy đề thi ${examCode}.`);
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
 * Chấm điểm và nộp bài.
 * @param {Object} data Chứa 'teacherAlias', 'examCode', 'studentName', 'className', và 'answers'.
 * @param {Object} context Ngữ cảnh xác thực (không bắt buộc).
 * @return {Promise<Object>} Điểm số và chi tiết kết quả.
 */
exports.submitExam = functions.https.onCall(async (data, context) => {
  const { teacherAlias, examCode, studentName, className, answers } = data;
  if (!teacherAlias || !examCode || !studentName || !className || !answers) {
    throw new functions.https.HttpsError("invalid-argument", "Thiếu dữ liệu nộp bài.");
  }
  const teacherSnapshot = await db.collection("users").where("teacherAlias", "==", teacherAlias).limit(1).get();
  if (teacherSnapshot.empty) {
    throw new functions.https.HttpsError("not-found", "Không tìm thấy giáo viên.");
  }
  const teacherDoc = teacherSnapshot.docs[0];
  const teacherData = teacherDoc.data();
  if (!teacherData.trialEndDate || teacherData.trialEndDate.toMillis() < Date.now()) {
    throw new functions.https.HttpsError("permission-denied", "Giáo viên đã hết hạn dùng thử.");
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
  const { keys, cores, questionTypes = [] } = examData;
  let score = 0;
  const detailedResults = {};

  keys.forEach((key, i) => {
    let questionScore = 0;
    const userAnswer = answers[`q${i}`];
    const type = questionTypes[i] || "Unknown";
    if (type === "MC") {
      if (userAnswer === key) questionScore = parseFloat(cores[0] || 0);
      detailedResults[`q${i}`] = { userAnswer, correctAnswer: key, scoreEarned: questionScore, type: "MC" };
    } else if (type === "TF") {
      let countCorrect = 0;
      const userSubAnswers = [];
      for (let j = 0; j < key.length; j++) {
        const subAnswer = answers[`q${i}_sub${j}`];
        userSubAnswers.push(subAnswer);
        if (subAnswer === key[j]) countCorrect++;
      }
      const tfScores = (cores[1] || "").split(",").map((x) => parseFloat(x));
      if (countCorrect >= 1 && countCorrect <= tfScores.length) questionScore = tfScores[countCorrect - 1];
      detailedResults[`q${i}`] = { userAnswer: userSubAnswers, correctAnswer: key, scoreEarned: questionScore, type: "TF" };
    } else if (type === "Numeric") {
      if (parseFloat(userAnswer) === parseFloat(key)) questionScore = parseFloat(cores[2] || 0);
      detailedResults[`q${i}`] = { userAnswer, correctAnswer: key, scoreEarned: questionScore, type: "Numeric" };
    }
    score += questionScore;
  });

  await db.collection("submissions").add({
    teacherId: teacherDoc.id,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    examCode,
    studentName,
    className,
    answers,
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

// Thêm vào cuối file firebase-functions/index.js

exports.getTeacherFullClass = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Chỉ giáo viên được phép.");
  const { classId } = data;
  if (!classId) throw new functions.https.HttpsError("invalid-argument", "Thiếu ID của lớp.");
  const doc = await db.collection("classes").doc(classId).get();
  if (!doc.exists || doc.data().teacherId !== context.auth.uid) throw new functions.https.HttpsError("permission-denied", "Không có quyền xem.");
  return { id: doc.id, ...doc.data() };
});

exports.addClass = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Chỉ giáo viên được phép.");
  const { classData } = data;
  if (!classData.name) throw new functions.https.HttpsError("invalid-argument", "Tên lớp không được trống.");
  const newClassData = {
    teacherId: context.auth.uid,
    name: String(classData.name).trim(),
    students: Array.isArray(classData.students) ? classData.students : [],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await db.collection("classes").add(newClassData);
  return { success: true, message: "Đã thêm lớp học thành công!" };
});

exports.updateClass = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Chỉ giáo viên được phép.");
  const { classId, classData } = data;
  if (!classId) throw new functions.https.HttpsError("invalid-argument", "Thiếu ID của lớp.");
  const classRef = db.collection("classes").doc(classId);
  const doc = await classRef.get();
  if (!doc.exists || doc.data().teacherId !== context.auth.uid) throw new functions.https.HttpsError("permission-denied", "Không có quyền sửa.");
  const updatedClassData = {
    name: String(classData.name).trim(),
    students: Array.isArray(classData.students) ? classData.students : [],
  };
  await classRef.update(updatedClassData);
  return { success: true, message: "Đã cập nhật lớp học thành công!" };
});