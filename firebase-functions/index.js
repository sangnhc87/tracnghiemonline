const { onRequest } = require("firebase-functions/v2/https");
const {setGlobalOptions} = require("firebase-functions/v2");
const logger = require("firebase-functions/logger");
const { defineString } = require('firebase-functions/params');
setGlobalOptions({ region: "asia-southeast1" });

const admin = require("firebase-admin");
const axios = require("axios");
const cors = require('cors')({origin: true});
const { GoogleAuth } = require('google-auth-library');
const FormData = require('form-data');

// Khởi tạo Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();
// === ĐỊNH NGHĨA BIẾN MÔI TRƯỜNG Ở ĐÂY ===
const CLOUD_RUN_URL = defineString('CONVERTER_URL'); // Tên biến phải viết hoa
const FLYIO_URL = defineString('FLYIO_URL');
// Thay thế hàm cũ bằng hàm onRequest này
exports.getListOfBankFiles = onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            // 1. Tự xác thực token
            if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
                throw new Error('Missing Authorization Token');
            }
            const idToken = req.headers.authorization.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const uid = decodedToken.uid; // Lấy uid từ token

            // 2. Logic chính của hàm (giữ nguyên)
            const backupFolderPath = `question_bank_backups/${uid}/`;
            const [files] = await storage.bucket().getFiles({ prefix: backupFolderPath });

            if (files.length === 0) {
                // Trả về thành công với mảng rỗng
                return res.status(200).json({ data: { files: [] } });
            }

            const signedUrlPromises = files.map(file => {
                if (file.name.endsWith('/')) return null;
                return file.getSignedUrl({
                    action: 'read',
                    expires: Date.now() + 10 * 60 * 1000,
                }).then(([url]) => ({ name: file.name, url }));
            });

            const results = (await Promise.all(signedUrlPromises)).filter(Boolean);
            console.log(`User ${uid}: Tìm thấy ${results.length} file ngân hàng.`);
            
            // 3. Trả về kết quả thành công
            res.status(200).json({ data: { files: results } });

        } catch (error) {
            console.error("Lỗi trong getListOfBankFiles:", error);
            res.status(401).json({ error: { message: error.message || "Không thể lấy danh sách file." } });
        }
    });
});

// Thay thế hàm cũ bằng hàm onRequest này
exports.consolidateBank = onRequest({ memory: '1GB', timeoutSeconds: 300 }, async (req, res) => {
    cors(req, res, async () => {
        try {
            // 1. Tự xác thực token
            if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
                throw new Error('Missing Authorization Token');
            }
            const idToken = req.headers.authorization.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const uid = decodedToken.uid; // Lấy uid từ token

            // 2. Lấy dữ liệu từ body
            const { consolidatedContent } = req.body.data;
            if (!consolidatedContent) {
                throw new Error("Thiếu nội dung tổng hợp.");
            }
            
            // 3. Logic chính của hàm (giữ nguyên)
            const backupFolderPath = `question_bank_backups/${uid}/`;
            const consolidatedFilePath = `${backupFolderPath}bank_consolidated_${Date.now()}.json`;

            console.log(`User ${uid}: Bắt đầu hợp nhất. Đang xóa các file cũ trong ${backupFolderPath}...`);
            await storage.bucket().deleteFiles({ prefix: backupFolderPath });
            console.log(`User ${uid}: Đã xóa xong các file cũ.`);

            console.log(`User ${uid}: Đang upload file tổng hợp mới: ${consolidatedFilePath}`);
            const file = storage.bucket().file(consolidatedFilePath);
            await file.save(consolidatedContent, { contentType: 'application/json; charset=utf-8' });
            console.log(`User ${uid}: Upload file tổng hợp thành công.`);

            // 4. Trả về kết quả thành công
            res.status(200).json({ data: { success: true, message: "Đã hợp nhất và cập nhật ngân hàng câu hỏi thành công!" } });

        } catch (error) {
            console.error("Lỗi trong consolidateBank:", error);
            res.status(400).json({ error: { message: error.message || "Lỗi máy chủ khi hợp nhất." } });
        }
    });
});

// =====================================================================
// ==   PHIÊN BẢN CUỐI CÙNG - CHUYỂN SANG onRequest ĐỂ SỬA LỖI 401   ==
// =====================================================================
exports.handleTeacherLogin = onRequest(async (req, res) => {
    // Luôn dùng cors cho hàm onRequest
    cors(req, res, async () => {
        try {
            // 1. Tự tay xác thực token từ header (giống hệt hàm testAuth)
            if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
                throw new Error('Missing Authorization Token');
            }
            const idToken = req.headers.authorization.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            
            // 2. Lấy thông tin người dùng từ token đã được xác thực
            const { uid, email, name } = decodedToken;

            // 3. Thực hiện logic chính của bạn (copy từ hàm cũ)
            const userRef = db.collection("users").doc(uid);
            const userDoc = await userRef.get();

            let userProfile;
            if (!userDoc.exists) {
                const trialEndDate = admin.firestore.Timestamp.fromMillis(Date.now() + 180 * 24 * 60 * 60 * 1000);
                userProfile = {
                    email, name: name || email, role: "teacher",
                    trialEndDate, createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    teacherAlias: null
                };
                await userRef.set(userProfile);
            } else {
                userProfile = userDoc.data();
            }

  
            res.status(200).json({ data: userProfile });

        } catch (error) {
            console.error("Lỗi trong handleTeacherLogin:", error.message);
            // Gửi về lỗi theo định dạng mà client `httpsCallable` có thể hiểu
            res.status(401).json({
                error: {
                    message: error.message,
                    code: 'unauthenticated'
                }
            });
        }
    });
});

exports.updateTeacherAlias = onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            // 1. Tự xác thực token
            if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
                throw new Error('Missing Authorization Token');
            }
            const idToken = req.headers.authorization.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const uid = decodedToken.uid; // Lấy uid từ token
            
            // 2. Lấy dữ liệu từ body (thay vì data)
            const newAlias = String(req.body.data.alias || "").trim().toLowerCase();

            // 3. Logic chính (giữ nguyên, chỉ thay context.auth.token.uid bằng uid)
            if (!newAlias || newAlias.length < 3 || newAlias.length > 20 || !/^[a-z0-9]+$/.test(newAlias)) {
                throw new HttpsError("invalid-argument", "Alias phải từ 3-20 ký tự, chỉ chứa chữ thường và số.");
            }
            const aliasCheck = await db.collection("users").where("teacherAlias", "==", newAlias).limit(1).get();
            if (!aliasCheck.empty && aliasCheck.docs[0].id !== uid) {
                throw new HttpsError("already-exists", "Alias này đã có người dùng khác sử dụng.");
            }
            await db.collection("users").doc(uid).update({ teacherAlias: newAlias });

            // 4. Trả về kết quả
            res.status(200).json({ data: { success: true, message: "Cập nhật Alias thành công!" } });
        } catch (error) {
            console.error("Lỗi trong updateTeacherAlias:", error);
            res.status(401).json({ error: { message: error.message } });
        }
    });
});

