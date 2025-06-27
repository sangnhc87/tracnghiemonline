// firebase-functions/index.js (Phiên bản Nâng cấp Hoàn chỉnh - Sửa lỗi INTERNAL và Nộp bài)

const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

/**
 * Phân tích một chuỗi văn bản lớn thành các câu hỏi và lời giải riêng biệt.
 * @param {string} rawText Chuỗi văn bản thô từ textarea.
 * @return {{questions: string[], explanations: string[]}} Một object chứa mảng câu hỏi và mảng lời giải.
 */
function parseExamContent(rawText) {
    if (!rawText || typeof rawText !== 'string') {
        return { questions: [], explanations: [] };
    }

    const questions = [];
    const explanations = [];

    // 1. Normalize newlines
    rawText = rawText.replace(/\r\n/g, '\n');

    // 2. Define the regex to find the start of a question.
    const questionStartPattern = /(?:^|\n\s*)([Cc][âĂaA][uUu]|[Bb][àÀaA][iI]|[Qq][uUu][eE][sS][tT][iI][oO][nN])\s*\d+[:.]?/g;

    // Use matchAll to get all occurrences of question starts and their indices.
    const matches = [...rawText.matchAll(questionStartPattern)];

    // 3. If no explicit question patterns are found, treat the entire content as one single question.
    if (matches.length === 0) {
        questions.push(rawText.trim());
        explanations.push('');
        return { questions, explanations };
    }

    // 4. Iterate through the matches to extract each question block.
    for (let i = 0; i < matches.length; i++) {
        const currentMatch = matches[i];
        const startIndex = currentMatch.index;

        const endIndex = (i + 1 < matches.length) ? matches[i + 1].index : rawText.length;

        let block = rawText.substring(startIndex, endIndex).trim();
        if (!block) continue;

        let questionText = block;
        let explanationText = '';

        // 5. Extract the explanation part from the current question block.
        const loigiaiRegex = /\\begin\{loigiai\}([\s\S]*?)\\end\{loigiai\}/i;
        const matchExplanation = questionText.match(loigiaiRegex);

        if (matchExplanation && matchExplanation[1]) {
            explanationText = matchExplanation[1].trim();
            questionText = questionText.replace(loigiaiRegex, '').trim();
        }

        questions.push(questionText);
        explanations.push(explanationText);
    }
    
    return { questions, explanations };
}


// --- CÁC HÀM XÁC THỰC & QUẢN LÝ TÀI KHOẢN GIÁO VIÊN ---
exports.onTeacherSignIn = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
  const { uid, email, name } = context.auth.token;
  const userRef = db.collection("users").doc(uid);
  const userDoc = await userRef.get();
  if (!userDoc.exists) {
    const trialEndDate = admin.firestore.Timestamp.fromMillis(Date.now() + 180 * 24 * 60 * 60 * 1000);
    await userRef.set({ email, name: name || email, role: "teacher", trialEndDate, createdAt: admin.firestore.FieldValue.serverTimestamp(), teacherAlias: null });
    return { trialEndDate: trialEndDate.toDate().toISOString(), teacherAlias: null };
  } else {
    const existingData = userDoc.data();
    if (existingData.trialEndDate && !(existingData.trialEndDate instanceof admin.firestore.Timestamp)) {
        existingData.trialEndDate = admin.firestore.Timestamp.fromDate(new Date(existingData.trialEndDate));
    }
    return existingData;
  }
});

exports.updateTeacherAlias = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
  const { uid } = context.auth;
  const newAlias = String(data.alias).trim().toLowerCase();
  if (!newAlias || newAlias.length < 3 || newAlias.length > 20 || !/^[a-z0-9]+$/.test(newAlias)) {
    throw new functions.https.HttpsError("invalid-argument", "Alias phải từ 3-20 ký tự, chỉ chứa chữ và số.");
  }
  const aliasCheck = await db.collection("users").where("teacherAlias", "==", newAlias).limit(1).get();
  if (!aliasCheck.empty && aliasCheck.docs[0].id !== uid) {
    throw new functions.https.HttpsError("already-exists", "Alias này đã có người dùng khác sử dụng.");
  }
  await db.collection("users").doc(uid).update({ teacherAlias: newAlias });
  return { success: true, message: "Cập nhật Alias thành công!" };
});

