# Nghiên cứu khoa học

Menu **Nghiên cứu khoa học** có số đề tài, số học viên không trùng và bảng thông tin, có cột Ghi chú thay cho Thao tác. Mở form chỉnh sửa bằng tên đề tài (chỉ hiện liên kết khi có quyền). Thanh công cụ chỉ có **Nhập Excel**, cùng kiểu nút và vùng kéo thả ở các mục khác. File mẫu và nút **Nhập thủ công** nằm trong hộp nhập. **Xuất báo cáo → Nghiên cứu khoa học** là nơi xuất Excel; Admin/cán bộ chọn toàn đại đội hoặc lớp chủ đề tài, tài khoản lớp/học viên được khóa phạm vi. Không có nút Tải lại/Thêm đề tài ở góc trên. Hai chỉ số dùng cùng phạm vi với bảng.

## Phạm vi và quyền sửa

- Admin/cán bộ: xem toàn đại đội hoặc lọc ngang theo lớp **chủ đề tài**. Danh sách xếp theo lớp của chủ đề tài, rồi tên đề tài. Cán bộ chỉ xem/xuất.
- Tài khoản lớp: không có thanh chọn lớp; xem đề tài có ít nhất một thành viên lớp mình. Được thêm/sửa thông tin đề tài có chủ đề tài thuộc lớp mình và sửa giải thưởng của đề tài được xem.
- Học viên: chỉ thấy đề tài mình tham gia. Được tạo đề tài do mình làm chủ và chỉnh sửa thông tin đề tài mình làm chủ; không được chuyển chủ đề tài hay sửa giải thưởng. Thành viên khác chỉ xem.
- Giải thưởng: 5 ô tích độc lập: Bằng khen, Giấy khen, Xuất sắc, Giỏi, Khá; tích được ngay trong bảng; chỉ Admin/tài khoản lớp được sửa.

Chủ đề tài phải là một học viên thực hiện. Chọn thành viên từ danh sách học viên hiện có, hỗ trợ nhóm nhiều lớp. Đơn vị học viên là lớp/c460/d4; đơn vị cán bộ hướng dẫn nhập riêng. Điểm TBNH được tính theo tín chỉ trong hai học kỳ của năm học chọn trên đề tài, chỉ dùng môn áp dụng cho lớp; chưa có điểm hiển thị `—`.

## Excel

Tải file mẫu trong **Nghiên cứu khoa học → Nhập Excel**. Mỗi dòng là một đề tài, giữ nguyên tiêu đề:

- Mẫu nhập gồm 6 cột như ảnh: STT, Mã đề tài, Tên đề tài, Mã HV chủ đề tài, Mã HV tham gia (cách nhau bằng ;), Cán bộ hướng dẫn (Họ tên | Đơn vị) (cách nhau bằng dấu ;). STT không dùng để đối chiếu.
- Có thể tự điền Mã đề tài khi thêm mới hoặc để trống để tạo mã. Mã đã có dùng để cập nhật đúng đề tài; không đối chiếu/gộp theo tên. Mã tự nhập có khóa lưu xác định để không tạo trùng khi gửi lại file.
- Thành viên được đối chiếu bằng mã học viên (cột mã nên đặt Text để giữ số 0 đầu). Nhiều mã cách nhau bằng `;`. Mã chủ đề tài luôn được thêm vào thành viên.
- Nhiều cán bộ hướng dẫn phân cách bằng `;`, mỗi người dạng `Họ tên | Đơn vị`; vẫn nhận xuống dòng của mẫu cũ.
- Các cột Mục tiêu, Nội dung nghiên cứu, Sản phẩm dự kiến, Năm học, Giải thưởng, Ghi chú là tùy chọn. Thiếu cột thì giữ thông tin cũ; đề tài mới mặc định Năm 1 nếu không có Năm học. Bản xuất đầy đủ có các cột này để lưu và nhập lại.
- Nhãn giải thưởng cũ (Bằng Khen, Giấy Khen, Loại Xuất sắc/Giỏi/Khá) vẫn được nhận và hiển thị bằng tên mới.
- Kiểm tra tất cả dòng trước khi cho xác nhận nhập. Hủy xem trước không ghi dữ liệu. Giới hạn 10 MB, 200 đề tài/lần.
- Mỗi đề tài là một lần lưu độc lập. Kết quả hiển thị từng dòng; lỗi một dòng không hoàn tác các dòng đã thành công. Sau lỗi chưa xác nhận, tải lại/đối chiếu trước khi nhập lại để tránh thêm trùng.

## Lưu trữ và đồng thời

Sử dụng JSONB trong bảng `unit_settings` hiện có: mỗi đề tài có một bản ghi `unit_id = research-project:<UUID>`, nội dung ở `locks.research_project` và phiên bản ở `locks.revision`. Không thêm cột/bảng, không dùng localStorage làm nguồn dữ liệu, không sửa bản ghi cấu hình `daidoi460` hay khóa điểm. Tải danh sách có phân trang. Không tạo dữ liệu mẫu trên hệ thống thật.

Khi sửa, đọc lại bản ghi rồi kiểm tra revision; PATCH có điều kiện `locks->>revision`. Nếu người khác đã sửa, báo xung đột và giữ form đang nhập. Mất phản hồi ghi không được tự thử lại. Chuyển tài khoản đóng form và xóa phạm vi/dữ liệu hiển thị cũ.

**Giới hạn xác thực kế thừa:** giống các phần khác của website, tài khoản hiện được xác thực phía frontend bằng khóa Supabase công khai. Module kiểm tra phạm vi và quyền trước khi ghi, nhưng đó không phải cưỡng chế quyền ở database khi ai đó gọi REST trực tiếp. Cần Supabase Auth và RLS theo danh tính thật nếu triển khai bảo vệ phía server; không nhận các tên vai trò do client tự gửi là danh tính tin cậy.

## Kiểm chứng

- `npm test`: phạm vi, chủ đề tài, quyền giải thưởng, Excel và tính TBNH.
- `npm run build`: cập nhật import map và đóng gói `dist/`.
- Máy chủ tĩnh cổng 3000; chạy `NODE_PATH=/workspace/onboarding-tools/node_modules node tests/research-browser.cjs`. REST/CDN đều được giả lập, không ghi Supabase thật. Có thể đặt `RESEARCH_TEST_CSS_PATH` tới CSS Tailwind 3.4.17 biên dịch từ cấu hình trong `index.html` để kiểm tra đầy đủ giao diện khi CDN không truy cập được. Kiểm tra các vai trò, nhóm nhiều lớp, nhập tay/tải lại, xung đột phiên sửa, XSS, màn hình nhỏ, Excel thật, hủy nhập, lỗi một dòng và file xuất.