exports.addExam = onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            // 1. Tự xác thực token
            if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) throw new Error('Missing Auth Token');
            const idToken = req.headers.authorization.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const uid = decodedToken.uid;

            // 2. Lấy dữ liệu từ body
            const { examData } = req.body.data;
            if (!examData || !examData.examCode || !examData.keys) {
                // Ném lỗi và khối catch sẽ xử lý
                throw new Error("Thiếu Mã đề hoặc Đáp án."); 
            }

            // 3. Logic chính (thay context.auth.uid bằng uid)
            const newExam = {
                teacherId: uid,
                examType: examData.examType || 'TEXT',
                examCode: String(examData.examCode).trim(),
                timeLimit: parseInt(examData.timeLimit, 10) || 90,
                keys: String(examData.keys).split("|").map(k => k.trim()),
                cores: String(examData.cores || "").split("|").map(c => parseFloat(c.trim()) || 0.2),
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            };
            if (newExam.examType === 'TEXT') { /* ... */ } 
            else if (newExam.examType === 'PDF') { /* ... */ }
            await db.collection("exams").add(newExam);

            // 4. Trả về thành công
            res.status(200).json({ data: { success: true, message: "Đã thêm đề thi thành công!" } });

        } catch (error) {
            console.error("Lỗi trong addExam:", error);
            res.status(400).json({ error: { message: error.message || "Yêu cầu không hợp lệ." } });
        }
    });
});
// Thay thế hàm cũ bằng hàm onRequest này
exports.updateExam = onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            // 1. Tự xác thực token
            if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
                throw new Error('Missing Authorization Token');
            }
            const idToken = req.headers.authorization.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const uid = decodedToken.uid;

            // 2. Lấy dữ liệu từ body
            const { examId, examData } = req.body.data;
            if (!examId || !examData) {
                throw new Error("Thiếu ID hoặc dữ liệu đề thi.");
            }

            // 3. Logic chính của hàm (thay context.auth.uid bằng uid)
            const examRef = db.collection("exams").doc(examId);
            const doc = await examRef.get();
            if (!doc.exists || doc.data().teacherId !== uid) {
                throw new Error("Bạn không có quyền sửa đề thi này.");
            }

            const updatedExam = {
                examType: examData.examType || 'TEXT',
                examCode: String(examData.examCode).trim(),
                timeLimit: parseInt(examData.timeLimit, 10) || 90,
                keys: String(examData.keys).split("|").map(k => k.trim()),
                cores: String(examData.cores || "").split("|").map(c => parseFloat(c.trim()) || 0.2),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };

            if (updatedExam.examType === 'TEXT') {
                updatedExam.content = examData.content || '';
                updatedExam.examPdfUrl = admin.firestore.FieldValue.delete();
                updatedExam.solutionPdfUrl = admin.firestore.FieldValue.delete();
            } else if (updatedExam.examType === 'PDF') {
                if (!updatedExam.examCode.toUpperCase().startsWith('PDF-')) {
                    throw new Error("Mã đề PDF phải bắt đầu bằng 'PDF-'.");
                }
                updatedExam.examPdfUrl = examData.examPdfUrl || '';
                updatedExam.solutionPdfUrl = examData.solutionPdfUrl || '';
                updatedExam.content = admin.firestore.FieldValue.delete();
            }

            await examRef.update(updatedExam);
            
            // 4. Trả về kết quả thành công
            res.status(200).json({ data: { success: true, message: "Đã cập nhật đề thi thành công!" } });

        } catch (error) {
            console.error("Lỗi trong updateExam:", error);
            res.status(400).json({ error: { message: error.message || "Yêu cầu không hợp lệ." } });
        }
    });
});
// Thay thế hàm cũ bằng hàm onRequest này
exports.deleteExam = onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            // 1. Tự xác thực token
            if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
                throw new Error('Missing Authorization Token');
            }
            const idToken = req.headers.authorization.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const uid = decodedToken.uid;

            // 2. Lấy dữ liệu từ body
            const { examId } = req.body.data;
            if (!examId) {
                throw new Error("Thiếu ID đề thi.");
            }

            // 3. Logic chính của hàm (thay context.auth.uid bằng uid)
            const examRef = db.collection("exams").doc(examId);
            const doc = await examRef.get();
            if (!doc.exists || doc.data().teacherId !== uid) {
                throw new Error("Không có quyền xóa đề thi này.");
            }
            await examRef.delete();

            // 4. Trả về kết quả thành công
            res.status(200).json({ data: { success: true, message: "Đã xóa đề thi." } });

        } catch (error) {
            console.error("Lỗi trong deleteExam:", error);
            res.status(400).json({ error: { message: error.message || "Yêu cầu không hợp lệ." } });
        }
    });
});
// =================================================================
// ==   SỬA LẠI getTeacherFullData SANG DẠNG onRequest           ==
// =================================================================
exports.getTeacherFullData = onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            // 1. Tự tay xác thực token từ header
            if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
                throw new Error('Missing Authorization Token');
            }
            const idToken = req.headers.authorization.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const uid = decodedToken.uid; // Lấy uid từ token đã xác thực

            // 2. Thực hiện logic chính của bạn
            const examsPromise = db.collection("exams").where("teacherId", "==", uid).get();
            const classesPromise = db.collection("classes").where("teacherId", "==", uid).get();

            const [examsSnapshot, classesSnapshot] = await Promise.all([examsPromise, classesPromise]);
            
            const exams = examsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
            const classes = classesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
            
            // 3. Gửi về kết quả thành công dưới định dạng data
            res.status(200).json({ data: { exams, classes } });

        } catch (error) {
            console.error("Lỗi trong getTeacherFullData:", error.message);
            res.status(401).json({
                error: {
                    message: "Lỗi xác thực hoặc không thể tải dữ liệu.",
                    code: 'unauthenticated'
                }
            });
        }
    });
});
// Thay thế hàm cũ bằng hàm onRequest này
exports.getTeacherFullExam = onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            // 1. Xác thực token
            if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) throw new Error('Missing Auth Token');
            const idToken = req.headers.authorization.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const uid = decodedToken.uid;

            // 2. Lấy dữ liệu từ body
            const { examId } = req.body.data;
            if (!examId) throw new Error("Thiếu ID đề thi.");

            // 3. Logic chính
            const doc = await db.collection("exams").doc(examId).get();
            if (!doc.exists || doc.data().teacherId !== uid) {
                throw new Error("Không có quyền xem đề thi này.");
            }
            
            // 4. Trả về kết quả
            res.status(200).json({ data: { id: doc.id, ...doc.data() } });

        } catch (error) {
            console.error("Lỗi trong getTeacherFullExam:", error);
            res.status(400).json({ error: { message: error.message } });
        }
    });
});
// Thay thế hàm cũ bằng hàm onRequest này
exports.addClass = onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            // 1. Xác thực token
            if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) throw new Error('Missing Auth Token');
            const idToken = req.headers.authorization.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const uid = decodedToken.uid;

            // 2. Lấy dữ liệu từ body
            const { classData } = req.body.data;
            if (!classData || !classData.name) throw new Error("Tên lớp không được trống.");

            // 3. Logic chính
            await db.collection("classes").add({
                teacherId: uid,
                name: String(classData.name).trim(),
                students: Array.isArray(classData.students) ? classData.students.filter(s => s.trim() !== "") : [],
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // 4. Trả về kết quả
            res.status(200).json({ data: { success: true, message: "Đã thêm lớp học thành công!" } });

        } catch (error) {
            console.error("Lỗi trong addClass:", error);
            res.status(400).json({ error: { message: error.message } });
        }
    });
});
// Thay thế hàm cũ bằng hàm onRequest này
exports.updateClass = onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            // 1. Xác thực token
            if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) throw new Error('Missing Auth Token');
            const idToken = req.headers.authorization.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const uid = decodedToken.uid;

            // 2. Lấy dữ liệu từ body
            const { classId, classData } = req.body.data;
            if (!classId || !classData) throw new Error("Thiếu ID hoặc dữ liệu lớp học.");
            
            // 3. Logic chính
            const classRef = db.collection("classes").doc(classId);
            const doc = await classRef.get();
            if (!doc.exists || doc.data().teacherId !== uid) throw new Error("Không có quyền sửa lớp học này.");
            
            await classRef.update({
                name: String(classData.name).trim(),
                students: Array.isArray(classData.students) ? classData.students.filter(s => s.trim() !== "") : []
            });
            
            // 4. Trả về kết quả
            res.status(200).json({ data: { success: true, message: "Đã cập nhật lớp học thành công!" } });

        } catch (error) {
            console.error("Lỗi trong updateClass:", error);
            res.status(400).json({ error: { message: error.message } });
        }
    });
});