// --- CÁC HÀM QUẢN LÝ DỮ LIỆU (CRUD) ---
exports.getTeacherFullData = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
  const { uid } = context.auth;
  const examsPromise = db.collection("exams").where("teacherId", "==", uid).get();
  const classesPromise = db.collection("classes").where("teacherId", "==", uid).get();
  const [examsSnapshot, classesSnapshot] = await Promise.all([examsPromise, classesPromise]);
  const exams = examsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const classes = classesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return { exams, classes };
});

// --- Quản lý Đề thi (ĐÃ NÂNG CẤP) ---
exports.addExam = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
    const { examData } = data;
    if (!examData) throw new functions.https.HttpsError("invalid-argument", "Thiếu dữ liệu đề thi.");
    
    const { questions, explanations } = parseExamContent(examData.content);
    
    if (questions.length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "Không tìm thấy câu hỏi nào. Hãy chắc chắn bạn đã dùng định dạng 'Câu 1:', 'Bài 2:', v.v...");
    }

    const newExamData = {
        teacherId: context.auth.uid,
        examCode: String(examData.examCode).trim(),
        timeLimit: parseInt(examData.timeLimit, 10) || 90,
        keys: String(examData.keys || "").split("|").map(k => k.trim()),
        cores: String(examData.cores || "").split("|").map(c => c.trim()),
        questionTexts: questions,
        explanations: explanations,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await db.collection("exams").add(newExamData);
    return { success: true, message: `Đã thêm thành công ${questions.length} câu hỏi!` };
});

exports.updateExam = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
    const { examId, examData } = data;
    if (!examId || !examData) throw new functions.https.HttpsError("invalid-argument", "Thiếu ID hoặc dữ liệu đề thi.");
    
    const examRef = db.collection("exams").doc(examId);
    const doc = await examRef.get();
    if (!doc.exists || doc.data().teacherId !== context.auth.uid) {
        throw new functions.https.HttpsError("permission-denied", "Bạn không có quyền sửa đề thi này.");
    }

    const { questions, explanations } = parseExamContent(examData.content);

    if (questions.length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "Không tìm thấy câu hỏi nào trong nội dung bạn cung cấp.");
    }

    const updatedExamData = {
        examCode: String(examData.examCode).trim(),
        timeLimit: parseInt(examData.timeLimit, 10) || 90,
        keys: String(examData.keys || "").split("|").map(k => k.trim()),
        cores: String(examData.cores || "").split("|").map(c => c.trim()),
        questionTexts: questions,
        explanations: explanations,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await examRef.update(updatedExamData);
    return { success: true, message: `Đã cập nhật thành công ${questions.length} câu hỏi!` };
});

exports.deleteExam = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
  const { examId } = data;
  if (!examId) throw new functions.https.HttpsError("invalid-argument", "Thiếu ID đề thi.");
  const examRef = db.collection("exams").doc(examId);
  const doc = await examRef.get();
  if (!doc.exists || doc.data().teacherId !== context.auth.uid) throw new functions.https.HttpsError("permission-denied", "Không có quyền xóa đề thi này.");
  await examRef.delete();
  return { success: true, message: "Đã xóa đề thi." };
});

exports.getTeacherFullExam = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
    const { examId } = data;
    if (!examId) throw new functions.https.HttpsError("invalid-argument", "Thiếu ID đề thi.");
    const doc = await db.collection("exams").doc(examId).get();
    if (!doc.exists || doc.data().teacherId !== context.auth.uid) throw new functions.https.HttpsError("permission-denied", "Không có quyền xem đề thi này.");
    return { id: doc.id, ...doc.data() };
});

