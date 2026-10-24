import { defineMessages } from '../../utils/i18nHelper';

/** Inspector labels that change with the kind of node: server threads on automated nodes, people on human desks. */
export const nodeMessages = defineMessages('inspectorNode', {
  teamMachine: { en: 'System threads & workers', vi: 'Cụm máy chủ / Tiến trình' },
  teamHuman: { en: 'Assigned personnel', vi: 'Nhân sự vận hành' },
  onDutyMachine: { en: '{n} running', vi: '{n} đang chạy' },
  onDutyHuman: { en: '{n} on duty', vi: '{n} người trực' },
  cluster: { en: 'Gateway Cluster {letter}', vi: 'Cụm Gateway {letter}' },
  thread: { en: 'Server Thread #{n}', vi: 'Luồng máy chủ #{n}' },
  machineRole: { en: 'Automated worker', vi: 'Tiến trình tự động' },

  loadTitle: { en: 'CPU / thread load', vi: 'Mức tải CPU / Luồng' },
  fatigueTitle: { en: 'Fatigue index', vi: 'Mức mệt mỏi' },
  loadIdle: { en: 'Idle', vi: 'Rảnh' },
  loadNormal: { en: 'Normal load', vi: 'Tải bình thường' },
  loadHigh: { en: 'High load', vi: 'Tải cao' },
  loadSaturated: { en: 'Saturated', vi: 'Quá tải' },
  loadPace: { en: 'Throughput', vi: 'Thông lượng' },
  loadPaceOf: { en: 'of full bandwidth', vi: 'băng thông tối đa' },
  loadScaleFresh: { en: 'idle', vi: 'rảnh' },
  loadScaleSlips: { en: 'errors begin at 60', vi: 'lỗi bắt đầu từ 60' },
  loadScaleSpent: { en: 'saturated', vi: 'quá tải' },
  loadSlips: {
    en: 'Under enough load to drop requests: about {pct} in every 100 fail and are retried, which lengthens the queue.',
    vi: 'Tải đủ cao để rớt yêu cầu: khoảng {pct} trên mỗi 100 yêu cầu bị lỗi và phải chạy lại, khiến hàng chờ dài thêm.',
  },
  loadWarm: { en: 'Load is building. Requests only start to fail above 60.', vi: 'Tải đang tăng. Yêu cầu chỉ bắt đầu lỗi khi vượt 60.' },
  loadCool: { en: 'Headroom to spare. Running at full bandwidth.', vi: 'Còn dư năng lực. Đang chạy hết băng thông.' },
  busyMachine: { en: 'System load', vi: 'Tải hệ thống' },
  busyHuman: { en: 'Staff busy', vi: 'Nhân sự bận' },
  deptAvgLoad: { en: 'Avg load', vi: 'Tải TB' },
  deptThreads: { en: 'Threads', vi: 'Luồng' },

  scaleBeginner: { en: 'Spin up Parallel Processing Thread · {cost}/day', vi: 'Mở thêm luồng xử lý song song · {cost}/ngày' },
  scaleAdvanced: { en: 'Enable Load Balancing & Auto-scale Instance · {cost}/day', vi: 'Kích hoạt Cân bằng tải (Load Balancer) & Auto-scale Node · {cost}/ngày' },
  scaleHuman: { en: 'Call Temporary Support Staff · {cost}/day', vi: 'Gọi nhân viên hỗ trợ tạm thời · {cost}/ngày' },
  scaleSelf: { en: 'This machine scales itself: nothing to add', vi: 'Máy này tự mở rộng: không cần thêm' },
  scaleBadge: { en: 'scaled', vi: 'mở rộng' },
});