// Thay thế hàm cũ bằng hàm onRequest này
exports.deleteClass = onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            // 1. Xác thực token
            if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) throw new Error('Missing Auth Token');
            const idToken = req.headers.authorization.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const uid = decodedToken.uid;

            // 2. Lấy dữ liệu từ body
            const { classId } = req.body.data;
            if (!classId) throw new Error("Thiếu ID lớp học.");

            // 3. Logic chính
            const classRef = db.collection("classes").doc(classId);
            const doc = await classRef.get();
            if (!doc.exists || doc.data().teacherId !== uid) throw new Error("Không có quyền xóa lớp học này.");
            
            await classRef.delete();
            
            // 4. Trả về kết quả
            res.status(200).json({ data: { success: true, message: "Đã xóa lớp học." } });

        } catch (error) {
            console.error("Lỗi trong deleteClass:", error);
            res.status(400).json({ error: { message: error.message } });
        }
    });
});

// Thay thế hàm cũ bằng hàm onRequest này
exports.getTeacherFullClass = onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            // 1. Xác thực token
            if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) throw new Error('Missing Auth Token');
            const idToken = req.headers.authorization.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const uid = decodedToken.uid;

            // 2. Lấy dữ liệu từ body
            const { classId } = req.body.data;
            if (!classId) throw new Error("Thiếu ID lớp học.");

            // 3. Logic chính
            const doc = await db.collection("classes").doc(classId).get();
            if (!doc.exists || doc.data().teacherId !== uid) throw new Error("Không có quyền xem lớp học này.");
            
            // 4. Trả về kết quả
            res.status(200).json({ data: { id: doc.id, ...doc.data() } });
            
        } catch (error) {
            console.error("Lỗi trong getTeacherFullClass:", error);
            res.status(400).json({ error: { message: error.message } });
        }
    });
});
// Thay thế hàm cũ bằng hàm onRequest này
exports.getClassesForStudent = onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            // 1. Lấy dữ liệu từ body
            const teacherAlias = String(req.body.data.teacherAlias || "").trim().toLowerCase();
            if (!teacherAlias) throw new Error("Mã giáo viên là bắt buộc.");
            
            // 2. Logic chính của hàm
            const teacherSnapshot = await db.collection("users").where("teacherAlias", "==", teacherAlias).limit(1).get();
            if (teacherSnapshot.empty) throw new Error("Không tìm thấy giáo viên với Alias này.");
            
            const teacherDoc = teacherSnapshot.docs[0];
            const teacherData = teacherDoc.data();
            const trialEndDateMillis = teacherData.trialEndDate?.toMillis ? teacherData.trialEndDate.toMillis() : new Date(teacherData.trialEndDate).getTime();
            if (!teacherData.trialEndDate || trialEndDateMillis < Date.now()) {
                throw new Error("Tài khoản của giáo viên này đã hết hạn dùng thử.");
            }
            
            const classesSnapshot = await db.collection("classes").where("teacherId", "==", teacherDoc.id).get();
            const classData = {};
            classesSnapshot.forEach((doc) => { classData[doc.data().name] = doc.data().students || []; });

            // 3. Trả về kết quả thành công
            res.status(200).json({ data: classData });

        } catch (error) {
            console.error("Lỗi trong getClassesForStudent:", error);
            res.status(400).json({ error: { message: error.message } });
        }
    });
});

// Thay thế hàm cũ bằng hàm onRequest này
exports.loadExamForStudent = onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            // 1. Lấy dữ liệu từ body
            const { teacherAlias, examCode } = req.body.data;
            if (!teacherAlias || !examCode) throw new Error("Mã giáo viên và Mã đề là bắt buộc.");
            
            // 2. Logic chính của hàm
            const teacherSnapshot = await db.collection("users").where("teacherAlias", "==", teacherAlias).limit(1).get();
            if (teacherSnapshot.empty) throw new Error("Không tìm thấy giáo viên.");
            
            const teacherDoc = teacherSnapshot.docs[0];
            const examSnapshot = await db.collection("exams")
                                         .where("teacherId", "==", teacherDoc.id)
                                         .where("examCode", "==", examCode.trim())
                                         .limit(1).get();
            if (examSnapshot.empty) throw new Error(`Không tìm thấy đề thi ${examCode} của giáo viên này.`);
            
            let examData = examSnapshot.docs[0].data();
            
            if (examData.storageVersion === 2 && examData.contentStoragePath) {
                const file = storage.bucket().file(examData.contentStoragePath);
                const [contentBuffer] = await file.download();
                examData.content = contentBuffer.toString('utf8');
            }

            const resultData = {
                examType: examData.examType || 'TEXT',
                timeLimit: examData.timeLimit || 90,
                keys: examData.keys || [],
                cores: examData.cores || [],
                examPdfUrl: examData.examPdfUrl || null,
                solutionPdfUrl: examData.solutionPdfUrl || null,
                content: examData.content || '',
                storageVersion: examData.storageVersion || 1,
            };

            // 3. Trả về kết quả thành công
            res.status(200).json({ data: resultData });

        } catch (error) {
            console.error("Lỗi trong loadExamForStudent:", error);
            res.status(400).json({ error: { message: error.message } });
        }
    });
});

