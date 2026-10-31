# Nghiên cứu khoa học

Menu **Nghiên cứu khoa học** có số đề tài, số học viên không trùng và bảng thông tin, có cột Ghi chú thay cho Thao tác. Bấm tên đề tài để mở trang chi tiết toàn phần (cả tài khoản chỉ xem). Mỗi dòng có mũi tên xuống và mở/thu gọn nội dung: Mã đề tài, Tên đề tài, Thông tin đề tài, Chủ đề tài, Học viên thực hiện, Cán bộ hướng dẫn, Giải thưởng. Nếu có ghi chú thì hiển thị riêng, không có nút sửa trong cột Ghi chú.

Mỗi mục được phép sửa có nút **Chỉnh sửa** nhỏ khi mở dòng. Thông tin dài được sửa trong hộp lớn giữa màn hình; thông tin cấu trúc cũ được gộp đầy đủ khi mở sửa. Lưu từng mục giữ nguyên các mục còn lại và kiểm tra revision để tránh ghi đè phiên khác. Năm học đề tài không quyết định năm tính điểm của học viên. Học viên không được chuyển chủ đề tài; tài khoản chỉ sửa giải thưởng không được sửa thông tin. Thanh công cụ chỉ có **Nhập Excel**, cùng kiểu nút và vùng kéo thả ở các mục khác. File mẫu và nút **Nhập thủ công** nằm trong hộp nhập. **Xuất báo cáo → Nghiên cứu khoa học** là nơi xuất Excel; Admin/cán bộ chọn toàn đại đội hoặc lớp chủ đề tài, tài khoản lớp/học viên được khóa phạm vi. Không có nút Tải lại/Thêm đề tài ở góc trên. Hai chỉ số dùng cùng phạm vi với bảng.

## Phạm vi và quyền sửa

- Admin/cán bộ: xem toàn đại đội hoặc lọc ngang theo lớp **chủ đề tài**. Danh sách xếp theo lớp của chủ đề tài, rồi tên đề tài. Cán bộ chỉ xem/xuất.
- Tài khoản lớp: không có thanh chọn lớp; xem đề tài có ít nhất một thành viên lớp mình. Được thêm/sửa thông tin đề tài có chủ đề tài thuộc lớp mình và sửa giải thưởng của đề tài được xem.
- Học viên: chỉ thấy đề tài mình tham gia. Được tạo đề tài do mình làm chủ và chỉnh sửa thông tin đề tài mình làm chủ; không được chuyển chủ đề tài hay sửa giải thưởng. Thành viên khác chỉ xem.
- Giải thưởng: 5 ô tích độc lập: Bằng khen, Giấy khen, Xuất sắc, Giỏi, Khá; tích được ngay trong bảng; chỉ Admin/tài khoản lớp được sửa.

Chủ đề tài phải là một học viên thực hiện. Thành viên được thêm bằng ô nhập họ tên/mã và nút **+**, thay cho checkbox, cả khi tạo mới và khi sửa. Trùng tên phải chọn mã/lớp đúng; có thể bỏ thành viên bằng **×**, nhưng không bỏ chủ đề tài khỏi nhóm. Hỗ trợ nhóm nhiều lớp. Có thể tìm chủ đề tài và thành viên theo họ tên (có dấu hoặc không dấu) hoặc mã; tên trùng phải chọn người theo mã và lớp, không chọn ngầm người đầu tiên. Đơn vị học viên là lớp/c460/d4; đơn vị cán bộ hướng dẫn nhập riêng. Điểm TBNH lấy năm học mới nhất có điểm của từng học viên, tính theo tín chỉ trong hai học kỳ của năm đó và chỉ dùng môn áp dụng cho lớp. Điểm 0 vẫn tính; chưa có điểm hiển thị `—`. Năm được ghi cạnh điểm để dễ đối chiếu.

## Excel

Tải file mẫu trong **Nghiên cứu khoa học → Nhập Excel**. Mỗi dòng là một đề tài, giữ nguyên tiêu đề:

- Mẫu nhập gồm 7 cột như ảnh: STT, Mã đề tài, Tên đề tài, Thông tin đề tài, Mã HV / Họ tên chủ đề tài, Mã HV / Họ tên tham gia (cách nhau bằng ;), Cán bộ hướng dẫn (Họ tên | Đơn vị) (cách nhau bằng dấu ;). STT không dùng để đối chiếu.
- Có thể tự điền Mã đề tài khi thêm mới hoặc để trống để tạo mã. Mã đã có dùng để cập nhật đúng đề tài; không đối chiếu/gộp theo tên. Mã tự nhập có khóa lưu xác định để không tạo trùng khi gửi lại file.
- Cột chủ đề tài/thành viên nhận **mã hoặc họ tên đầy đủ**; được trộn mã và tên trong cùng file. Nhiều học viên cách nhau bằng `;`. Ưu tiên khớp mã chính xác; nếu dùng tên, so khớp không phân biệt hoa/thường, khoảng trắng và dấu tiếng Việt. Không tìm theo một phần tên. Cột mã nên đặt Text để giữ số 0 đầu. Chủ đề tài luôn được thêm vào thành viên.
- Nếu trùng tên, hộp thoại chỉ rõ dòng, vai trò, tên, mã và lớp của từng ứng viên. Phải chọn từng vị trí trùng rồi mới vào bước xem trước; hủy không ghi dữ liệu. Các tiêu đề mẫu cũ “Mã HV…” vẫn được nhận. Đổi tài khoản đóng và hủy bước lựa chọn còn dở.
- Nhiều cán bộ hướng dẫn phân cách bằng `;`, mỗi người dạng `Họ tên | Đơn vị`; vẫn nhận xuống dòng của mẫu cũ.
- Thông tin đề tài nhận văn bản nhiều dòng, được lưu và hiển thị nguyên nội dung; file mẫu có ví dụ. Các file mẫu cũ không có cột này vẫn nhập được và giữ thông tin đang lưu.
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

Mã đề tài chưa nhập được để trống trong trang chi tiết, ô sửa và Excel mẫu/xuất; không thay bằng mã nội bộ. Bản xuất giữ khóa nhận diện ở cột ẩn để nhập lại đúng đề tài kể cả khi mã hiển thị để trống.