// --- Quản lý Lớp học ---
exports.addClass = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
  const { classData } = data;
  if (!classData || !classData.name) throw new functions.https.HttpsError("invalid-argument", "Tên lớp không được trống.");
  await db.collection("classes").add({ teacherId: context.auth.uid, name: String(classData.name).trim(), students: Array.isArray(classData.students) ? classData.students.filter(s => s.trim() !== "") : [], createdAt: admin.firestore.FieldValue.serverTimestamp() });
  return { success: true, message: "Đã thêm lớp học thành công!" };
});

exports.updateClass = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
  const { classId, classData } = data;
  if (!classId || !classData) throw new functions.https.HttpsError("invalid-argument", "Thiếu ID hoặc dữ liệu lớp học.");
  const classRef = db.collection("classes").doc(classId);
  const doc = await classRef.get();
  if (!doc.exists || doc.data().teacherId !== context.auth.uid) throw new functions.https.HttpsError("permission-denied", "Không có quyền sửa lớp học này.");
  await classRef.update({ name: String(classData.name).trim(), students: Array.isArray(classData.students) ? classData.students.filter(s => s.trim() !== "") : [] });
  return { success: true, message: "Đã cập nhật lớp học thành công!" };
});

exports.deleteClass = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
  const { classId } = data;
  if (!classId) throw new functions.https.HttpsError("invalid-argument", "Thiếu ID lớp học.");
  const classRef = db.collection("classes").doc(classId);
  const doc = await classRef.get();
  if (!doc.exists || doc.data().teacherId !== context.auth.uid) throw new functions.https.HttpsError("permission-denied", "Không có quyền xóa lớp học này.");
  await classRef.delete();
  return { success: true, message: "Đã xóa lớp học." };
});

exports.getTeacherFullClass = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
  const { classId } = data;
  if (!classId) throw new functions.https.HttpsError("invalid-argument", "Thiếu ID lớp học.");
  const doc = await db.collection("classes").doc(classId).get();
  if (!doc.exists || doc.data().teacherId !== context.auth.uid) throw new functions.https.HttpsError("permission-denied", "Không có quyền xem lớp học này.");
  return { id: doc.id, ...doc.data() };
});

// --- CÁC HÀM DÀNH CHO HỌC SINH ---
exports.getClassesForStudent = functions.https.onCall(async (data, context) => {
  const teacherAlias = String(data.teacherAlias).trim().toLowerCase();
  if (!teacherAlias) throw new functions.https.HttpsError("invalid-argument", "Mã giáo viên là bắt buộc.");
  const teacherSnapshot = await db.collection("users").where("teacherAlias", "==", teacherAlias).limit(1).get();
  if (teacherSnapshot.empty) throw new functions.https.HttpsError("not-found", "Không tìm thấy giáo viên với Alias này.");
  const teacherDoc = teacherSnapshot.docs[0];
  const teacherData = teacherDoc.data();
  // Kiểm tra thời gian dùng thử (trialEndDate)
  // trialEndDate có thể là Timestamp hoặc Date string (nếu là legacy data)
  const trialEndDateMillis = teacherData.trialEndDate?.toMillis ? teacherData.trialEndDate.toMillis() : new Date(teacherData.trialEndDate).getTime();

  if (!teacherData.trialEndDate || trialEndDateMillis < Date.now()) {
    throw new functions.https.HttpsError("permission-denied", "Tài khoản của giáo viên này đã hết hạn dùng thử.");
  }

  const classesSnapshot = await db.collection("classes").where("teacherId", "==", teacherDoc.id).get();
  const classData = {};
  classesSnapshot.forEach((doc) => { classData[doc.data().name] = doc.data().students || []; });
  return classData;
});