// Thay thế hàm submitExam cũ bằng phiên bản onRequest này
exports.submitExam = onRequest({ timeoutSeconds: 60, memory: '256MB' }, async (req, res) => {
    cors(req, res, async () => {
        try {
            // ---- 1. LẤY DỮ LIỆU TỪ BODY ----
            const { teacherAlias, examCode, studentName, className, answers, isCheating } = req.body.data;
            if (!teacherAlias || !examCode || !studentName || !className) {
                throw new Error("Thiếu thông tin định danh (giáo viên, mã đề, tên hoặc lớp).");
            }
            if (!isCheating && (answers === undefined || answers === null)) {
                throw new Error("Thiếu dữ liệu câu trả lời.");
            }

            // ---- 2. LẤY DỮ LIỆU TỪ FIRESTORE ----
            const teacherSnapshot = await db.collection("users").where("teacherAlias", "==", teacherAlias).limit(1).get();
            if (teacherSnapshot.empty) {
                throw new Error("Không tìm thấy giáo viên với mã này.");
            }
            const teacherDoc = teacherSnapshot.docs[0];

            const examSnapshot = await db.collection("exams").where("teacherId", "==", teacherDoc.id).where("examCode", "==", examCode.trim()).limit(1).get();
            if (examSnapshot.empty) {
                throw new Error(`Không tìm thấy đề thi '${examCode}' của giáo viên này.`);
            }
            
            let examData = examSnapshot.docs[0].data();
            
            // ---- 3. XỬ LÝ TRƯỜNG HỢP GIAN LẬN ----
            if (isCheating === true) {
                await db.collection("submissions").add({ 
                    teacherId: teacherDoc.id, 
                    timestamp: admin.firestore.FieldValue.serverTimestamp(), 
                    examCode, studentName, className, 
                    score: 0, 
                    answers: {}, 
                    isCheating: true 
                });
                // Trả về kết quả và kết thúc hàm ở đây
                return res.status(200).json({ data: { score: 0, examData, detailedResults: {} } });
            }

            // ---- 4. CHẤM ĐIỂM ----
            const correctKeys = examData.keys || [];
            const cores = examData.cores || [];
            if (correctKeys.length !== cores.length || correctKeys.length === 0) {
                throw new Error("Dữ liệu đề thi bị lỗi: Số lượng đáp án và điểm không khớp hoặc rỗng.");
            }
            
            let totalScore = 0;
            const detailedResults = {};

            for (let i = 0; i < correctKeys.length; i++) {
                const correctAnswer = correctKeys[i];
                const coreValue = parseFloat(cores[i]) || 0;
                const userAnswer = answers[`q${i}`];
                let isCorrect = false;

                if (userAnswer !== undefined && userAnswer !== null) {
                    if (typeof userAnswer === 'string') {
                        if (userAnswer.trim().toLowerCase() === String(correctAnswer).trim().toLowerCase()) isCorrect = true;
                    } else if (typeof userAnswer === 'object' && typeof correctAnswer === 'string') {
                        const sortedUserAnswerKeys = Object.keys(userAnswer).sort();
                        if (sortedUserAnswerKeys.length > 0 && sortedUserAnswerKeys.length === correctAnswer.length) {
                            const constructedAnswerString = sortedUserAnswerKeys.map(key => userAnswer[key]).join('');
                            if (constructedAnswerString.toUpperCase() === correctAnswer.toUpperCase()) isCorrect = true;
                        }
                    }
                }
                
                const questionScore = isCorrect ? coreValue : 0;
                totalScore += questionScore;
                detailedResults[`q${i}`] = { userAnswer: userAnswer || null, correctAnswer, scoreEarned: questionScore };
            }

            const finalScore = parseFloat(totalScore.toFixed(2));
            
            // ---- 5. LƯU BÀI NỘP VÀO DATABASE ----
            await db.collection("submissions").add({ 
                teacherId: teacherDoc.id, 
                timestamp: admin.firestore.FieldValue.serverTimestamp(), 
                examCode, studentName, className, answers,
                score: finalScore,
                detailedResults,
                isCheating: false 
            });

            // ---- 6. TẢI NỘI DUNG ĐỀ THI TỪ STORAGE NẾU CẦN (ĐỂ TRẢ VỀ CHO CLIENT) ----
            if (examData.storageVersion === 2 && examData.contentStoragePath) {
                try {
                    const file = storage.bucket().file(examData.contentStoragePath);
                    const [contentBuffer] = await file.download();
                    examData.content = contentBuffer.toString('utf8');
                } catch (e) {
                    examData.content = `##LỖI## Không thể tải nội dung chi tiết: ${e.message}`;
                }
            }

            // ---- 7. TRẢ VỀ KẾT QUẢ CUỐI CÙNG ----
            const finalResult = { score: finalScore, examData, detailedResults };
            res.status(200).json({ data: finalResult });

        } catch (error) {
            console.error("Lỗi trong submitExam:", error);
            res.status(400).json({ error: { message: error.message } });
        }
    });
});

exports.getPdfFromGitLab = onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            const gitlabUrl = req.body.data.url;
            if (!gitlabUrl || !gitlabUrl.startsWith("https://gitlab.com")) {
                throw new Error("URL không hợp lệ hoặc không phải từ GitLab.");
            }
            const response = await axios.get(gitlabUrl, { responseType: 'arraybuffer' });
            const base64 = Buffer.from(response.data, 'binary').toString('base64');
            res.status(200).json({ data: { base64Data: base64 } });
        } catch (error) {
            console.error("Lỗi khi tải PDF từ GitLab:", error.message);
            res.status(400).json({ error: { message: "Không thể tải file PDF từ GitLab." } });
        }
    });
});
// Thay thế hàm cũ bằng hàm onRequest này
exports.getPdfFromGeneralUrl = onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            // 1. Lấy dữ liệu từ body
            let url = req.body.data.url;
            if (!url) {
                throw new Error("URL không được để trống.");
            }

            // 2. Logic chính của hàm
            if (url.includes("drive.google.com")) {
                const match = url.match(/file\/d\/([^/]+)/);
                if (match && match[1]) {
                    url = `https://drive.google.com/uc?export=download&id=${match[1]}`;
                } else {
                    throw new Error("Định dạng link Google Drive không hợp lệ.");
                }
            } else if (url.includes("dropbox.com")) {
                if (url.includes("?dl=0")) url = url.replace("?dl=0", "?dl=1");
                else if (!url.endsWith("?dl=1")) url += "?dl=1";
            }

            const response = await axios.get(url, { responseType: 'arraybuffer' });
            const base64 = Buffer.from(response.data, 'binary').toString('base64');
            
            // 3. Trả về kết quả
            res.status(200).json({ data: { base64Data: base64 } });

        } catch (error) {
            console.error(`Lỗi khi tải PDF từ URL:`, error.message);
            res.status(400).json({ error: { message: "Không thể tải file PDF từ URL được cung cấp." } });
        }
    });
});
// Thay thế hàm cũ bằng hàm onRequest này
exports.getStatsInitialData = onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            // 1. Tự xác thực token
            if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) throw new Error('Missing Auth Token');
            const idToken = req.headers.authorization.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const teacherId = decodedToken.uid;

            // 2. Logic chính
            const examsPromise = db.collection('exams').where('teacherId', '==', teacherId).select('examCode').get();
            const classesPromise = db.collection('classes').where('teacherId', '==', teacherId).select('name').get();
            
            const [examsSnapshot, classesSnapshot] = await Promise.all([examsPromise, classesPromise]);
            
            const exams = examsSnapshot.docs.map(doc => doc.data());
            const classes = classesSnapshot.docs.map(doc => doc.data());

            // 3. Trả về kết quả
            res.status(200).json({ data: { exams, classes } });

        } catch (error) {
            console.error("Lỗi trong getStatsInitialData:", error);
            res.status(401).json({ error: { message: error.message || "Lỗi xác thực." } });
        }
    });
});

