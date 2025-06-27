// firebase-functions/index.js (Phiên bản Nâng cấp Hoàn Chỉnh Tuyệt đối)

const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

/**
 * Phân tích một chuỗi văn bản lớn thành các câu hỏi và lời giải riêng biệt.
 * Hàm này đủ mạnh để xử lý các định dạng "Câu X:", "Bài X:", "Question X:"
 * và tách lời giải kèm theo.
 * @param {string} rawText Chuỗi văn bản thô từ textarea.
 * @return {{questions: string[], explanations: string[]}} Một object chứa mảng câu hỏi và mảng lời giải.
 */
function parseExamContent(rawText) {
    if (!rawText || typeof rawText !== 'string') {
        return { questions: [], explanations: [] };
    }

    const questions = [];
    const explanations = [];

    // 1. Normalize newlines (Windows \r\n to Unix \n) for consistent parsing.
    rawText = rawText.replace(/\r\n/g, '\n');

    // 2. Define the regex to find the start of a question.
    // (?:^|\n\s*)  : Matches the start of the string OR a newline followed by optional whitespace.
    // ([Cc][âĂaA][uUu]|[Bb][àÀaA][iI]|[Qq][uUu][eE][sS][tT][iI][oO][nN]) : Matches "Câu", "Bài", "Question" (case-insensitive).
    // \s*\d+       : Matches optional whitespace, digits (question number).
    // [:.]?        : Matches an optional colon or period after the number.
    const questionStartPattern = /(?:^|\n\s*)([Cc][âĂaA][uUu]|[Bb][àÀaA][iI]|[Qq][uUu][eE][sS][tT][iI][oO][nN])\s*\d+[:.]?/g;

    // Use matchAll to get all occurrences of question starts and their indices.
    const matches = [...rawText.matchAll(questionStartPattern)];

    // 3. If no explicit question patterns are found but content exists, treat as a single question.
    if (matches.length === 0 && rawText.trim() !== '') {
        questions.push(rawText.trim());
        explanations.push('');
        return { questions, explanations };
    } else if (matches.length === 0) { // If no matches and no content
        return { questions: [], explanations: [] };
    }

    // 4. Iterate through the matches to extract each question block.
    for (let i = 0; i < matches.length; i++) {
        const currentMatch = matches[i];
        const startIndex = currentMatch.index;

        // The end index for the current block is the start of the next match,
        // or the end of the entire rawText if it's the last question.
        const endIndex = (i + 1 < matches.length) ? matches[i + 1].index : rawText.length;

        // Extract and trim the raw block of text for the current question.
        let block = rawText.substring(startIndex, endIndex).trim();
        if (!block) continue; // Skip any empty blocks resulting from split

        let questionText = block;
        let explanationText = '';

        // 5. Extract the explanation part (e.g., \begin{loigiai}...\end{loigiai})
        const loigiaiRegex = /\\begin\{loigiai\}([\s\S]*?)\\end\{loigiai\}/i;
        const matchExplanation = questionText.match(loigiaiRegex);

        if (matchExplanation && matchExplanation[1]) {
            explanationText = matchExplanation[1].trim();
            // Remove the explanation part from the question text to get pure question content.
            questionText = questionText.replace(loigiaiRegex, '').trim();
        }

        questions.push(questionText);
        explanations.push(explanationText);
    }
    
    return { questions, explanations };
}


// --- CÁC HÀM XÁC THỰC & QUẢN LÝ TÀI KHOẢN GIÁO VIÊN ---

/**
 * Xử lý đăng nhập của giáo viên: tạo tài khoản mới nếu chưa có, hoặc trả về thông tin hiện có.
 */