exports.loadExamForStudent = functions.https.onCall(async (data, context) => {
  const { teacherAlias, examCode } = data;
  if (!teacherAlias || !examCode) throw new functions.https.HttpsError("invalid-argument", "Mã giáo viên và Mã đề là bắt buộc.");
  const teacherSnapshot = await db.collection("users").where("teacherAlias", "==", teacherAlias).limit(1).get();
  if (teacherSnapshot.empty) throw new functions.https.HttpsError("not-found", "Không tìm thấy giáo viên.");
  const teacherDoc = teacherSnapshot.docs[0];
  const teacherData = teacherDoc.data();

  const trialEndDateMillis = teacherData.trialEndDate?.toMillis ? teacherData.trialEndDate.toMillis() : new Date(teacherData.trialEndDate).getTime();
  if (!teacherData.trialEndDate || trialEndDateMillis < Date.now()) {
    throw new functions.https.HttpsError("permission-denied", "Tài khoản của giáo viên này đã hết hạn dùng thử.");
  }

  const examSnapshot = await db.collection("exams").where("teacherId", "==", teacherDoc.id).where("examCode", "==", examCode).limit(1).get();
  if (examSnapshot.empty) throw new functions.https.HttpsError("not-found", `Không tìm thấy đề thi ${examCode} của giáo viên này.`);
  const examData = examSnapshot.docs[0].data();
  const keysArray = Array.isArray(examData.keys) ? examData.keys : [];
  // Xác định loại câu hỏi dựa trên đáp án
  const questionTypes = keysArray.map(k => {
      if (typeof k !== 'string') return "Invalid"; // Handle non-string keys
      if (k.length === 1 && "ABCD".includes(k)) return "MC";
      if (/^[TF]+$/.test(k)) return "TF"; // 'T', 'F', 'TTF', etc.
      if (!isNaN(parseFloat(k))) return "Numeric"; // Numbers like '3.14', '10'
      return "Unknown"; // Fallback for unexpected key formats
  });
  const tfCounts = keysArray.map(k => (typeof k === 'string' && /^[TF]+$/.test(k)) ? k.length : 0);
  
  return {
    questionTexts: examData.questionTexts || [],
    timeLimit: examData.timeLimit || 90,
    questionTypes: questionTypes,
    tfCounts: tfCounts,
  };
});

