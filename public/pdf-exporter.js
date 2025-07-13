/**
 * Module xuất PDF chuyên nghiệp - PHIÊN BẢN SỬA LỖI TRANG TRẮNG.
 * Logic: Tạm thời style và chụp phần tử gốc, không nhân bản.
 */

// Hàm chính được export
export async function exportRenderToPdf() {
    if (!window.html2pdf || !window.Swal) {
        alert('Lỗi: Thư viện html2pdf hoặc SweetAlert2 chưa sẵn sàng.');
        return;
    }

    const elementToExport = document.getElementById('render-container');
    const exportSolutionCheckbox = document.getElementById('export-solution-checkbox');
    const shouldExportSolution = exportSolutionCheckbox.checked;

    const options = {
        margin:       [15, 10, 15, 10], // top, left, bottom, right in mm
        filename:     'de-thi-soan-thao.pdf',
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, logging: false },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    showLoading('Đang chuẩn bị tệp PDF...');

    // === LOGIC MỚI ===

    // 1. Thêm tiêu đề tạm thời vào đầu cột render
    const title = document.createElement('div');
    title.className = 'pdf-title';
    title.textContent = 'ĐỀ KIỂM TRA TRẮC NGHIỆM';
    elementToExport.prepend(title);

    // 2. Thêm các class style tạm thời vào phần tử GỐC
    elementToExport.classList.add('exporting-to-pdf');
    if (shouldExportSolution) {
        elementToExport.classList.add('exporting-with-solution');
    } else {
        elementToExport.classList.add('exporting-without-solution');
    }

    try {
        // 3. Chụp ảnh phần tử gốc và tạo PDF
        const worker = html2pdf().from(elementToExport).set(options);
        
        const pdf = await worker.toPdf().get('pdf');
        
        // Thêm số trang
        const totalPages = pdf.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            pdf.setPage(i);
            pdf.setFontSize(10);
            pdf.setTextColor(150);
            pdf.text(
                `Trang ${i} / ${totalPages}`,
                pdf.internal.pageSize.getWidth() / 2,
                pdf.internal.pageSize.getHeight() - 7,
                { align: 'center' }
            );
        }
        
        // Lưu file
        await worker.save();
        Swal.close();

    } catch (error) {
        console.error("PDF Export Error:", error);
        showError('Không thể tạo file PDF. Vui lòng thử lại.');
    } finally {
        // 4. LUÔN LUÔN dọn dẹp và trả lại giao diện như cũ
        elementToExport.classList.remove('exporting-to-pdf', 'exporting-with-solution', 'exporting-without-solution');
        // Xóa tiêu đề đã thêm vào
        if (elementToExport.firstChild && elementToExport.firstChild.classList.contains('pdf-title')) {
            elementToExport.removeChild(elementToExport.firstChild);
        }
    }
}


// Các hàm tiện ích cho SweetAlert2 (không đổi)
function showLoading(title) {
    Swal.fire({
        title: title,
        text: 'Vui lòng chờ trong giây lát.',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });
}

function showError(message) {
    Swal.fire('Lỗi', message, 'error');
}