exports.onTeacherSignIn = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
  const { uid, email, name } = context.auth.token;
  const userRef = db.collection("users").doc(uid);
  const userDoc = await userRef.get();
  if (!userDoc.exists) {
    const trialEndDate = admin.firestore.Timestamp.fromMillis(Date.now() + 180 * 24 * 60 * 60 * 1000); // 180 days trial
    await userRef.set({ 
      email, 
      name: name || email, 
      role: "teacher", 
      trialEndDate, 
      createdAt: admin.firestore.FieldValue.serverTimestamp(), 
      teacherAlias: null 
    });
    return { trialEndDate: trialEndDate.toDate().toISOString(), teacherAlias: null };
  } else {
    const existingData = userDoc.data();
    // Chuyển đổi trialEndDate từ Date string (legacy) sang Timestamp nếu cần
    if (existingData.trialEndDate && !(existingData.trialEndDate instanceof admin.firestore.Timestamp)) {
        existingData.trialEndDate = admin.firestore.Timestamp.fromDate(new Date(existingData.trialEndDate));
    }
    return existingData;
  }
});

/**
 * Cập nhật mã Alias cho giáo viên.
 */
exports.updateTeacherAlias = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
  const { uid } = context.auth;
  const newAlias = String(data.alias).trim().toLowerCase();

  // Validate Alias format
  if (!newAlias || newAlias.length < 3 || newAlias.length > 20 || !/^[a-z0-9]+$/.test(newAlias)) {
    throw new functions.https.HttpsError("invalid-argument", "Alias phải từ 3-20 ký tự, chỉ chứa chữ và số.");
  }

  // Check if Alias is already taken by another user
  const aliasCheck = await db.collection("users").where("teacherAlias", "==", newAlias).limit(1).get();
  if (!aliasCheck.empty && aliasCheck.docs[0].id !== uid) {
    throw new functions.https.HttpsError("already-exists", "Alias này đã có người dùng khác sử dụng.");
  }

  // Update Alias in Firestore
  await db.collection("users").doc(uid).update({ teacherAlias: newAlias });
  return { success: true, message: "Cập nhật Alias thành công!" };
});

// --- CÁC HÀM QUẢN LÝ DỮ LIỆU (CRUD) ---

/**
 * Lấy toàn bộ dữ liệu đề thi và lớp học của một giáo viên.
 */
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

// --- Quản lý Đề thi ---

/**
 * Thêm một đề thi mới vào Firestore.
 */
exports.addExam = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
    const { examData } = data;
    if (!examData) throw new functions.https.HttpsError("invalid-argument", "Thiếu dữ liệu đề thi.");
    
    const { questions, explanations } = parseExamContent(examData.content);
    
    if (questions.length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "Không tìm thấy câu hỏi nào trong nội dung đề thi. Hãy chắc chắn bạn đã dùng định dạng 'Câu 1:', 'Bài 2:', v.v...");
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

/**
 * Cập nhật một đề thi hiện có.
 */
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

/**
 * Xóa một đề thi.
 */
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

/**
 * Lấy chi tiết một đề thi để chỉnh sửa.
 */
exports.getTeacherFullExam = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
    const { examId } = data;
    if (!examId) throw new functions.https.HttpsError("invalid-argument", "Thiếu ID đề thi.");
    const doc = await db.collection("exams").doc(examId).get();
    if (!doc.exists || doc.data().teacherId !== context.auth.uid) throw new functions.https.HttpsError("permission-denied", "Không có quyền xem đề thi này.");
    return { id: doc.id, ...doc.data() };
});

// --- Quản lý Lớp học ---

/**
 * Thêm một lớp học mới.
 */
exports.addClass = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
  const { classData } = data;
  if (!classData || !classData.name) throw new functions.https.HttpsError("invalid-argument", "Tên lớp không được trống.");
  await db.collection("classes").add({ 
    teacherId: context.auth.uid, 
    name: String(classData.name).trim(), 
    students: Array.isArray(classData.students) ? classData.students.filter(s => s.trim() !== "") : [], 
    createdAt: admin.firestore.FieldValue.serverTimestamp() 
  });
  return { success: true, message: "Đã thêm lớp học thành công!" };
});

/**
 * Cập nhật một lớp học hiện có.
 */
exports.updateClass = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
  const { classId, classData } = data;
  if (!classId || !classData) throw new functions.https.HttpsError("invalid-argument", "Thiếu ID hoặc dữ liệu lớp học.");
  const classRef = db.collection("classes").doc(classId);
  const doc = await classRef.get();
  if (!doc.exists || doc.data().teacherId !== context.auth.uid) throw new functions.https.HttpsError("permission-denied", "Không có quyền sửa lớp học này.");
  await classRef.update({ 
    name: String(classData.name).trim(), 
    students: Array.isArray(classData.students) ? classData.students.filter(s => s.trim() !== "") : [] 
  });
  return { success: true, message: "Đã cập nhật lớp học thành công!" };
});

