/**
 * React Flow's built-in screen-reader and tooltip text (zoom buttons, mini map, keyboard help) in the active language.
 * Passed to every <ReactFlow ariaLabelConfig={…}>.
 */

import type { AriaLabelConfig } from '@xyflow/react';
import { activeLocale } from './locale';

const DIRECTION_VI: Readonly<Record<string, string>> = { up: 'lên', down: 'xuống', left: 'sang trái', right: 'sang phải' };

const VI: Partial<AriaLabelConfig> = {
  'node.a11yDescription.default': 'Nhấn Enter hoặc phím cách để chọn một nút. Nhấn Delete để xóa và Esc để hủy.',
  'node.a11yDescription.keyboardDisabled': 'Nhấn Enter hoặc phím cách để chọn một nút. Sau đó dùng phím mũi tên để di chuyển nó. Nhấn Delete để xóa và Esc để hủy.',
  'node.a11yDescription.ariaLiveMessage': ({ direction, x, y }) => `Đã di chuyển nút đang chọn ${DIRECTION_VI[direction] ?? direction}. Vị trí mới, x: ${x}, y: ${y}`,
  'edge.a11yDescription.default': 'Nhấn Enter hoặc phím cách để chọn một cạnh. Sau đó nhấn Delete để xóa hoặc Esc để hủy.',
  'controls.ariaLabel': 'Bảng điều khiển',
  'controls.zoomIn.ariaLabel': 'Phóng to',
  'controls.zoomOut.ariaLabel': 'Thu nhỏ',
  'controls.fitView.ariaLabel': 'Vừa khung nhìn',
  'controls.interactive.ariaLabel': 'Bật/tắt tương tác',
  'minimap.ariaLabel': 'Bản đồ thu nhỏ',
  'handle.ariaLabel': 'Điểm nối',
};

/** The labels for the active language; English uses React Flow's own defaults. */
export const flowAriaLabels = (): Partial<AriaLabelConfig> => (activeLocale() === 'vi' ? VI : {});
