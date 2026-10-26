# Hệ thống Quản lý Điểm và Hồ sơ Quân nhân Đại đội 460

Dự án Web Application phục vụ công tác quản lý điểm số (theo Năm học từ Năm 1 đến Năm 5), tính điểm tích lũy toàn khóa, quản lý chuẩn ngoại ngữ và hồ sơ trích ngang quân nhân tại **Đại đội 460 - Tiểu đoàn 4 - Học viện Kỹ thuật Quân sự**.

## 1. Hệ thống Tài khoản & Phân quyền (RBAC)

Giao diện đăng nhập được chia thành 4 nhóm tài khoản cố định (đã xóa bỏ hoàn toàn chức năng cấp quyền):

1. **Tài khoản Admin:**
   - Tên đăng nhập: `huudung` | Mật khẩu: `hd304`
   - Quyền hạn: Toàn quyền quản lý hệ thống, cấu hình chuẩn ngoại ngữ, khóa sổ điểm, xem/nhập điểm từng lớp hoặc toàn bộ đại đội.
2. **Tài khoản Cán bộ Đại đội:**
   - Tên đăng nhập: `canbo` | Mật khẩu: `canbon460`
   - Quyền hạn: Toàn quyền quản lý, nhập điểm, cấu hình chuẩn ngoại ngữ, và có tính năng **xem toàn bộ đại đội (tất cả 5 lớp)** hoặc từng lớp riêng lẻ.
3. **5 Tài khoản Lớp (`OTQS1`, `OTQS2`, `TTG1`, `TTG2`, `XMCB`):**
   - Tên đăng nhập: `otqs1`, `otqs2`, `ttg1`, `ttg2`, `xmcb`
   - Mật khẩu theo cấu trúc `[tên_lớp]a@`: `otqs1a@`, `otqs2a@`, `ttg1a@`, `ttg2a@`, `xmcba@`
   - Quyền hạn: Phạm vi dữ liệu bị cô lập tuyệt đối chỉ trong lớp mình phụ trách (chỉ xem và sửa dữ liệu, môn học, trình độ ngoại ngữ của lớp mình).
4. **Tài khoản Học viên:**
   - Đăng nhập bằng **Mã Học Viên** (VD: `HV2022-0101`).
   - Quyền hạn: Chỉ xem bảng điểm cá nhân (cuộn dọc từ Năm 1 đến Năm 5), xuất file cá nhân `Bảng điểm(thông tin cá nhân) - [Họ và tên học viên].xlsx`, và xem/chỉnh sửa trực tiếp Hồ sơ Quân nhân của chính mình (`[ Chỉnh sửa ] / [ Lưu ]`).

## 2. Quản lý Trình độ Ngoại ngữ (Chuẩn đạt & Thực tế)
- **Thiết lập chuẩn ngoại ngữ (Admin & Cán bộ):** Cấu hình trực tiếp chuẩn ngoại ngữ hiện tại phải đạt được theo tiến độ đào tạo (`A1.1`, `A1`, `A2.1`, `A2`, `A2.2`, `B1.1`, `B1`, `B1.2`, `B2`).
- **Cập nhật & Đánh giá trình độ (Admin, Cán bộ & Tài khoản Lớp):** Chọn trình độ ngoại ngữ thực tế mà học viên đã đạt được; hệ thống tự động so sánh với chuẩn hiện tại và hiển thị rõ trạng thái **"Chưa đạt"** nếu học viên chưa đạt chuẩn yêu cầu.

## 3. Cấu trúc thư mục chuẩn Vite + Netlify
```
├── index.html
├── package.json
├── netlify.toml
├── README.md
└── src/
    ├── css/
    │   └── main.css
    └── js/
        ├── grades.js
        ├── auth.js
        ├── students.js
        └── main.js
```