/**
 * Xóa một lớp học.
 */
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

/**
 * Lấy chi tiết một lớp học để chỉnh sửa.
 */
exports.getTeacherFullClass = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Yêu cầu cần được xác thực.");
  const { classId } = data;
  if (!classId) throw new functions.https.HttpsError("invalid-argument", "Thiếu ID lớp học.");
  const doc = await db.collection("classes").doc(classId).get();
  if (!doc.exists || doc.data().teacherId !== context.auth.uid) throw new functions.https.HttpsError("permission-denied", "Không có quyền xem lớp học này.");
  return { id: doc.id, ...doc.data() };
});

// --- CÁC HÀM DÀNH CHO HỌC SINH ---

/**
 * Lấy danh sách các lớp học và học sinh cho một giáo viên (dựa trên alias).
 */
exports.getClassesForStudent = functions.https.onCall(async (data, context) => {
  const teacherAlias = String(data.teacherAlias).trim().toLowerCase();
  if (!teacherAlias) throw new functions.https.HttpsError("invalid-argument", "Mã giáo viên là bắt buộc.");
  
  const teacherSnapshot = await db.collection("users").where("teacherAlias", "==", teacherAlias).limit(1).get();
  if (teacherSnapshot.empty) throw new functions.https.HttpsError("not-found", "Không tìm thấy giáo viên với Alias này.");
  
  const teacherDoc = teacherSnapshot.docs[0];
  const teacherData = teacherDoc.data();
  // Check trial end date (handles both Timestamp and legacy Date string)
  const trialEndDateMillis = teacherData.trialEndDate?.toMillis ? teacherData.trialEndDate.toMillis() : new Date(teacherData.trialEndDate).getTime();

  if (!teacherData.trialEndDate || trialEndDateMillis < Date.now()) {
    throw new functions.https.HttpsError("permission-denied", "Tài khoản của giáo viên này đã hết hạn dùng thử.");
  }

  const classesSnapshot = await db.collection("classes").where("teacherId", "==", teacherDoc.id).get();
  const classData = {};
  classesSnapshot.forEach((doc) => { classData[doc.data().name] = doc.data().students || []; });
  return classData;
});

/**
 * Tải dữ liệu đề thi cho học sinh.
 */
exports.loadExamForStudent = functions.https.onCall(async (data, context) => {
  const { teacherAlias, examCode } = data;
  if (!teacherAlias || !examCode) throw new functions.https.HttpsError("invalid-argument", "Mã giáo viên và Mã đề là bắt buộc.");
  
  const teacherSnapshot = await db.collection("users").where("teacherAlias", "==", teacherAlias).limit(1).get();
  if (teacherSnapshot.empty) throw new functions.https.HttpsError("not-found", "Không tìm thấy giáo viên.");
  
  const teacherDoc = teacherSnapshot.docs[0];
  const teacherData = teacherDoc.data();

  // Check trial end date
  const trialEndDateMillis = teacherData.trialEndDate?.toMillis ? teacherData.trialEndDate.toMillis() : new Date(teacherData.trialEndDate).getTime();
  if (!teacherData.trialEndDate || trialEndDateMillis < Date.now()) {
    throw new new functions.https.HttpsError("permission-denied", "Tài khoản của giáo viên này đã hết hạn dùng thử."); // Corrected typo here
  }

  const examSnapshot = await db.collection("exams").where("teacherId", "==", teacherDoc.id).where("examCode", "==", examCode).limit(1).get();
  if (examSnapshot.empty) throw new functions.https.HttpsError("not-found", `Không tìm thấy đề thi ${examCode} của giáo viên này.`);
  
  const examData = examSnapshot.docs[0].data();
  const keysArray = Array.isArray(examData.keys) ? examData.keys : [];
  
  // Xác định loại câu hỏi dựa trên định dạng của 'key'
  const questionTypes = keysArray.map(k => {
      if (typeof k !== 'string') return "Invalid"; 
      if (k.length === 1 && "ABCD".includes(k)) return "MC"; // Multiple Choice (e.g., 'A', 'B')
      if (/^[TF]+$/.test(k)) return "TF"; // True/False (e.g., 'T', 'F', 'TTF')
      // Numeric: Stricter check for purely numeric strings (integer or float)
      if (!isNaN(parseFloat(k)) && String(parseFloat(k)) === k.trim()) return "Numeric"; 
      return "Unknown"; // Fallback for unrecognized key formats
  });
  // Calculate count of sub-answers for TF questions (e.g., 'TTF' has 3 sub-answers)
  const tfCounts = keysArray.map(k => (typeof k === 'string' && /^[TF]+$/.test(k)) ? k.length : 0);
  
  return {
    questionTexts: examData.questionTexts || [], 
    timeLimit: examData.timeLimit || 90,
    questionTypes: questionTypes, // Return identified types to frontend for rendering
    tfCounts: tfCounts, // Return TF sub-answer counts
  };
});

