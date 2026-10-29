# Môn học theo lớp và học kỳ

Không cần đổi schema hoặc chạy migration. Dữ liệu tiếp tục dùng `subjects` và `grades` hiện có.

- TH1: ở học kỳ cần nhập, chọn **Thêm cho cả 5 lớp**. Một môn gắn với cả đơn vị, điểm vẫn tách theo từng học viên.
- TH2: chọn **Thêm theo lớp**, chọn một hoặc nhiều lớp học môn đó trong cùng học kỳ. Lớp khác có thể học môn khác.
- Lớp OTQS1 học Môn A ở HK1, TTG1 học Môn A ở HK2: tạo hai môn ở hai kỳ và chọn lớp tương ứng. Không sửa học kỳ của môn đang có điểm.
- Tên môn giữ nguyên chữ hoa/thường, dấu, số và dấu câu khi hiển thị/xuất Excel. Không tự đổi viết tắt thành tên khác. Tên cũ chỉ được cập nhật khi người dùng lưu sửa môn đó.
- Mã môn được tự tạo nếu để trống. Nếu hai học phần khác nhau trùng tên trong cùng lớp và học kỳ, nhập mã khác nhau. Khi nhập điểm Excel phải dùng mã để phân biệt, hệ thống không chọn bừa môn đầu tiên.

## Giữ dữ liệu cũ

- Không xóa, hợp nhất, đánh lại ID hoặc ghi hàng loạt danh mục khi mở trang. Đổi tên dùng lại ID hiện có; `grades.subject_id` không thay đổi.
- Môn đã có điểm, kể cả điểm 0, không được chuyển kỳ. Chỉ được bỏ lớp khỏi môn khi lớp đó không có điểm của môn; không chuyển hoặc xóa điểm để sửa phạm vi.
- Đổi tín chỉ có thể làm ĐTB tính lại; điểm gốc được giữ nguyên. Form thông báo điều này khi sửa môn có điểm.
- Tài khoản lớp chỉ sửa môn gắn riêng lớp mình; môn dùng chung do Admin chỉnh sửa. Cán bộ chỉ xem.
- Lưu một môn chỉ cập nhật giao diện sau khi database xác nhận thành công. Lưu lỗi giữ nguyên danh mục cục bộ và form để thử lại; ID mới được giữ ổn định trong lần nhập đó.
- Khóa lớp/học kỳ và kiểm tra trùng dựa trên dữ liệu ứng dụng đã tải; đây không phải triển khai Auth/RLS hoặc khóa phiên bản tại server. Hai người thêm đồng thời vẫn có thể tạo bản ghi trùng tên; nhập điểm sẽ dừng khi không xác định duy nhất, thay vì tự gộp hoặc ghi nhầm điểm.

## Nhập điểm Excel

Đối chiếu theo lớp + học kỳ trước, rồi tên/mã. Không tìm sang kỳ khác khi không khớp. Môn chưa có trong danh mục được tạo cho riêng lớp trên dòng Excel, không mặc định gán cho 5 lớp. Các ID mới dùng toàn bộ tên/mã/phạm vi/kỳ để tránh trùng do rút gọn tên dài; ID cũ không được tính lại.

Nên cấu hình đúng danh mục trước khi nhập điểm. Nếu tiêu đề môn chưa có trong danh mục chứa ký hiệu HK/TC có thể là chú thích hoặc một phần tên chính thức, hệ thống yêu cầu tạo danh mục trước, không tự đoán rồi đổi tên. Tên chính thức có ngoặc hoặc dấu gạch ngang vẫn được nhận diện nguyên văn nếu đã có trong danh mục. File cũ dùng mã viết tắt vẫn được đối chiếu trong đúng lớp/kỳ khi khớp duy nhất; không tự đổi tên đã lưu.

Kiểm thử bằng fixture và database giả lập, chưa chạy thay đổi nào trên Supabase thật trong quá trình phát triển.
