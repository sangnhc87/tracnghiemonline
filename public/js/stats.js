// public/js/stats.js
document.addEventListener('DOMContentLoaded', () => {
    // --- KHỞI TẠO ---
    const auth = firebase.auth();
    const functions = firebase.functions();
    let currentStatsData = null; // Biến lưu dữ liệu thống kê hiện tại để xuất Excel
    let scoreChart = null; // Biến lưu biểu đồ để hủy khi vẽ lại

    // --- CÁC ĐỐI TƯỢNG DOM ---
    const getEl = (id) => document.getElementById(id);
    const examFilter = getEl('exam-filter');
    const classFilter = getEl('class-filter');
    const viewBtn = getEl('view-stats-btn');
    const exportBtn = getEl('export-excel-btn');
    const statsContainer = getEl('stats-results-container');
    const statsPlaceholder = getEl('stats-placeholder');
    const loadingOverlay = getEl('loading');

    // --- HÀM TIỆN ÍCH ---
    const showLoading = () => loadingOverlay.style.display = 'flex';
    const hideLoading = () => loadingOverlay.style.display = 'none';

    // --- LOGIC CHÍNH ---

    // 1. Kiểm tra đăng nhập và tải dữ liệu ban đầu (danh sách đề, lớp)
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

            // Đổ dữ liệu vào bộ lọc
            examFilter.innerHTML = '<option value="">-- Chọn một đề thi --</option>';
            exams.forEach(exam => {
                const option = new Option(exam.examCode, exam.examCode);
                examFilter.add(option);
            });

            classFilter.innerHTML = '<option value="all">Tất cả các lớp</option>';
            classes.forEach(cls => {
                const option = new Option(cls.name, cls.name);
                classFilter.add(option);
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

        if (!examCode) {
            Swal.fire("Vui lòng chọn", "Bạn cần chọn một đề thi để xem thống kê.", "info");
            return;
        }

        showLoading();
        try {
            const getStats = functions.httpsCallable('getExamStatistics');
            const result = await getStats({ examCode, className });
            currentStatsData = result.data; // Lưu dữ liệu để xuất Excel
            
            displayStatistics(currentStatsData);
            exportBtn.disabled = false;
        } catch (error) {
            Swal.fire("Lỗi", `Không thể lấy dữ liệu thống kê: ${error.message}`, "error");
            exportBtn.disabled = true;
        } finally {
            hideLoading();
        }
    });

  // XÓA các hàm displayStatistics và renderScoreChart cũ

// THÊM các hàm mới này vào file stats.js

// Hàm 3a: Hàm hiển thị dữ liệu thống kê (đã được cập nhật)
function displayStatistics(data) {
    if (data.summary.count === 0) {
        Swal.fire("Không có dữ liệu", "Không tìm thấy bài nộp nào phù hợp với bộ lọc của bạn.", "warning");
        statsContainer.style.display = 'none';
        statsPlaceholder.style.display = 'block';
        return;
    }

    statsPlaceholder.style.display = 'none';
    statsContainer.style.display = 'flex';

    // Hiển thị phần tổng quan (giữ nguyên)
    getEl('summary-submissions').textContent = data.summary.count;
    getEl('summary-avg-score').textContent = data.summary.average.toFixed(2);
    getEl('summary-max-score').textContent = data.summary.highest.toFixed(2);
    getEl('summary-min-score').textContent = data.summary.lowest.toFixed(2);

    // Vẽ 2 biểu đồ mới
    renderPerformanceDoughnutChart(data.performanceTiers, data.summary.count);
    renderScoreBarChart(data.scoreDistribution);

    // Hiển thị bảng chi tiết (giữ nguyên)
    renderSubmissionsTable(data.detailedSubmissions);
}

// Hàm 3b: Vẽ biểu đồ tròn phân loại
let doughnutChart = null;
function renderPerformanceDoughnutChart(tiers, totalSubmissions) {
    const ctx = getEl('performance-doughnut-chart').getContext('2d');
    if (doughnutChart) doughnutChart.destroy();

    doughnutChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Giỏi (>=8)', 'Khá ([6.5, 8))', 'Trung bình ([5, 6.5))', 'Yếu (<5)'],
            datasets: [{
                label: 'Số lượng',
                data: [tiers.gioi, tiers.kha, tiers.trungBinh, tiers.yeu],
                backgroundColor: [
                    '#42a5f5', // Blue (Giỏi)
                    '#66bb6a', // Green (Khá)
                    '#ffa726', // Orange (Trung bình)
                    '#ef5350'  // Red (Yếu)
                ],
                borderColor: '#fff',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.raw;
                            const percentage = totalSubmissions > 0 ? (value / totalSubmissions * 100).toFixed(1) : 0;
                            return `${label}: ${value} HS (${percentage}%)`;
                        }
                    }
                },
                datalabels: {
                    formatter: (value, context) => {
                        if (value === 0) return '';
                        const percentage = totalSubmissions > 0 ? (value / totalSubmissions * 100).toFixed(1) : 0;
                        return `${percentage}%`;
                    },
                    color: '#fff',
                    font: {
                        weight: 'bold',
                        size: 14
                    }
                }
            }
        },
        plugins: [ChartDataLabels] // Kích hoạt plugin
    });
}

// Hàm 3c: Vẽ biểu đồ cột phổ điểm
let barChart = null;
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
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }, // Ẩn chú thích vì đã có tiêu đề
                datalabels: {
                    anchor: 'end',
                    align: 'end',
                    formatter: (value) => value > 0 ? value : '',
                    color: '#555'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        },
        plugins: [ChartDataLabels]
    });
}
    
    // 5. Hàm render bảng dữ liệu
    function renderSubmissionsTable(submissions) {
        const tableBody = getEl('submissions-table-body');
        tableBody.innerHTML = '';
        submissions.forEach((sub, index) => {
            const row = tableBody.insertRow();
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${sub.studentName}</td>
                <td>${sub.className}</td>
                <td>${sub.score.toFixed(2)}</td>
                <td>${new Date(sub.timestamp._seconds * 1000).toLocaleString('vi-VN')}</td>
            `;
        });
    }

    // 6. Gán sự kiện cho nút "Xuất Excel"
    exportBtn.addEventListener('click', () => {
        if (!currentStatsData || currentStatsData.summary.count === 0) {
            Swal.fire("Không có dữ liệu", "Không có dữ liệu để xuất.", "warning");
            return;
        }

        // Tạo một Workbook mới
        const wb = XLSX.utils.book_new();

        // Sheet 1: Tổng quan
        const summaryData = [
            ["Thông số", "Giá trị"],
            ["Đề thi", currentStatsData.filters.examCode],
            ["Lớp", currentStatsData.filters.className === 'all' ? 'Tất cả' : currentStatsData.filters.className],
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
            "Điểm": sub.score.toFixed(2),
            "Thời gian nộp": new Date(sub.timestamp._seconds * 1000).toLocaleString('vi-VN')
        }));
        const ws2 = XLSX.utils.json_to_sheet(detailedData);
        XLSX.utils.book_append_sheet(wb, ws2, "Danh sách chi tiết");

        // Tải file về
        XLSX.writeFile(wb, `ThongKe_${currentStatsData.filters.examCode}.xlsx`);
    });
});