// Thay thế hàm cũ bằng hàm onRequest này
exports.getExamStatistics = onRequest({ timeoutSeconds: 120, memory: '256MB' }, async (req, res) => {
    cors(req, res, async () => {
        try {
            // 1. Tự xác thực token
            if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
                throw new Error('Missing Authorization Token');
            }
            const idToken = req.headers.authorization.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const teacherId = decodedToken.uid;
            
            // 2. Lấy dữ liệu từ body
            const { examCode, className, duplicateHandling } = req.body.data;
            if (!examCode) {
                throw new Error('Mã đề thi là bắt buộc.');
            }
            
            console.log(`Bắt đầu thống kê: Teacher=${teacherId}, Exam=${examCode}, Class=${className}, Handling=${duplicateHandling}`);

            // 3. Logic chính (được copy từ hàm cũ)
            let query = db.collection('submissions').where('teacherId', '==', teacherId).where('examCode', '==', examCode);
            if (className && className !== 'all') {
                query = query.where('className', '==', className);
            }
            
            const snapshot = await query.orderBy('timestamp', 'desc').get();
            // Thay đổi: dùng res.status().json() để trả về và kết thúc hàm
            if (snapshot.empty) return res.status(200).json({ data: { summary: { count: 0 }, filters: req.body.data } });

            const allSubmissions = snapshot.docs.map(doc => doc.data());

            let filteredSubmissions = [];
            if (duplicateHandling === 'all' || !duplicateHandling) {
                filteredSubmissions = allSubmissions;
            } else {
                const studentSubmissionsMap = new Map();
                for (const sub of allSubmissions) {
                    const studentKey = `${sub.studentName || 'N/A'}|${sub.className || 'N/A'}`;
                    const existingSub = studentSubmissionsMap.get(studentKey);
                    if (!existingSub || (duplicateHandling === 'highest' && (sub.score || 0) > (existingSub.score || 0))) {
                        studentSubmissionsMap.set(studentKey, sub);
                    }
                }
                filteredSubmissions = Array.from(studentSubmissionsMap.values());
            }

            if (filteredSubmissions.length === 0) return res.status(200).json({ data: { summary: { count: 0 }, filters: req.body.data } });
            
            const examDocSnapshot = await db.collection('exams').where('teacherId', '==', teacherId).where('examCode', '==', examCode).limit(1).get();
            if (examDocSnapshot.empty) throw new Error(`Không tìm thấy đề thi với mã ${examCode}.`);
            
            const correctKeys = examDocSnapshot.docs[0].data().keys || [];
            let totalScore = 0, highestScore = -1, lowestScore = 11;
            const performanceTiers = { gioi: 0, kha: 0, trungBinh: 0, yeu: 0 };
            const scoreDistribution = { '[0, 2]': 0, '(2, 4]': 0, '(4, 5]': 0, '(5, 6.5]': 0, '(6.5, 8]': 0, '(8, 9]': 0, '(9, 10]': 0 };
            const questionAnalysis = {};
            correctKeys.forEach((key, i) => { questionAnalysis[`q${i}`] = { totalAttempts: 0, correctAttempts: 0, choices: {} }; });

            for (const sub of filteredSubmissions) {
                const score = typeof sub.score === 'number' ? sub.score : 0;
                totalScore += score;
                if (score > highestScore) highestScore = score;
                if (score < lowestScore) lowestScore = score;
                if (score >= 8) performanceTiers.gioi++; else if (score >= 6.5) performanceTiers.kha++; else if (score >= 5.0) performanceTiers.trungBinh++; else performanceTiers.yeu++;
                if (score <= 2) scoreDistribution['[0, 2]']++; else if (score <= 4) scoreDistribution['(2, 4]']++; else if (score <= 5) scoreDistribution['(4, 5]']++; else if (score <= 6.5) scoreDistribution['(5, 6.5]']++; else if (score <= 8) scoreDistribution['(6.5, 8]']++; else if (score <= 9) scoreDistribution['(8, 9]']++; else scoreDistribution['(9, 10]']++;
                for (let i = 0; i < correctKeys.length; i++) {
                    const qKey = `q${i}`;
                    if (!questionAnalysis[qKey]) continue;
                    const userAnswer = (sub.answers && sub.answers[qKey] !== undefined) ? sub.answers[qKey] : null;
                    if (userAnswer !== null) {
                        questionAnalysis[qKey].totalAttempts++;
                        const choice = userAnswer === '' ? 'Bỏ trống' : String(userAnswer);
                        questionAnalysis[qKey].choices[choice] = (questionAnalysis[qKey].choices[choice] || 0) + 1;
                        if ((sub.detailedResults && sub.detailedResults[qKey]?.scoreEarned > 0) || (!sub.detailedResults && String(userAnswer) === String(correctKeys[i]))) {
                            questionAnalysis[qKey].correctAttempts++;
                        }
                    }
                }
            }
            
            const count = filteredSubmissions.length;
            const average = count > 0 ? totalScore / count : 0;
            filteredSubmissions.sort((a, b) => (b.score || 0) - (a.score || 0));

            console.log(`Thống kê thành công cho ${examCode}. Trả về ${count} bản ghi.`);

            // Tạo object kết quả cuối cùng
            const finalResult = {
                summary: { count, average, highest: highestScore, lowest: lowestScore },
                scoreDistribution, 
                performanceTiers, 
                detailedSubmissions: filteredSubmissions,
                questionAnalysis, 
                filters: req.body.data
            };

            // 4. Trả về kết quả
            res.status(200).json({ data: finalResult });

        } catch (error) {
            console.error("Lỗi nghiêm trọng trong getExamStatistics:", error);
            res.status(500).json({ error: { message: 'Đã có lỗi xảy ra trên máy chủ khi xử lý thống kê.' } });
        }
    });
});

// Thay thế hàm cũ bằng hàm onRequest này
exports.addPdfExam = onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) throw new Error('Missing Auth Token');
            const idToken = req.headers.authorization.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const uid = decodedToken.uid;

            const { examData } = req.body.data;
            if (!examData) throw new Error("Thiếu dữ liệu.");
            
            const examCode = String(examData.examCode || "").trim();
            if (!examCode.toUpperCase().startsWith('PDF-')) {
                throw new Error("Mã đề PDF phải bắt đầu bằng 'PDF-'.");
            }

            const newPdfExam = {
                teacherId: uid,
                examType: 'PDF',
                examCode: examCode,
                timeLimit: parseInt(examData.timeLimit, 10) || 90,
                keys: String(examData.keys || "").split("|").map(k => k.trim()),
                cores: String(examData.cores || "").split("|").map(c => c.trim()),
                examPdfUrl: String(examData.examPdfUrl || "").trim(),
                solutionPdfUrl: String(examData.solutionPdfUrl || "").trim(),
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            };
            
            await db.collection("exams").add(newPdfExam);
            res.status(200).json({ data: { success: true, message: "Đã thêm đề thi PDF thành công!" } });
        } catch (error) {
            console.error("Lỗi trong addPdfExam:", error);
            res.status(400).json({ error: { message: error.message } });
        }
    });
});

// Thay thế hàm cũ bằng hàm onRequest này
exports.getPdfExams = onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) throw new Error('Missing Auth Token');
            const idToken = req.headers.authorization.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const uid = decodedToken.uid;
            
            const snapshot = await db.collection("exams")
                                     .where("teacherId", "==", uid)
                                     .where("examType", "==", "PDF")
                                     .orderBy("createdAt", "desc")
                                     .get();
                                     
            const exams = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            res.status(200).json({ data: exams });
        } catch (error) {
            console.error("Lỗi trong getPdfExams:", error);
            res.status(401).json({ error: { message: error.message } });
        }
    });
});

// Thay thế hàm cũ bằng hàm onRequest này
exports.getSinglePdfExam = onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) throw new Error('Missing Auth Token');
            const idToken = req.headers.authorization.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const uid = decodedToken.uid;

            const { examId } = req.body.data;
            if (!examId) throw new Error("Thiếu ID đề thi.");

            const doc = await db.collection("exams").doc(examId).get();
            if (!doc.exists || doc.data().teacherId !== uid) {
                throw new Error("Không có quyền xem đề thi này.");
            }
            res.status(200).json({ data: { id: doc.id, ...doc.data() } });
        } catch (error) {
            console.error("Lỗi trong getSinglePdfExam:", error);
            res.status(401).json({ error: { message: error.message } });
        }
    });
});

