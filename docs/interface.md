# Giao diện

Giao diện dùng nền trung tính, một màu nhấn và cùng quy tắc cho sidebar, button, form, bảng, nhập Excel, báo cáo và hộp thoại. Tên màn hình xuất hiện một lần trên thanh trên cùng. Hướng dẫn dài được thu gọn để mở khi cần; cảnh báo, lỗi và dữ liệu nghiệp vụ không bị thu gọn.

- Desktop: thu gọn/mở rộng sidebar, tìm kiếm có sẵn của ứng dụng (`Ctrl/Cmd + K`), nút đổi sáng/tối.
- Điện thoại: menu dạng ngăn kéo; khóa tương tác nền, giữ Tab trong menu, hỗ trợ Escape/bấm ngoài để đóng. Bảng rộng cuộn trong vùng bảng.
- Button: màu nhấn cho thao tác chính; nền trung tính cho thao tác phụ; màu đỏ cho thao tác xóa. Focus bàn phím, disabled và busy vẫn hoạt động.
- Animation: chuyển màn hình và mở hộp thoại 180 ms, menu 220 ms; tự tắt khi có `prefers-reduced-motion`.
- Chế độ sáng/tối dùng lựa chọn cá nhân đã có. Đổi giao diện không ghi database, không thay form node hay làm mất dữ liệu đang gõ.

`src/css/interface.css` là lớp quy tắc giao diện chung cuối cùng; sử dụng các biến `--theme-*` để các component cũ cùng nhận màu mới. `src/js/components/interface.js` sắp xếp lại các node giao diện, giữ nguyên ID, event handler, trạng thái nhập, thuật toán và cơ chế phân quyền. Không sở hữu dữ liệu ứng dụng.

Kiểm tra bằng `npm test`, `npm run build` và `tests/interface-browser.cjs` trên máy chủ HTTP cổng 3000. Đặt `UI_TEST_CSS_PATH` tới CSS Tailwind 3.4.17 được biên dịch từ cấu hình trong `index.html` khi CDN không sẵn có. Fixture chặn toàn bộ dịch vụ ngoài và kiểm tra desktop/mobile, đăng nhập, drawer, tìm kiếm, độ tương phản, form đang nhập, giảm chuyển động và không ghi database. `tests/research-browser.cjs` kiểm tra các luồng đề tài, phân quyền và Excel trên giao diện mới.
