# Mục tiêu và phạm vi dự án

Tài liệu này ghi lại dự án phục vụ ai, giải quyết vấn đề gì và những chức năng cần duy trì khi phát triển. Nội dung được tổng hợp từ mã nguồn, tài liệu hiện có và các yêu cầu đã trao đổi; khi nghiệp vụ thay đổi, cần cập nhật tài liệu và kiểm tra lại với người sử dụng.

## Dự án là gì?

Đây là website quản lý học viên, kết quả học tập và hồ sơ quân nhân của **Đại đội 460, Tiểu đoàn 4, Học viện Kỹ thuật Quân sự**. Hệ thống tập trung dữ liệu của các lớp OTQS1, OTQS2, TTG1, TTG2 và XMCB, phục vụ theo dõi từ năm học thứ nhất đến năm thứ năm.

Mục đích là giúp đơn vị quản lý thông tin nhất quán, giảm thao tác tổng hợp thủ công, theo dõi kết quả và xuất các danh sách phục vụ công tác quản lý. Học viên có thể theo dõi kết quả và thông tin của chính mình.

## Người sử dụng và phạm vi

| Nhóm | Nhu cầu chính | Phạm vi dự kiến |
| --- | --- | --- |
| Quản trị viên | Quản lý dữ liệu, cấu hình, sổ điểm, danh mục và giám sát thay đổi | Toàn đại đội, theo quyền quản trị |
| Cán bộ đại đội | Theo dõi, thống kê và xuất báo cáo | Toàn đại đội hoặc từng lớp; tài khoản cán bộ chỉ xem và xuất |
| Tài khoản lớp | Quản lý thông tin, điểm và các công việc được giao | Lớp phụ trách, theo quyền tương ứng |
| Học viên | Xem kết quả cá nhân, theo dõi ngoại ngữ và cập nhật thông tin được phép | Thông tin của bản thân |

Quyền cụ thể phải được kiểm tra ở các chức năng và phía dữ liệu. Việc ẩn nút trên giao diện không thay thế kiểm soát truy cập phía máy chủ.

## Những công việc hệ thống hỗ trợ

1. **Tổng quan và báo cáo giao ban:** xem tình hình học lực, tiếng Nga, học viên chưa đạt hoặc còn môn nợ, theo phạm vi tài khoản.
2. **Bảng điểm:** tìm học viên, chọn lớp và năm học, xem hoặc nhập điểm theo quyền; hỗ trợ hệ 10, hệ 4, khóa sổ điểm và nhập Excel.
3. **Hồ sơ quân nhân:** quản lý thông tin nhận dạng, lớp, cấp bậc, chức vụ, liên hệ, quê quán, thân nhân và thông tin chính trị; tìm kiếm, chỉnh sửa, nhập và xuất theo quyền.
4. **Tiếng Nga và tích lũy:** theo dõi trình độ thực tế, chuẩn hiện tại, trạng thái đạt chuẩn, kết quả tích lũy và phiếu điểm. Admin cấu hình chuẩn; các tài khoản được phép cập nhật trình độ trong phạm vi của mình.
5. **Toàn đại đội:** xem kết quả học tập tổng hợp, lọc và đối chiếu theo lớp, năm học và phạm vi được cấp.
6. **Môn học:** quản lý danh mục, mã, tín chỉ, học kỳ và lớp áp dụng; bảo vệ liên kết với điểm đã có khi chỉnh sửa.
7. **Nghiên cứu khoa học:** quản lý đề tài, học viên tham gia, cán bộ hướng dẫn, nội dung và giải thưởng; hỗ trợ nhập/xuất Excel theo quyền.
8. **Xuất báo cáo:** tạo các bảng điểm, danh sách và báo cáo Excel/Word theo biểu mẫu và phạm vi tài khoản, bao gồm danh hiệu, học bổng, dự kiến kết nạp Đảng và tranh thủ.
9. **Nhật ký:** ghi nhận và tra cứu thay đổi, tài khoản thực hiện, thời gian và giá trị trước/sau; thao tác quản trị dữ liệu phải theo quyền và có xác nhận.
10. **Cài đặt và đồng bộ:** sử dụng giao diện sáng/tối, kết nối dữ liệu và các thiết lập được cấp quyền.

## Các quy tắc cần giữ khi thay đổi sản phẩm