// Thay thế hàm cũ bằng hàm onRequest này
exports.updatePdfExam = onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) throw new Error('Missing Auth Token');
            const idToken = req.headers.authorization.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const uid = decodedToken.uid;

            const { examId, examData } = req.body.data;
            if (!examId || !examData) throw new Error("Thiếu ID hoặc dữ liệu đề thi.");

            const examRef = db.collection("exams").doc(examId);
            const doc = await examRef.get();
            if (!doc.exists || doc.data().teacherId !== uid) {
                throw new Error("Bạn không có quyền sửa đề thi này.");
            }

            const examCode = String(examData.examCode || "").trim();
            if (!examCode.toUpperCase().startsWith('PDF-')) {
                throw new Error("Mã đề PDF phải bắt đầu bằng 'PDF-'.");
            }

            const updatedPdfExam = {
                examCode: examCode,
                timeLimit: parseInt(examData.timeLimit, 10) || 90,
                keys: String(examData.keys || "").split("|").map(k => k.trim()),
                cores: String(examData.cores || "").split("|").map(c => c.trim()),
                examPdfUrl: String(examData.examPdfUrl || "").trim(),
                solutionPdfUrl: String(examData.solutionPdfUrl || "").trim(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };

            await examRef.update(updatedPdfExam);
            res.status(200).json({ data: { success: true, message: "Đã cập nhật đề thi PDF thành công!" } });
        } catch (error) {
            console.error("Lỗi trong updatePdfExam:", error);
            res.status(400).json({ error: { message: error.message } });
        }
    });
});

// Thay thế hàm cũ bằng hàm onRequest này
exports.deletePdfExam = onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) throw new Error('Missing Auth Token');
            const idToken = req.headers.authorization.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const uid = decodedToken.uid;

            const { examId } = req.body.data;
            if (!examId) throw new Error("Thiếu ID đề thi.");
            
            const examRef = db.collection("exams").doc(examId);
            const doc = await examRef.get();
            
            if (!doc.exists || doc.data().teacherId !== uid || doc.data().examType !== 'PDF') {
                throw new Error("Không có quyền xóa hoặc đây không phải đề PDF.");
            }

            await examRef.delete();
            res.status(200).json({ data: { success: true, message: "Đã xóa đề thi PDF." } });
        } catch (error) {
            console.error("Lỗi trong deletePdfExam:", error);
            res.status(401).json({ error: { message: error.message } });
        }
    });
});
// Đảm bảo bạn có các dòng này ở đầu file
const { getStorage } = require("firebase-admin/storage");
const storage = getStorage();

// Thay thế hàm cũ bằng hàm onRequest này
exports.addExamWithStorage = onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) throw new Error('Missing Auth Token');
            const idToken = req.headers.authorization.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const uid = decodedToken.uid;

            const { examData } = req.body.data;
            if (!examData || !examData.examCode || !examData.keys || !examData.content) {
                throw new Error("Thiếu dữ liệu (Mã đề, Đáp án, Nội dung).");
            }

            const fileName = `exam_content/${uid}/${examData.examCode.trim()}_${Date.now()}.txt`;
            const file = storage.bucket().file(fileName);
            await file.save(examData.content, { contentType: 'text/plain; charset=utf-8' });

            const newExam = {
                teacherId: uid,
                examType: 'TEXT',
                examCode: String(examData.examCode).trim(),
                timeLimit: parseInt(examData.timeLimit, 10) || 90,
                keys: String(examData.keys).split("|").map(k => k.trim()),
                cores: String(examData.cores || "").split("|").map(c => parseFloat(c.trim()) || 0.2),
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                contentStoragePath: fileName,
                storageVersion: 2
            };

            await db.collection("exams").add(newExam);
            res.status(200).json({ data: { success: true, message: "Đã thêm đề thi và lưu nội dung lên Storage thành công!" } });
        } catch (error) {
            console.error("Lỗi trong addExamWithStorage:", error);
            res.status(400).json({ error: { message: error.message } });
        }
    });
});

// Thay thế hàm cũ bằng hàm onRequest này
exports.updateExamWithStorage = onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) throw new Error('Missing Auth Token');
            const idToken = req.headers.authorization.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const uid = decodedToken.uid;

            const { examId, examData } = req.body.data;
            if (!examId || !examData) throw new Error("Thiếu ID hoặc dữ liệu.");

            const examRef = db.collection("exams").doc(examId);
            const doc = await examRef.get();
            if (!doc.exists || doc.data().teacherId !== uid) {
                throw new Error("Không có quyền sửa đề thi này.");
            }
            const oldExamData = doc.data();

            if (oldExamData.contentStoragePath) {
                try {
                    await storage.bucket().file(oldExamData.contentStoragePath).delete();
                } catch (e) {
                    console.warn(`Không thể xóa file cũ: ${oldExamData.contentStoragePath}`, e.message);
                }
            }

            const fileName = `exam_content/${uid}/${examData.examCode.trim()}_${Date.now()}.txt`;
            const file = storage.bucket().file(fileName);
            await file.save(examData.content, { contentType: 'text/plain; charset=utf-8' });

            const updatedExam = {
                examCode: String(examData.examCode).trim(),
                timeLimit: parseInt(examData.timeLimit, 10) || 90,
                keys: String(examData.keys).split("|").map(k => k.trim()),
                cores: String(examData.cores || "").split("|").map(c => parseFloat(c.trim()) || 0.2),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                contentStoragePath: fileName,
                storageVersion: 2,
                content: admin.firestore.FieldValue.delete(),
            };

            await examRef.update(updatedExam);
            res.status(200).json({ data: { success: true, message: "Đã cập nhật đề thi trên kho của bạn!" } });
        } catch (error) {
            console.error("Lỗi trong updateExamWithStorage:", error);
            res.status(400).json({ error: { message: error.message } });
        }
    });
});

// Thay thế hàm cũ bằng hàm onRequest này
exports.getContentUrl = onRequest({ memory: '256MB' }, async (req, res) => {
    cors(req, res, async () => {
        try {
            if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) throw new Error('Missing Auth Token');
            const idToken = req.headers.authorization.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const uid = decodedToken.uid;

            const { examId } = req.body.data;
            if (!examId) throw new Error("Thiếu ID đề thi.");

            const doc = await db.collection("exams").doc(examId).get();
            if (!doc.exists) throw new Error("Không tìm thấy đề thi.");

            const examData = doc.data();
            if (examData.teacherId !== uid) throw new Error("Bạn không có quyền truy cập nội dung này.");

            const path = examData.contentStoragePath;
            if (!path) throw new Error("Đề thi này không có nội dung trên Storage.");
            
            const file = storage.bucket().file(path);
            const [downloadURL] = await file.getSignedUrl({
                action: 'read',
                expires: Date.now() + 15 * 60 * 1000,
            });

            res.status(200).json({ data: { contentUrl: downloadURL } });

        } catch (error) {
            console.error("Lỗi trong getContentUrl:", error);
            res.status(401).json({ error: { message: error.message || "Lỗi máy chủ khi lấy URL nội dung." } });
        }
    });
});

