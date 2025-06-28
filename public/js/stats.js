// ===================================================================
// ==        JAVASCRIPT CHO TRANG THỐNG KÊ (STATS.JS)             ==
// ==           PHIÊN BẢN CUỐI CÙNG - CẤU TRÚC ĐÚNG              ==
// ===================================================================

document.addEventListener('DOMContentLoaded', () => {
    // --- KHỞI TẠO ---
    const auth = firebase.auth();
    const functions = firebase.functions();
    let currentStatsData = null; // Lưu dữ liệu thống kê hiện tại để xuất Excel
    let doughnutChart = null; // Lưu biểu đồ tròn
    let barChart = null;      // Lưu biểu đồ cột

    // --- CÁC ĐỐI TƯỢNG DOM & HÀM TIỆN ÍCH ---
    const getEl = (id) => document.getElementById(id);

    const examFilter = getEl('exam-filter');
    const classFilter = getEl('class-filter');
    const duplicateHandlingFilter = getEl('duplicate-handling-filter');
    const viewBtn = getEl('view-stats-btn');
    const exportBtn = getEl('export-excel-btn');
    const statsContainer = getEl('stats-results-container');
    const statsPlaceholder = getEl('stats-placeholder');
    const loadingOverlay = getEl('loading');

    const showLoading = () => loadingOverlay.style.display = 'flex';
    const hideLoading = () => loadingOverlay.style.display = 'none';

    // --- LOGIC CHÍNH ---

    // 1. Kiểm tra đăng nhập và tải dữ liệu ban đầu
    auth.onAuthStateChanged(user => {
        if (user) {
            loadInitialData();
        } else {
            Swal.fire("Lỗi", "Bạn cần đăng nhập để xem trang này.", "error")
               .then(() => window.location.href = '/');
        }
    });

    async function loadInitialData() {
        try {
            const getInitialData = functions.httpsCallable('getStatsInitialData');
            const result = await getInitialData();
            const { exams, classes } = result.data;

            examFilter.innerHTML = '<option value="">-- Chọn một đề thi --</option>';
            exams.sort((a,b) => a.examCode.localeCompare(b.examCode)).forEach(exam => {
                examFilter.add(new Option(exam.examCode, exam.examCode));
            });

            classFilter.innerHTML = '<option value="all">Tất cả các lớp</option>';
            classes.sort((a,b) => a.name.localeCompare(b.name)).forEach(cls => {
                classFilter.add(new Option(cls.name, cls.name));
            });
        } catch (error) {
            Swal.fire("Lỗi tải dữ liệu", error.message, "error");
            examFilter.innerHTML = '<option>Lỗi tải danh sách</option>';
        }
    }

    // 2. Gán sự kiện cho nút "Xem Thống kê"
    viewBtn.addEventListener('click', async () => {
        const examCode = examFilter.value;
        const className = classFilter.value;
        const duplicateHandling = duplicateHandlingFilter.value;

        if (!examCode) {
            Swal.fire("Vui lòng chọn", "Bạn cần chọn một đề thi để xem thống kê.", "info");
            return;
        }

        showLoading();
        exportBtn.disabled = true;
        try {
            const getStats = functions.httpsCallable('getExamStatistics');
            const result = await getStats({ examCode, className, duplicateHandling });
            currentStatsData = result.data;
            
            displayStatistics(currentStatsData);
            if (currentStatsData && currentStatsData.summary.count > 0) {
                exportBtn.disabled = false;
            }
        } catch (error) {
            Swal.fire("Lỗi", `Không thể lấy dữ liệu thống kê: ${error.message}`, "error");
            statsContainer.style.display = 'none';
            statsPlaceholder.style.display = 'block';
        } finally {
            hideLoading();
        }
    });

    // 3. Hàm hiển thị tất cả dữ liệu thống kê
    function displayStatistics(data) {
        if (!data || data.summary.count === 0) {
            Swal.fire("Không có dữ liệu", "Không tìm thấy bài nộp nào phù hợp với bộ lọc của bạn.", "warning");
            statsContainer.style.display = 'none';
            statsPlaceholder.style.display = 'block';
            return;
        }

        statsPlaceholder.style.display = 'none';
        statsContainer.style.display = 'flex';

        // Hiển thị phần tổng quan
        getEl('summary-submissions').textContent = data.summary.count;
        getEl('summary-avg-score').textContent = data.summary.average.toFixed(2);
        getEl('summary-max-score').textContent = data.summary.highest.toFixed(2);
        getEl('summary-min-score').textContent = data.summary.lowest.toFixed(2);

        // Vẽ các biểu đồ và bảng
        renderPerformanceDoughnutChart(data.performanceTiers, data.summary.count);
        renderScoreBarChart(data.scoreDistribution);
        renderQuestionAnalysisTable(data.questionAnalysis);
        renderSubmissionsTable(data.detailedSubmissions);
    }

    // 4. Các hàm render giao diện (biểu đồ và bảng)

    function renderPerformanceDoughnutChart(tiers, totalSubmissions) {
        const ctx = getEl('performance-doughnut-chart').getContext('2d');
        if (doughnutChart) doughnutChart.destroy();
        doughnutChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Giỏi (>=8)', 'Khá ([6.5, 8))', 'Trung bình ([5, 6.5))', 'Yếu (<5)'],
                datasets: [{
                    data: [tiers.gioi, tiers.kha, tiers.trungBinh, tiers.yeu],
                    backgroundColor: ['#42a5f5', '#66bb6a', '#ffa726', '#ef5350'],
                    borderColor: '#fff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const percentage = totalSubmissions > 0 ? (context.raw / totalSubmissions * 100).toFixed(1) : 0;
                                return `${context.label}: ${context.raw} HS (${percentage}%)`;
                            }
                        }
                    },
                    datalabels: {
                        formatter: (value, context) => {
                            if (value === 0) return '';
                            const percentage = totalSubmissions > 0 ? (value / totalSubmissions * 100).toFixed(1) : 0;
                            return `${percentage}%`;
                        },
                        color: '#fff', font: { weight: 'bold', size: 14 }
                    }
                }
            },
            plugins: [ChartDataLabels]
        });
    }

    function renderScoreBarChart(distribution) {
        const ctx = getEl('score-bar-chart').getContext('2d');
        if (barChart) barChart.destroy();
        barChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(distribution),
                datasets: [{
                    label: 'Số lượng học sinh',
                    data: Object.values(distribution),
                    backgroundColor: 'rgba(54, 162, 235, 0.6)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    datalabels: {
                        anchor: 'end', align: 'end',
                        formatter: (value) => value > 0 ? value : '',
                        color: '#555'
                    }
                },
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
            },
            plugins: [ChartDataLabels]
        });
    }

    function renderQuestionAnalysisTable(analysisData) {
        const tableBody = getEl('question-analysis-table-body');
        tableBody.innerHTML = '';
        if (!analysisData || Object.keys(analysisData).length === 0) return;

        Object.entries(analysisData).forEach(([qKey, data]) => {
            const questionNumber = parseInt(qKey.replace('q', '')) + 1;
            const correctRate = data.totalAttempts > 0 ? (data.correctAttempts / data.totalAttempts * 100) : 0;
            
            const popularChoices = Object.entries(data.choices)
                .sort((a, b) => b[1] - a[1]).slice(0, 4)
                .map(([choice, count]) => `${choice}: ${count} lượt`).join('<br>');

            const rateColor = correctRate >= 75 ? '#28a745' : correctRate >= 50 ? '#ffc107' : '#dc3545';
            const row = tableBody.insertRow();
            row.innerHTML = `
                <td><strong>${questionNumber}</strong></td>
                <td>${data.totalAttempts}</td>
                <td>${data.correctAttempts}</td>
                <td>
                    <div class="progress-bar-container">
                        <span>${correctRate.toFixed(1)}%</span>
                        <div class="progress-bar">
                            <div class="progress-bar-fill" style="width: ${correctRate}%; background-color: ${rateColor};"></div>
                        </div>
                    </div>
                </td>
                <td>${popularChoices}</td>
            `;
        });
    }
    
    function renderSubmissionsTable(submissions) {
        const tableBody = getEl('submissions-table-body');
        tableBody.innerHTML = '';
        if (!submissions || submissions.length === 0) return;
        
        submissions.forEach((sub, index) => {
            const row = tableBody.insertRow();
            const submissionTime = sub.timestamp?._seconds ? new Date(sub.timestamp._seconds * 1000).toLocaleString('vi-VN') : 'N/A';
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${sub.studentName || 'N/A'}</td>
                <td>${sub.className || 'N/A'}</td>
                <td>${(sub.score || 0).toFixed(2)}</td>
                <td>${submissionTime}</td>
            `;
        });
    }

    // 5. Gán sự kiện cho nút "Xuất Excel"
    exportBtn.addEventListener('click', () => {
        if (!currentStatsData || currentStatsData.summary.count === 0) {
            Swal.fire("Không có dữ liệu", "Không có dữ liệu để xuất.", "warning");
            return;
        }

        const wb = XLSX.utils.book_new();
        const filters = currentStatsData.filters;

        // Sheet 1: Tổng quan
        const summaryData = [
            ["Thông số", "Giá trị"],
            ["Đề thi", filters.examCode],
            ["Lớp", filters.className === 'all' ? 'Tất cả' : filters.className],
            ["Xử lý trùng lặp", filters.duplicateHandling],
            ["Tổng số bài nộp", currentStatsData.summary.count],
            ["Điểm trung bình", currentStatsData.summary.average.toFixed(2)],
            ["Điểm cao nhất", currentStatsData.summary.highest.toFixed(2)],
            ["Điểm thấp nhất", currentStatsData.summary.lowest.toFixed(2)],
        ];
        const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, ws1, "Tổng quan");
        
        // Sheet 2: Danh sách chi tiết
        const detailedData = currentStatsData.detailedSubmissions.map(sub => ({
            "Họ tên": sub.studentName,
            "Lớp": sub.className,
            "Điểm": (sub.score || 0).toFixed(2),
            "Thời gian nộp": sub.timestamp?._seconds ? new Date(sub.timestamp._seconds * 1000).toLocaleString('vi-VN') : 'N/A'
        }));
        const ws2 = XLSX.utils.json_to_sheet(detailedData);
        XLSX.utils.book_append_sheet(wb, ws2, "Danh sách chi tiết");

        // Sheet 3: Phân tích câu hỏi
        if(currentStatsData.questionAnalysis) {
            const analysisSheetData = Object.entries(currentStatsData.questionAnalysis).map(([qKey, data]) => ({
                "Câu": parseInt(qKey.replace('q', '')) + 1,
                "Lượt trả lời": data.totalAttempts,
                "Lượt đúng": data.correctAttempts,
                "Tỷ lệ đúng (%)": (data.totalAttempts > 0 ? (data.correctAttempts / data.totalAttempts * 100) : 0).toFixed(2),
            }));
            const ws3 = XLSX.utils.json_to_sheet(analysisSheetData);
            XLSX.utils.book_append_sheet(wb, ws3, "Phân tích câu hỏi");
        }

        XLSX.writeFile(wb, `ThongKe_${filters.examCode}_${new Date().toISOString().slice(0,10)}.xlsx`);
    });

}); // <-- Dấu đóng của 'DOMContentLoaded'