/**
 * Nhận bài làm của học sinh, chấm điểm và lưu kết quả.
 */
exports.submitExam = functions.https.onCall(async (data, context) => {
  const { teacherAlias, examCode, studentName, className, answers, isCheating } = data;
  if (!teacherAlias || !examCode || !studentName || !className) {
      throw new functions.https.HttpsError("invalid-argument", "Thiếu thông tin định danh (học sinh, đề thi...).");
  }
  // If not cheating, answers object must be provided
  if (!isCheating && !answers) {
      throw new functions.https.HttpsError("invalid-argument", "Thiếu dữ liệu câu trả lời của bài làm.");
  }

  const teacherSnapshot = await db.collection("users").where("teacherAlias", "==", teacherAlias).limit(1).get();
  if (teacherSnapshot.empty) {
      throw new functions.https.HttpsError("not-found", "Không tìm thấy giáo viên.");
  }
  const teacherDoc = teacherSnapshot.docs[0];

  // Logic xử lý khi phát hiện gian lận (isCheating === true)
  if (isCheating === true) {
    // Save submission with 0 score and isCheating flag
    await db.collection("submissions").add({ 
        teacherId: teacherDoc.id, 
        timestamp: admin.firestore.FieldValue.serverTimestamp(), 
        examCode, 
        studentName, 
        className, 
        score: 0, 
        isCheating: true 
    });
    // Even if cheating, return examData to frontend so it can display questions/explanations/correct answers
    const examSnapshot = await db.collection("exams").where("teacherId", "==", teacherDoc.id).where("examCode", "==", examCode).limit(1).get();
    const examDataFromDb = examSnapshot.empty ? {} : examSnapshot.docs[0].data();
    
    return { 
        score: 0, 
        examData: { 
            questionTexts: examDataFromDb.questionTexts || [], 
            explanations: examDataFromDb.explanations || [],
            keysStr: examDataFromDb.keys || [],
            coreStr: examDataFromDb.cores || []
        }, 
        detailedResults: {} // No detailed results for cheated exam
    };
  }

  // Fetch exam data for grading
  const examSnapshot = await db.collection("exams").where("teacherId", "==", teacherDoc.id).where("examCode", "==", examCode).limit(1).get();
  if (examSnapshot.empty) {
      throw new functions.https.HttpsError("not-found", `Không tìm thấy đề thi ${examCode} để chấm điểm.`);
  }

  const examData = examSnapshot.docs[0].data();
  const { keys, cores, questionTexts, explanations } = examData;
  
  // Basic validation for keys and cores
  if (!Array.isArray(keys) || !Array.isArray(cores) || keys.length !== questionTexts.length) {
      throw new functions.https.HttpsError("internal", "Dữ liệu đề thi bị lỗi: Keys hoặc Cores không hợp lệ (số lượng không khớp).");
  }

  // Re-determine questionTypes for server-side grading robustness
  const questionTypes = keys.map(k => {
      if (typeof k !== 'string') return "Invalid";
      if (k.length === 1 && "ABCD".includes(k)) return "MC";
      if (/^[TF]+$/.test(k)) return "TF";
      if (!isNaN(parseFloat(k)) && String(parseFloat(k)) === k.trim()) return "Numeric";
      return "Unknown";
  });
  
  let totalScore = 0;
  const detailedResults = {}; // Stores details for each question's result

  // Iterate through each question to grade
  keys.forEach((key, i) => {
    let questionScore = 0;
    const type = questionTypes[i];
    // Attempt to parse core value, default to 0 if invalid
    const coreValue = parseFloat(cores[i]) || 0; 
    
    // --- Specific Grading Logic for each question type ---
    if (type === "MC") {
        const userAnswer = answers[`q${i}`];
        if (userAnswer === key) {
            questionScore = coreValue;
        }
        detailedResults[`q${i}`] = { userAnswer: userAnswer || "", correctAnswer: key, scoreEarned: questionScore, type };
    } else if (type === "TF") {
        let countCorrect = 0;
        const userSubAnswers = [];
        // Parse TF core values, allowing for comma-separated scores like "0.1,0.25,0.5,1"
        const tfCoreValues = (cores[i] || "").split(",").map(x => parseFloat(x)).filter(n => !isNaN(n)); 
        
        for (let j = 0; j < key.length; j++) { // Iterate through each T/F sub-answer
            const subAnswer = answers[`q${i}_sub${j}`];
            userSubAnswers.push(subAnswer);
            if (subAnswer === key[j]) { // Check if user's sub-answer matches correct key's sub-answer
                countCorrect++;
            }
        }
        
        // Logic to assign score based on `countCorrect` and `tfCoreValues`
        // If tfCoreValues is "0.1,0.25,0.5,1" for 4 sub-questions:
        // 1 correct => 0.1, 2 correct => 0.25, 3 correct => 0.5, 4 correct => 1.0
        if (countCorrect > 0 && countCorrect <= tfCoreValues.length) {
            questionScore = tfCoreValues[countCorrect - 1]; // Use 0-indexed for array access
        } else if (countCorrect > tfCoreValues.length && tfCoreValues.length > 0) {
            // If more correct sub-answers than defined score tiers, give max tier score
            questionScore = tfCoreValues[tfCoreValues.length - 1];
        } else {
            questionScore = 0; // Default to 0 if no correct sub-answers or no score defined
        }

        detailedResults[`q${i}`] = { userAnswer: userSubAnswers, correctAnswer: key, scoreEarned: questionScore, type };
    } else if (type === "Numeric") {
        const userAnswer = answers[`q${i}`];
        const parsedUserAnswer = parseFloat(userAnswer);
        const parsedCorrectAnswer = parseFloat(key);

        // Compare numeric answers with a small tolerance for floating point precision
        if (!isNaN(parsedUserAnswer) && !isNaN(parsedCorrectAnswer) && Math.abs(parsedUserAnswer - parsedCorrectAnswer) < 1e-9) {
            questionScore = coreValue;
        }
        detailedResults[`q${i}`] = { userAnswer: userAnswer || "", correctAnswer: key, scoreEarned: questionScore, type };
    } else { // Handle 'Unknown' or 'Invalid' types, assign 0 score
        detailedResults[`q${i}`] = { userAnswer: answers[`q${i}`] || "", correctAnswer: key, scoreEarned: 0, type: type };
    }
    totalScore += questionScore;
  });

  // Save submission details to Firestore
  await db.collection("submissions").add({ 
      teacherId: teacherDoc.id, 
      timestamp: admin.firestore.FieldValue.serverTimestamp(), 
      examCode, 
      studentName, 
      className, 
      answers: answers, // Save the raw answers object
      score: parseFloat(totalScore.toFixed(2)), 
      isCheating: false 
  });

  // Return final score, full exam data, and detailed results for frontend display
  return {
    score: parseFloat(totalScore.toFixed(2)),
    examData: { 
      keysStr: keys, // Return original keys for frontend reference
      coreStr: cores, // Return original cores for frontend reference
      questionTexts: questionTexts || [],
      explanations: explanations || [],
      timeLimit: examData.timeLimit,
    },
    detailedResults: detailedResults,
  };
});