exports.checkTeacherAccess = onRequest((req, res) => {
    cors(req, res, async () => {
        // Kiểm tra xem người dùng đã đăng nhập chưa bằng cách xác minh ID token từ header
        if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
            console.error('No Firebase ID token was passed as a Bearer token in the Authorization header.');
            res.status(403).send('Unauthorized: Missing authorization token.');
            return;
        }

        let idToken;
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
            idToken = req.headers.authorization.split('Bearer ')[1];
        } else {
            res.status(403).send('Unauthorized: Invalid token format.');
            return;
        }
        
        try {
            // Xác thực token và lấy UID
            const decodedIdToken = await admin.auth().verifyIdToken(idToken);
            const uid = decodedIdToken.uid; 

            // --- Bắt đầu logic chính của hàm (giữ nguyên từ code cũ) ---
            const userRef = db.collection("users").doc(uid);
            const userDoc = await userRef.get();

            if (!userDoc.exists) {
                console.error(`User with UID ${uid} not found in Firestore.`);
                // Dùng res.json để trả về object lỗi cho client dễ xử lý
                res.status(404).json({ error: "Không tìm thấy hồ sơ người dùng." });
                return;
            }

            const userData = userDoc.data();
            const trialEndDate = userData.trialEndDate;

            if (!trialEndDate) {
                // Dùng res.json để client nhận được object
                res.status(200).json({ hasAccess: false, daysRemaining: 0 });
                return;
            }

            const trialEndDateMillis = trialEndDate.toMillis();
            const nowMillis = Date.now();
            const daysRemaining = Math.max(0, Math.ceil((trialEndDateMillis - nowMillis) / (1000 * 60 * 60 * 24)));

            // Trả về kết quả thành công dưới dạng JSON
            res.status(200).json({
                hasAccess: nowMillis < trialEndDateMillis,
                daysRemaining: daysRemaining
            });

        } catch (error) {
            console.error('Error while verifying Firebase ID token or getting user data:', error);
            // Dùng res.json để trả về object lỗi
            res.status(403).json({ error: 'Unauthorized: Invalid token or server error.' });
        }
    });
});




// Thay thế hàm cũ bằng hàm onRequest này
// Thay thế toàn bộ hàm cũ exports.adminGetUsers bằng hàm này
exports.adminGetUsers = onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            // 1. Xác thực token và quyền Admin (Giữ nguyên)
            if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) throw new Error('Missing Auth Token');
            const idToken = req.headers.authorization.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const ADMIN_EMAIL = 'nguyensangnhc@gmail.com'; 
            if (decodedToken.email !== ADMIN_EMAIL) {
                throw new Error("Bạn không có quyền truy cập chức năng này.");
            }

            // 3. Logic chính (SỬA Ở ĐÂY)
            // Sắp xếp theo trường 'createdAt' theo thứ tự giảm dần (mới nhất lên đầu)
            const usersSnapshot = await db.collection("users").orderBy("createdAt", "desc").get();
            
            const users = [];
            usersSnapshot.forEach(doc => {
                const userData = doc.data();
                // Chuyển đổi timestamp thành chuỗi ISO để gửi về client một cách nhất quán
                const trialEndDate = userData.trialEndDate ? userData.trialEndDate.toDate().toISOString() : null;
                const createdAt = userData.createdAt ? userData.createdAt.toDate().toISOString() : null;
                
                users.push({
                    id: doc.id,
                    email: userData.email,
                    name: userData.name,
                    teacherAlias: userData.teacherAlias,
                    trialEndDate: trialEndDate,
                    createdAt: createdAt, // Đảm bảo trường này có trong dữ liệu trả về
                    role: userData.role
                });
            });
            
            // 4. Trả về kết quả
            res.status(200).json({ data: users });

        } catch (error) {
            console.error("Lỗi trong adminGetUsers:", error);
            // Thêm kiểm tra nếu lỗi do không có trường 'createdAt'
            if (error.code === 'failed-precondition') {
                 res.status(400).json({ error: { message: "Lỗi Firestore: Cần tạo index cho trường 'createdAt'. Vui lòng kiểm tra link lỗi trong logs của Firebase Functions để tạo index." } });
            } else {
                 res.status(403).json({ error: { message: error.message || "Không có quyền truy cập." } });
            }
        }
    });
});

// Thay thế hàm cũ bằng hàm onRequest này
exports.adminUpdateUserTrialDate = onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            // 1. Xác thực token
            if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) throw new Error('Missing Auth Token');
            const idToken = req.headers.authorization.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(idToken);

            // 2. Kiểm tra quyền Admin
            const ADMIN_EMAIL = 'nguyensangnhc@gmail.com';
            if (decodedToken.email !== ADMIN_EMAIL) {
                throw new Error("Bạn không có quyền thực hiện chức năng này.");
            }

            // 3. Lấy dữ liệu từ body
            const { userId, newTrialEndDateISO } = req.body.data;
            if (!userId || !newTrialEndDateISO) {
                throw new Error("Thiếu User ID hoặc Ngày hết hạn mới.");
            }

            // 4. Logic chính
            const newDate = new Date(newTrialEndDateISO);
            if (isNaN(newDate.getTime())) {
                throw new Error("Ngày hết hạn không hợp lệ.");
            }
            const newTimestamp = admin.firestore.Timestamp.fromDate(newDate);

            await db.collection("users").doc(userId).update({
                trialEndDate: newTimestamp,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            
            // 5. Trả về kết quả
            res.status(200).json({ data: { success: true, message: "Đã cập nhật ngày hết hạn thành công!" } });

        } catch (error) {
            console.error("Lỗi cập nhật ngày hết hạn:", error);
            res.status(400).json({ error: { message: error.message || `Không thể cập nhật ngày hết hạn.` } });
        }
    });
});
// Thay thế hàm cũ bằng hàm onRequest này
exports.processTikzProxy = onRequest({ timeoutSeconds: 300, memory: '1GB' }, async (req, res) => {
    cors(req, res, async () => {
        try {
            // Lấy dữ liệu từ body
            const { fileContent } = req.body.data;
            if (!fileContent) {
                throw new Error("Thiếu nội dung file TikZ (fileContent).");
            }

            // Lấy biến môi trường (bạn đã định nghĩa ở đầu file)
            const converterUrlValue = CLOUD_RUN_URL.value();
            if (!converterUrlValue) {
                throw new Error("URL dịch vụ chuyển đổi chưa được cấu hình phía server.");
            }
            
            const endpoint = `${converterUrlValue}/process-tex-file`;
            console.log(`Proxying TikZ request to: ${endpoint}`);

            // Logic chính
            const FormData = require('form-data'); // Cần require lại ở đây
            const form = new FormData();
            form.append('file', Buffer.from(fileContent), {
                filename: 'temp_tikz_batch.tex',
                contentType: 'text/plain',
            });
            
            const response = await axios.post(endpoint, form, {
                headers: form.getHeaders(),
                timeout: 290000 
            });

            // Trả về kết quả
            res.status(200).json({ data: response.data });

        } catch (error) {
            console.error("Lỗi khi gọi dịch vụ TikZ Proxy:", error.response ? JSON.stringify(error.response.data) : error.message);
            const errorMessage = error.response?.data?.error || 'Lỗi không xác định khi giao tiếp với dịch vụ xử lý TikZ.';
            res.status(500).json({ error: { message: errorMessage } });
        }
    });
});