- Điểm trung bình và xếp loại phải dùng đúng quy tắc, tín chỉ, phạm vi lớp và thời kỳ áp dụng. Điểm chưa nhập không được tự biến thành điểm 0; điểm 0 đã nhập phải được giữ đúng.
- Học bổng xét **học kỳ gần nhất có điểm**, danh hiệu học viên xét **năm học gần nhất có điểm**; xét theo các môn đã có điểm trong kỳ hoặc năm tương ứng, kể cả khi chưa đủ điểm. Không xét vận dụng danh hiệu.
- Với hai danh sách trên, môn có tín chỉ đã có điểm phải đạt từ 7,0; môn 0 tín chỉ đã có điểm phải qua môn; học viên phải đạt chuẩn tiếng Nga hiện tại. Danh hiệu học tốt yêu cầu điểm trung bình năm từ 7,0. Các mức cụ thể và công thức được quy định trong mã nghiệp vụ và tài liệu hiện hành.
- Kết quả dự kiến trên hồ sơ cá nhân phải thể hiện tính tạm thời khi còn điểm chưa biết; không tự ghi nhận thành danh hiệu chính thức.
- Danh sách dự kiến kết nạp Đảng yêu cầu đã học cảm tình Đảng, đạt chuẩn tiếng Nga và đáp ứng ngưỡng hệ 4 do người xuất nhập. Xét từng học kỳ đã đủ điểm trong các năm được chọn; kỳ chưa đủ điểm để trống. File Word giữ chỗ trống cho ngày, tháng, năm và đợt.
- Danh sách tranh thủ chia miền theo quê quán: Hà Tĩnh trở ra là Bắc, Quảng Trị trở vào là Nam. Thời gian về và lên được nhập trên web theo giờ 24 giờ; có thể tải từng miền liên tiếp. Trường hợp chưa xác định được miền cần được thông báo, không tự đoán.
- Báo cáo và dữ liệu phải tuân theo phạm vi tài khoản: Admin/cán bộ toàn đại đội, tài khoản lớp trong lớp phụ trách, học viên trong phạm vi cá nhân theo từng chức năng.
- Không thay đổi hoặc xóa dữ liệu thật, công thức, hợp đồng kết nối và quyền chỉ vì thay đổi giao diện. Thao tác dữ liệu phải xử lý lỗi và không thông báo thành công khi lưu thất bại.

## Định hướng sản phẩm và trải nghiệm

Mục tiêu là một sản phẩm quản lý giáo dục chuyên nghiệp theo hướng **Modern SaaS + Enterprise ERP + Education Management**. Có thể thiết kế lại frontend, bố cục, điều hướng, bảng, biểu mẫu và luồng thao tác để dễ hiểu và ít bước hơn, miễn là dữ liệu, mục đích chức năng và kết quả nghiệp vụ được giữ đúng.

Giao diện cần đồng bộ, tiếng Việt rõ ràng, thích ứng máy tính và điện thoại, có trạng thái tải/trống/lỗi/thành công, hỗ trợ bàn phím và tương phản dễ đọc. Các bảng quản lý Bảng điểm, Hồ sơ quân nhân, Tiếng Nga · Tích lũy và Toàn đại đội hiện được yêu cầu hiển thị trực tiếp trên trang. Mục hồ sơ không cần ô chọn và nút xuất các dòng đã chọn.

**Trạng thái:** việc tái thiết kế và viết lại toàn bộ frontend là mục tiêu đang thực hiện, không nên mặc định đã hoàn tất. Cần tiếp tục kiểm tra từng vai trò, luồng nhập/sửa/xuất và dữ liệu thực tế phù hợp trước khi xác nhận hoàn thành.

## Nền tảng hiện tại

- Frontend sử dụng HTML, CSS và JavaScript ES modules; ứng dụng có thể được phục vụ như website tĩnh.
- Supabase cung cấp phần dữ liệu và đồng bộ; các chức năng xuất Excel/Word được xử lý từ ứng dụng.
- `npm run build` tạo bản dựng và cập nhật phiên bản tài nguyên; `npm test` chạy kiểm thử tự động. Các bài kiểm thử có dữ liệu giả lập không chứng minh đầy đủ quyền và hoạt động trên môi trường thật.
- Tài liệu chi tiết: [README](README.md), [cấu trúc module](docs/module-architecture.md), [nghiên cứu khoa học](docs/research.md), [danh mục môn học](docs/subject-offerings.md) và [nhập Excel](docs/excel-import.md).

### Công nghệ và thư viện đang dùng

| Thành phần | Công nghệ | Vai trò |
| --- | --- | --- |
| Giao diện | HTML5, CSS3, JavaScript thuần với ES modules | Xây dựng trang, tương tác và điều phối các màn hình; hiện không dùng React, Vue hoặc Angular |
| Kiểu dáng | Tailwind CSS 3.4.17 qua CDN và các tệp CSS của dự án | Bố cục, màu sắc, khả năng thích ứng màn hình |
| Dữ liệu và đồng bộ | Supabase JS SDK v2, Supabase/PostgreSQL, Realtime | Đọc, ghi và cập nhật dữ liệu giữa các tài khoản |
| Biểu đồ | Chart.js 4.4.1 | Trực quan hóa số liệu học tập |
| Excel | SheetJS/XLSX 0.18.5 | Nhập và tạo tệp Excel |
| Word | Bộ tạo DOCX trong mã dự án | Tạo danh sách dự kiến kết nạp Đảng |
| Công cụ phát triển | Node.js, npm và script `scripts/build.mjs` | Chạy kiểm thử, tạo bản dựng tĩnh và gắn phiên bản cho tài nguyên |
| Kiểm thử | `node:test`; các bài kiểm thử trình duyệt dùng Playwright/Chromium trong môi trường phát triển | Kiểm tra quy tắc nghiệp vụ và luồng giao diện |
| Triển khai | Website tĩnh; repository có cấu hình Netlify và đang được xuất bản qua GitHub Pages | Phục vụ ứng dụng trên trình duyệt |

Các thư viện giao diện và xuất Excel/Supabase được nạp qua CDN trong `index.html`; `package.json` hiện không khai báo framework frontend hay các thư viện này như dependency npm.
