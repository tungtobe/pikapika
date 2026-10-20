# Xác minh bản PWA — 2026-10-21

- `npm test`: **5/5 đạt** trên Chrome. Boot Red/Blue tiếng Anh, Red/Blue tiếng Việt, kiểm tra chữ Việt trong bộ nhớ ROM thực, keyboard, gamepad giả lập, save/backup/import/checksum và reload.
- `npm run test:pwa`: **8/8 đạt** trên Chrome và WebKit 27.2 giả lập iPhone 13. Chạy bản production, ngắt mạng rồi boot cả 4 ROM; đóng/mở trang, khôi phục đầy đủ 8 KiB WRAM game; kho save riêng theo browser context; cảm ứng nhiều pointer, hủy chạm, audio context hoạt động, tự lưu/tạm dừng khi chuyển nền; bố cục ngang/dọc; cập nhật service worker chờ người dùng, lưu rồi mới tải lại; trường hợp autoplay bị chặn vẫn mở được game và khôi phục save sau thao tác chạm.
- `npm run package:deploy`: build PWA thành công, precache **32 files / khoảng 7,1 MiB**, kèm 4 ROM và runtime.
- `npm ci` và `npm run build` tại `artifacts/vercel/`: thành công, xác nhận gói source deploy không cần repo ROM bên cạnh hoặc RGBDS.
- Build kiểm tra lại SHA-1 của cả 4 ROM và SHA-256 của 12 file runtime đã ghim; không sửa ROM / gameplay.
- `npm ci`: audit báo **0 vulnerabilities** tại thời điểm kiểm tra.

Kiểm thử dùng context riêng, không đọc hoặc xóa save trong profile trình duyệt của người chơi. WebKit giả lập chưa thay thế kiểm thử trên iPhone / gamepad vật lý. Chưa upload hoặc publish lên tài khoản hosting.

Lỗi môi trường runtime được xử lý: `load_state` của RetroArch là tác vụ bất đồng bộ. Adapter cho core chạy tới khi WRAM thực sự khớp snapshot trước khi báo khôi phục xong hoặc lưu tiếp; vẫn giữ trạng thái tạm dừng nếu người chơi đang tạm dừng. Snapshot chuyển nền được chụp ngay, ghi IndexedDB trước khi chờ đồng bộ battery filesystem.