// Thay thế hàm cũ bằng hàm onRequest này
exports.processTikzFlyioProxy = onRequest({ timeoutSeconds: 300, memory: '1GB' }, async (req, res) => {
    cors(req, res, async () => {
        try {
            // Lấy dữ liệu từ body
            const { fileContent } = req.body.data;
            if (!fileContent) {
                throw new Error("Thiếu nội dung file TikZ (fileContent).");
            }
            
            // Lấy biến môi trường (bạn đã định nghĩa ở đầu file)
            const flyioUrlValue = FLYIO_URL.value();
            if (!flyioUrlValue) {
                throw new Error("URL dịch vụ Fly.io chưa được cấu hình phía server.");
            }
            
            const endpoint = `${flyioUrlValue}/process-tex-file`;
            console.log(`Proxying TikZ request to Fly.io: ${endpoint}`);

            // Logic chính
            const FormData = require('form-data');
            const form = new FormData();
            form.append('file', Buffer.from(fileContent), {
                filename: 'temp_tikz_batch_flyio.tex',
                contentType: 'text/plain',
            });
            
            const response = await axios.post(endpoint, form, {
                headers: form.getHeaders(),
                timeout: 290000
            });

            // Trả về kết quả
            res.status(200).json({ data: response.data });

        } catch (error) {
            console.error("Lỗi khi gọi dịch vụ TikZ trên Fly.io:", error.response ? JSON.stringify(error.response.data) : error.message);
            const errorMessage = error.response?.data?.error || 'Lỗi không xác định khi giao tiếp với dịch vụ xử lý TikZ trên Fly.io.';
            res.status(500).json({ error: { message: errorMessage } });
        }
    });
});


// Thay thế hàm cũ bằng hàm onRequest này
exports.getBankBackupUrl = onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) throw new Error('Missing Auth Token');
            const idToken = req.headers.authorization.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const uid = decodedToken.uid;
            
            const metaRef = db.collection("userBankMetadata").doc(uid);
            const metaDoc = await metaRef.get();

            if (!metaDoc.exists || !metaDoc.data().backupFilePath) {
                throw new Error("Không tìm thấy bản sao lưu nào trên Cloud.");
            }

            const backupPath = metaDoc.data().backupFilePath;
            const file = storage.bucket().file(backupPath);
            
            const [url] = await file.getSignedUrl({
                action: 'read',
                expires: Date.now() + 5 * 60 * 1000, // URL có hiệu lực 5 phút
            });

            const result = { 
                downloadUrl: url,
                lastModified: metaDoc.data().lastModified 
            };
            
            res.status(200).json({ data: result });

        } catch (error) {
            console.error("Lỗi trong getBankBackupUrl:", error);
            res.status(401).json({ error: { message: error.message } });
        }
    });
});
// Thay thế hàm cũ bằng hàm onRequest này
exports.finalizeBankBackup = onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) throw new Error('Missing Auth Token');
            const idToken = req.headers.authorization.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            const uid = decodedToken.uid;

            const { filePath } = req.body.data;

            if (!filePath || !filePath.startsWith(`question_bank_backups/${uid}/`)) {
                 throw new Error("Đường dẫn file sao lưu không hợp lệ hoặc bạn không có quyền.");
            }

            const metaRef = db.collection("userBankMetadata").doc(uid);
            await metaRef.set({
                teacherId: uid,
                backupFilePath: filePath,
                lastModified: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            res.status(200).json({ data: { success: true, message: "Đã cập nhật thông tin sao lưu." } });

        } catch (error) {
            console.error("Lỗi trong finalizeBankBackup:", error);
            res.status(401).json({ error: { message: error.message } });
        }
    });
});

exports.testAuth = onRequest(async (req, res) => {
    // Luôn dùng cors cho hàm onRequest
    cors(req, res, async () => {
        console.log("Hàm testAuth được gọi, đang kiểm tra header...");

        if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
            console.error('testAuth: Không tìm thấy Bearer token trong header.');
            res.status(403).send({ error: 'Missing authorization token.' });
            return;
        }

        const idToken = req.headers.authorization.split('Bearer ')[1];
        
        try {
            // Đây là bước quan trọng: tự tay xác thực token
            console.log("testAuth: Đang thử xác thực token...");
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            
            // NẾU THÀNH CÔNG, GỬI VỀ UID
            console.log(`testAuth: Token hợp lệ! UID: ${decodedToken.uid}`);
            res.status(200).send({ success: true, uid: decodedToken.uid });

        } catch (error) {
            // NẾU THẤT BẠI, GỬI VỀ LỖI CHI TIẾT
            console.error("testAuth: LỖI XÁC THỰC TOKEN!", error);
            res.status(401).send({ success: false, error: error.message });
        }
    });
});

// Thêm vào cuối file index.js (Cloud Functions)


exports.adminGetTeacherDetails = onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            // 1. Xác thực và kiểm tra quyền Admin
            if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
                throw new Error('Missing Auth Token');
            }
            const idToken = req.headers.authorization.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            if (decodedToken.email !== 'nguyensangnhc@gmail.com') { // Thay email admin của bạn ở đây
                throw new Error("Bạn không có quyền truy cập chức năng này.");
            }

            // 2. Lấy uid của giáo viên từ request
            const { teacherUid } = req.body.data;
            if (!teacherUid) {
                throw new Error("Thiếu UID của giáo viên.");
            }

            // 3. Lấy thông tin cơ bản của giáo viên
            const teacherDoc = await db.collection("users").doc(teacherUid).get();
            if (!teacherDoc.exists) throw new Error("Không tìm thấy giáo viên.");
            const teacherProfile = teacherDoc.data();

            // 4. Lấy tất cả đề thi của giáo viên đó
            const examsSnapshot = await db.collection("exams").where("teacherId", "==", teacherUid).orderBy("createdAt", "desc").get();
            const exams = examsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // 5. Tính toán dung lượng lưu trữ từ các file content
            const contentPrefix = `exam_content/${teacherUid}/`;
            const [contentFiles] = await storage.bucket().getFiles({ prefix: contentPrefix });
            
            let totalSizeBytes = 0;
            contentFiles.forEach(file => {
                totalSizeBytes += parseInt(file.metadata.size, 10);
            });
            const totalSizeMB = (totalSizeBytes / (1024 * 1024)).toFixed(2);

            // 6. Trả về kết quả tổng hợp
            res.status(200).json({ 
                data: {
                    profile: teacherProfile,
                    exams: exams,
                    storageUsage: {
                        totalFiles: contentFiles.length,
                        totalSizeMB: totalSizeMB
                    }
                } 
            });

        } catch (error) {
            console.error("Lỗi trong adminGetTeacherDetails:", error);
            res.status(400).json({ error: { message: error.message } });
        }
    });
});

// Thêm vào cuối file index.js

exports.adminGetExamContent = onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            // 1. Xác thực và kiểm tra quyền Admin
            if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
                throw new Error('Missing Auth Token');
            }
            const idToken = req.headers.authorization.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            if (decodedToken.email !== 'nguyensangnhc@gmail.com') { // Thay email admin của bạn
                throw new Error("Bạn không có quyền truy cập chức năng này.");
            }

            // 2. Lấy examId từ request body
            const { examId } = req.body.data;
            if (!examId) {
                throw new Error("Thiếu ID của đề thi.");
            }

            // 3. Lấy thông tin đề thi từ Firestore
            const examDoc = await db.collection("exams").doc(examId).get();
            if (!examDoc.exists) {
                throw new Error("Không tìm thấy đề thi.");
            }
            const examData = examDoc.data();

            // 4. Kiểm tra xem có đường dẫn file trên Storage không
            const storagePath = examData.contentStoragePath;
            if (!storagePath) {
                throw new Error("Đề thi này không có nội dung được lưu trên Storage.");
            }

            // 5. Đọc file từ Cloud Storage
            const file = storage.bucket().file(storagePath);
            const [contentBuffer] = await file.download();
            const content = contentBuffer.toString('utf8');

            // 6. Trả về nội dung
            res.status(200).json({ data: { content: content } });

        } catch (error) {
            console.error("Lỗi trong adminGetExamContent:", error);
            res.status(400).json({ error: { message: error.message } });
        }
    });
});