exports.submitExam = functions.https.onCall(async (data, context) => {
  const { teacherAlias, examCode, studentName, className, answers, isCheating } = data;
  if (!teacherAlias || !examCode || !studentName || !className) throw new functions.https.HttpsError("invalid-argument", "Thiếu thông tin định danh (học sinh, đề thi...).");
  if (!isCheating && !answers) throw new functions.https.HttpsError("invalid-argument", "Thiếu dữ liệu câu trả lời của bài làm.");

  const teacherSnapshot = await db.collection("users").where("teacherAlias", "==", teacherAlias).limit(1).get();
  if (teacherSnapshot.empty) throw new functions.https.HttpsError("not-found", "Không tìm thấy giáo viên.");
  const teacherDoc = teacherSnapshot.docs[0];

  // Logic xử lý khi phát hiện gian lận (isCheating === true)
  if (isCheating === true) {
    await db.collection("submissions").add({ teacherId: teacherDoc.id, timestamp: admin.firestore.FieldValue.serverTimestamp(), examCode, studentName, className, score: 0, isCheating: true });
    // Trả về cấu trúc examData rỗng nhưng hợp lệ để frontend không bị lỗi
    return { score: 0, examData: { questionTexts: [], explanations: [] }, detailedResults: {} };
  }

  const examSnapshot = await db.collection("exams").where("teacherId", "==", teacherDoc.id).where("examCode", "==", examCode).limit(1).get();
  if (examSnapshot.empty) throw new functions.https.HttpsError("not-found", `Không tìm thấy đề thi ${examCode} để chấm điểm.`);

  const examData = examSnapshot.docs[0].data();
  const { keys, cores, questionTexts, explanations } = examData;
  
  // Đảm bảo keys và cores là mảng và có độ dài hợp lệ
  if (!Array.isArray(keys) || !Array.isArray(cores) || keys.length !== questionTexts.length) {
      throw new functions.https.HttpsError("internal", "Dữ liệu đề thi bị lỗi: Keys hoặc Cores không hợp lệ.");
  }

  // Xác định lại questionTypes để đảm bảo đồng bộ với keys
  const questionTypes = keys.map(k => {
      if (typeof k !== 'string') return "Invalid";
      if (k.length === 1 && "ABCD".includes(k)) return "MC";
      if (/^[TF]+$/.test(k)) return "TF";
      if (!isNaN(parseFloat(k))) return "Numeric";
      return "Unknown";
  });
  
  let totalScore = 0;
  const detailedResults = {};

  keys.forEach((key, i) => {
    let questionScore = 0;
    const type = questionTypes[i];
    const coreValue = parseFloat(cores[i]) || 0; // Giá trị điểm mặc định cho câu hỏi (nếu có)
    
    // Đảm bảo câu trả lời của học sinh được lấy đúng từ object 'answers'
    // và không phải 'answers.answers'
    if (type === "MC") {
        const userAnswer = answers[`q${i}`];
        if (userAnswer === key) questionScore = coreValue;
        detailedResults[`q${i}`] = { userAnswer: userAnswer || "", correctAnswer: key, scoreEarned: questionScore, type };
    } else if (type === "TF") {
        let countCorrect = 0;
        const userSubAnswers = [];
        const tfCoreValues = (cores[i] || "").split(",").map(x => parseFloat(x)).filter(n => !isNaN(n)); // Lọc bỏ NaN
        
        for (let j = 0; j < key.length; j++) {
            const subAnswer = answers[`q${i}_sub${j}`];
            userSubAnswers.push(subAnswer);
            if (subAnswer === key[j]) {
                countCorrect++;
            }
        }
        
        // Logic tính điểm cho câu Đúng/Sai: Lấy điểm tương ứng với số câu con đúng.
        if (countCorrect > 0 && countCorrect <= tfCoreValues.length) {
            questionScore = tfCoreValues[countCorrect - 1]; 
        } else if (countCorrect > tfCoreValues.length && tfCoreValues.length > 0) {
            // Trường hợp có nhiều câu con đúng hơn số điểm định nghĩa, lấy điểm tối đa
            questionScore = tfCoreValues[tfCoreValues.length - 1];
        } else {
            questionScore = 0; // Mặc định 0 điểm nếu không có câu con nào đúng hoặc không định nghĩa điểm
        }

        detailedResults[`q${i}`] = { userAnswer: userSubAnswers, correctAnswer: key, scoreEarned: questionScore, type };
    } else if (type === "Numeric") {
        const userAnswer = answers[`q${i}`];
        // Đảm bảo userAnswer là một số hợp lệ trước khi so sánh
        const parsedUserAnswer = parseFloat(userAnswer);
        const parsedCorrectAnswer = parseFloat(key);

        if (!isNaN(parsedUserAnswer) && !isNaN(parsedCorrectAnswer) && Math.abs(parsedUserAnswer - parsedCorrectAnswer) < 1e-9) {
            questionScore = coreValue;
        }
        detailedResults[`q${i}`] = { userAnswer: userAnswer || "", correctAnswer: key, scoreEarned: questionScore, type };
    }
    totalScore += questionScore;
  });

  // Lưu bài nộp vào Firestore. Đảm bảo 'answers' được lưu đúng là object chứa câu trả lời.
  await db.collection("submissions").add({ 
      teacherId: teacherDoc.id, 
      timestamp: admin.firestore.FieldValue.serverTimestamp(), 
      examCode, 
      studentName, 
      className, 
      answers: answers, // SỬA LỖI: Chỉ dùng 'answers'
      score: parseFloat(totalScore.toFixed(2)), 
      isCheating: false 
  });

  return {
    score: parseFloat(totalScore.toFixed(2)),
    examData: {
      keysStr: keys, // Frontend có thể mong đợi keysStr
      coreStr: cores, // Frontend có thể mong đợi coreStr
      questionTexts: questionTexts || [],
      explanations: explanations || [],
      timeLimit: examData.timeLimit,
    },
    detailedResults: detailedResults,
  };
});