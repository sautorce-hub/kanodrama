import React, { useEffect } from 'react';
import {
  ArrowRight,
  CalendarCheck2,
  Clock,
  Coins,
  Gift,
  Play,
  Sparkles,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useDramaContext } from '../context/DramaContext';
import type { LanguageCode } from '../types/drama';

interface GuestInviteCopy {
  dialogLabel: string;
  badge: string;
  title: string;
  subtitleDefault: string;
  subtitleWatch: string;
  subtitleEpisode: string;
  subtitleRewards: string;
  welcomePillLabel: string;
  watchTitle: string;
  watchValue: string;
  watchDesc: string;
  checkinTitle: string;
  checkinValue: string;
  checkinDesc: string;
  referralTitle: string;
  referralValue: string;
  referralDesc: string;
  conversionLabel: string;
  conversionValue: string;
  minPayoutLabel: string;
  minPayoutValue: string;
  timezoneLabel: string;
  timezoneValue: string;
  ctaPrimary: string;
  ctaContinueWatch: string;
  ctaClose: string;
  closeAria: string;
}

const GUEST_INVITE_COPY: Record<LanguageCode, GuestInviteCopy> = {
  id: {
    dialogLabel: 'Masuk untuk Mengumpulkan Poin & Reward KanoDrama',
    badge: 'Hadiah Member Baru',
    title: 'Login & Kumpulkan Poin Nonton',
    subtitleDefault:
      'Masuk dengan Google atau Email untuk mulai mengumpulkan poin dari setiap menit menonton drama.',
    subtitleWatch:
      'Kamu sudah mulai menonton! Masuk sekarang agar menit nontonmu langsung terhitung menjadi poin saldo.',
    subtitleEpisode:
      'Lanjut episode berikutnya sambil kumpulkan poin otomatis & bonus selesai episode.',
    subtitleRewards:
      'Masuk terlebih dahulu untuk klaim check-in harian, bonus milestone, dan penarikan saldo.',
    welcomePillLabel: 'Bonus Login Pertama Akun Baru',
    watchTitle: 'Nonton Aktif & Episode',
    watchValue: '+40 poin/menit',
    watchDesc: 'Milestone 15m/30m/60m (+300/+600/+1.200) & selesai episode +500 poin',
    checkinTitle: 'Check-in & Share Harian',
    checkinValue: '+1.000 s.d. +2.000 poin',
    checkinDesc: 'Check-in H-1 s.d. H-6 (+1.000), H-7 (+2.000) & share sosmed +1.000/hari',
    referralTitle: 'Program Referral',
    referralValue: '+5.000 poin/teman',
    referralDesc: 'Bind referral +200 poin, referral aktif 3.600 detik +5.000 poin & bonus lanjutan',
    conversionLabel: 'Nilai Konversi',
    conversionValue: '100.000 poin = 1 USDT (Rp 18.200)',
    minPayoutLabel: 'Minimum Penarikan',
    minPayoutValue: 'Rp 50.000 / $5.00',
    timezoneLabel: 'Zona Reset Harian',
    timezoneValue: 'Dikunci ke WIB (Reset 00:00 WIB)',
    ctaPrimary: 'Masuk & Klaim +25.000 Poin',
    ctaContinueWatch: 'Lanjutkan Nonton',
    ctaClose: 'Tutup',
    closeAria: 'Tutup popup ajakan login',
  },
  en: {
    dialogLabel: 'Sign In to Earn Points & Rewards on KanoDrama',
    badge: 'New Member Rewards',
    title: 'Sign In & Earn While Watching',
    subtitleDefault:
      'Sign in with Google or Email to turn your drama watch time into withdrawable points.',
    subtitleWatch:
      'You are actively watching! Sign in now so your watch minutes start earning points automatically.',
    subtitleEpisode:
      'Keep watching episodes while unlocking per-minute watch points & episode completion bonuses.',
    subtitleRewards:
      'Sign in to unlock daily check-ins, watch milestones, referral bonuses, and payouts.',
    welcomePillLabel: 'First Sign-In Bonus (New Account)',
    watchTitle: 'Active Watch & Episodes',
    watchValue: '+40 pts/min',
    watchDesc: '15m/30m/60m milestones (+300/+600/+1,200) & episode finish +500 pts',
    checkinTitle: 'Daily Check-in & Share',
    checkinValue: '+1,000 to +2,000 pts',
    checkinDesc: 'Day 1–6 check-in (+1,000), Day 7 (+2,000) & daily social share +1,000 pts',
    referralTitle: 'Referral Rewards',
    referralValue: '+5,000 pts/invite',
    referralDesc: '+200 pts bind bonus, +5,000 pts after 3,600s verified watch & ongoing rewards',
    conversionLabel: 'Conversion Rate',
    conversionValue: '100,000 pts = 1 USDT (IDR ref 18,200)',
    minPayoutLabel: 'Minimum Payout',
    minPayoutValue: '$5.00 / Rp 50,000',
    timezoneLabel: 'Canonical Daily Reset',
    timezoneValue: 'Locked to UTC (Resets 17:00 UTC)',
    ctaPrimary: 'Sign In & Claim +25,000 Pts',
    ctaContinueWatch: 'Continue Watching',
    ctaClose: 'Close',
    closeAria: 'Close login rewards popup',
  },
  cn: {
    dialogLabel: '登录 KanoDrama 赚取积分与奖励',
    badge: '新用户奖励',
    title: '登录即可边看剧边赚积分',
    subtitleDefault: '使用 Google 或邮箱登录，每分钟观剧都能累积可提现积分。',
    subtitleWatch: '您正在观看精彩剧集！立即登录即可自动累计观剧积分。',
    subtitleEpisode: '继续追下一集的同时解锁每分钟积分与完播奖励。',
    subtitleRewards: '登录后即可领取每日签到、观剧里程碑、分享与邀请奖励。',
    welcomePillLabel: '新账号首次登录奖励',
    watchTitle: '活跃观剧与剧集奖励',
    watchValue: '+40 积分/分钟',
    watchDesc: '15/30/60分钟里程碑 (+300/+600/+1,200) 及单集完播 +500 积分',
    checkinTitle: '每日签到与分享',
    checkinValue: '+1,000 至 +2,000 积分',
    checkinDesc: '第1–6天签到 (+1,000)、第7天 (+2,000) 及每日社交分享 +1,000 积分',
    referralTitle: '好友邀请奖励',
    referralValue: '+5,000 积分/人',
    referralDesc: '绑定邀请码 +200 积分，有效观看满3,600秒奖励 +5,000 积分及持续返利',
    conversionLabel: '积分汇率',
    conversionValue: '100,000 积分 = 1 USDT (参考汇率 18,200 IDR)',
    minPayoutLabel: '最低提现门槛',
    minPayoutValue: '$5.00 / Rp 50,000',
    timezoneLabel: '每日重置时区',
    timezoneValue: '锁定为 UTC（每日 17:00 UTC 重置）',
    ctaPrimary: '登录并领取 +25,000 积分',
    ctaContinueWatch: '继续观看',
    ctaClose: '关闭',
    closeAria: '关闭登录奖励弹窗',
  },
  vi: {
    dialogLabel: 'Đăng nhập để tích điểm & nhận thưởng trên KanoDrama',
    badge: 'Ưu đãi thành viên mới',
    title: 'Đăng nhập để tích điểm xem phim',
    subtitleDefault:
      'Đăng nhập bằng Google hoặc Email để tích lũy điểm thưởng từ mỗi phút xem phim.',
    subtitleWatch:
      'Bạn đang xem phim! Đăng nhập ngay để số phút xem của bạn được cộng điểm tự động.',
    subtitleEpisode:
      'Tiếp tục xem tập tiếp theo và mở khóa thưởng từng phút cùng thưởng hoàn thành tập.',
    subtitleRewards:
      'Đăng nhập để điểm danh mỗi ngày, nhận mốc xem phim, chia sẻ và rút thưởng.',
    welcomePillLabel: 'Thưởng đăng nhập lần đầu (Tài khoản mới)',
    watchTitle: 'Xem phim & Hoàn thành tập',
    watchValue: '+40 điểm/phút',
    watchDesc: 'Mốc 15/30/60 phút (+300/+600/+1.200) & xong tập +500 điểm',
    checkinTitle: 'Điểm danh & Chia sẻ ngày',
    checkinValue: '+1.000 đến +2.000 điểm',
    checkinDesc: 'Ngày 1–6 (+1.000), Ngày 7 (+2.000) & chia sẻ MXH +1.000/ngày',
    referralTitle: 'Thưởng giới thiệu',
    referralValue: '+5.000 điểm/bạn',
    referralDesc: 'Gắn mã +200 điểm, bạn xem đủ 3.600 giây nhận +5.000 điểm & thưởng tiếp nối',
    conversionLabel: 'Tỷ lệ quy đổi',
    conversionValue: '100.000 điểm = 1 USDT (Tỷ giá IDR 18.200)',
    minPayoutLabel: 'Rút tối thiểu',
    minPayoutValue: '$5.00 / Rp 50.000',
    timezoneLabel: 'Múi giờ đặt lại hằng ngày',
    timezoneValue: 'Khóa theo UTC (Đặt lại 17:00 UTC)',
    ctaPrimary: 'Đăng nhập & Nhận +25.000 Điểm',
    ctaContinueWatch: 'Tiếp tục xem',
    ctaClose: 'Đóng',
    closeAria: 'Đóng thông báo đăng nhập nhận thưởng',
  },
  es: {
    dialogLabel: 'Inicia sesión para ganar puntos y recompensas en KanoDrama',
    badge: 'Recompensas de bienvenida',
    title: 'Inicia sesión y gana puntos viendo',
    subtitleDefault:
      'Entra con Google o correo para convertir tu tiempo de reproducción en puntos canjeables.',
    subtitleWatch:
      '¡Ya estás viendo! Inicia sesión ahora para que tus minutos activos sumen puntos.',
    subtitleEpisode:
      'Sigue viendo episodios mientras desbloqueas puntos por minuto y bonos por episodio.',
    subtitleRewards:
      'Inicia sesión para reclamar tu registro diario, hitos de visualización y retiros.',
    welcomePillLabel: 'Bono de primer inicio (Cuenta nueva)',
    watchTitle: 'Visualización activa y episodios',
    watchValue: '+40 pts/min',
    watchDesc: 'Hitos 15/30/60m (+300/+600/+1,200) y episodio completado +500 pts',
    checkinTitle: 'Check-in y compartir diario',
    checkinValue: '+1,000 a +2,000 pts',
    checkinDesc: 'Día 1–6 (+1,000), Día 7 (+2,000) y compartir diario +1,000 pts',
    referralTitle: 'Programa de referidos',
    referralValue: '+5,000 pts/invitado',
    referralDesc: '+200 pts al vincular, +5,000 pts tras 3,600s verificados y bonos continuos',
    conversionLabel: 'Tasa de conversión',
    conversionValue: '100,000 pts = 1 USDT (Ref. 18,200 IDR)',
    minPayoutLabel: 'Retiro mínimo',
    minPayoutValue: '$5.00 / Rp 50,000',
    timezoneLabel: 'Reinicio diario canónico',
    timezoneValue: 'Bloqueado en UTC (Reinicio 17:00 UTC)',
    ctaPrimary: 'Entrar y reclamar +25,000 pts',
    ctaContinueWatch: 'Seguir viendo',
    ctaClose: 'Cerrar',
    closeAria: 'Cerrar ventana de recompensas',
  },
  ko: {
    dialogLabel: '로그인하고 KanoDrama 포인트 및 리워드 적립하기',
    badge: '신규 회원 혜택',
    title: '로그인하고 시청 포인트 받기',
    subtitleDefault: 'Google 또는 이메일로 로그인하면 드라마 시청 시간이 현금성 포인트로 적립됩니다.',
    subtitleWatch: '지금 시청 중이시네요! 로그인하면 시청 분당 포인트가 바로 적립됩니다.',
    subtitleEpisode: '다음 에피소드를 보면서 분당 포인트와 에피소드 완료 보너스를 받아보세요.',
    subtitleRewards: '출석 체크, 시청 마일스톤, 공유 미션 및 출금을 이용하려면 로그인하세요.',
    welcomePillLabel: '신규 계정 첫 로그인 보너스',
    watchTitle: '활성 시청 & 에피소드',
    watchValue: '+40 포인트/분',
    watchDesc: '15/30/60분 달성 (+300/+600/+1,200) 및 에피소드 완료 +500 포인트',
    checkinTitle: '일일 출석 & 공유',
    checkinValue: '+1,000 ~ +2,000 포인트',
    checkinDesc: '1~6일차 (+1,000), 7일차 (+2,000) 및 일일 소셜 공유 +1,000 포인트',
    referralTitle: '친구 초대 리워드',
    referralValue: '+5,000 포인트/명',
    referralDesc: '코드 등록 +200, 3,600초 인증 시청 달성 시 +5,000 및 추가 보너스',
    conversionLabel: '포인트 환산 비율',
    conversionValue: '100,000 pts = 1 USDT (기준 18,200 IDR)',
    minPayoutLabel: '최소 출금 금액',
    minPayoutValue: '$5.00 / Rp 50,000',
    timezoneLabel: '일일 초기화 기준 시간',
    timezoneValue: 'UTC 고정 (매일 17:00 UTC 초기화)',
    ctaPrimary: '로그인하고 +25,000 P 받기',
    ctaContinueWatch: '계속 시청하기',
    ctaClose: '닫기',
    closeAria: '로그인 리워드 팝업 닫기',
  },
  ja: {
    dialogLabel: 'ログインして KanoDrama ポイント＆報酬を獲得',
    badge: '新規会員特典',
    title: 'ログインして視聴ポイントを貯めよう',
    subtitleDefault: 'Google またはメールでログインすると、ドラマ視聴ごとにポイントが貯まります。',
    subtitleWatch: '視聴中です！今すぐログインすると視聴時間に応じて自動的にポイントが加算されます。',
    subtitleEpisode: '次のエピソードを見ながら、毎分の視聴ポイントと完了ボーナスを獲得できます。',
    subtitleRewards: 'ログインして毎日チェックイン、達成ボーナス、シェア特典、出金を利用しましょう。',
    welcomePillLabel: '新規アカウント初回ログイン特典',
    watchTitle: 'アクティブ視聴＆エピソード',
    watchValue: '+40 pt/分',
    watchDesc: '15/30/60分マイルストーン (+300/+600/+1,200)＆話数完了 +500 pt',
    checkinTitle: '毎日チェックイン＆シェア',
    checkinValue: '+1,000 〜 +2,000 pt',
    checkinDesc: '1〜6日目 (+1,000)、7日目 (+2,000)＆毎日のSNSシェア +1,000 pt',
    referralTitle: '紹介リワード',
    referralValue: '+5,000 pt/人',
    referralDesc: '紹介紐付け +200 pt、3,600秒認証視聴達成で +5,000 pt＆継続特典',
    conversionLabel: 'ポイント換算レート',
    conversionValue: '100,000 pt = 1 USDT (基準 18,200 IDR)',
    minPayoutLabel: '最低出金額',
    minPayoutValue: '$5.00 / Rp 50,000',
    timezoneLabel: '日次リセット基準時刻',
    timezoneValue: 'UTC 固定（毎日 17:00 UTC リセット）',
    ctaPrimary: 'ログインして +25,000 pt 獲得',
    ctaContinueWatch: '視聴を続ける',
    ctaClose: '閉じる',
    closeAria: 'ログイン特典ポップアップを閉じる',
  },
  th: {
    dialogLabel: 'เข้าสู่ระบบเพื่อสะสมแต้มและรางวัลบน KanoDrama',
    badge: 'สิทธิพิเศษสมาชิกใหม่',
    title: 'เข้าสู่ระบบและรับแต้มขณะรับชม',
    subtitleDefault:
      'เข้าสู่ระบบด้วย Google หรืออีเมล เพื่อเปลี่ยนเวลาดูซีรีส์เป็นแต้มสะสมถอนเงินได้',
    subtitleWatch:
      'คุณกำลังรับชมอยู่! เข้าสู่ระบบตอนนี้เพื่อให้ทุกนาทีที่ดูได้รับแต้มอัตโนมัติ',
    subtitleEpisode:
      'ดูตอนถัดไปต่อพร้อมปลดล็อกแต้มรายนาทีและโบนัสดูจบตอน',
    subtitleRewards:
      'เข้าสู่ระบบเพื่อเช็คอินรายวัน รับโบนัสตามเป้าหมาย และถอนรางวัล',
    welcomePillLabel: 'โบนัสเข้าสู่ระบบครั้งแรก (บัญชีใหม่)',
    watchTitle: 'ดูซีรีส์และจบตอน',
    watchValue: '+40 แต้ม/นาที',
    watchDesc: 'เป้าหมาย 15/30/60 นาที (+300/+600/+1,200) และจบตอน +500 แต้ม',
    checkinTitle: 'เช็คอินและแชร์รายวัน',
    checkinValue: '+1,000 ถึง +2,000 แต้ม',
    checkinDesc: 'วันที่ 1–6 (+1,000), วันที่ 7 (+2,000) และแชร์โซเชียล +1,000 แต้ม/วัน',
    referralTitle: 'รางวัลชวนเพื่อน',
    referralValue: '+5,000 แต้ม/คน',
    referralDesc: 'ผูกโค้ด +200, เพื่อนดูครบ 3,600 วินาทีรับ +5,000 แต้มและโบนัสต่อเนื่อง',
    conversionLabel: 'อัตราแลกเปลี่ยน',
    conversionValue: '100,000 แต้ม = 1 USDT (อ้างอิง 18,200 IDR)',
    minPayoutLabel: 'ถอนขั้นต่ำ',
    minPayoutValue: '$5.00 / Rp 50,000',
    timezoneLabel: 'เขตรอบรีเซ็ตประจำวัน',
    timezoneValue: 'ล็อกเวลา UTC (รีเซ็ต 17:00 UTC)',
    ctaPrimary: 'เข้าสู่ระบบ & รับ +25,000 แต้ม',
    ctaContinueWatch: 'ดูต่อ',
    ctaClose: 'ปิด',
    closeAria: 'ปิดหน้าต่างชวนเข้าสู่ระบบรับรางวัล',
  },
  ms: {
    dialogLabel: 'Log Masuk untuk Kumpul Mata & Ganjaran di KanoDrama',
    badge: 'Ganjaran Ahli Baharu',
    title: 'Log Masuk & Kumpul Mata Tontonan',
    subtitleDefault:
      'Log masuk dengan Google atau E-mel untuk menukar masa tontonan drama anda kepada mata ganjaran.',
    subtitleWatch:
      'Anda sedang menonton! Log masuk sekarang supaya minit tontonan anda terus menjana mata.',
    subtitleEpisode:
      'Teruskan ke episod seterusnya sambil membuka mata per minit & bonus tamat episod.',
    subtitleRewards:
      'Log masuk untuk menuntut daftar masuk harian, pencapaian tontonan, dan pengeluaran.',
    welcomePillLabel: 'Bonus Log Masuk Pertama (Akaun Baharu)',
    watchTitle: 'Tontonan Aktif & Episod',
    watchValue: '+40 mata/min',
    watchDesc: 'Pencapaian 15/30/60m (+300/+600/+1,200) & tamat episod +500 mata',
    checkinTitle: 'Daftar Masuk & Kongsi Harian',
    checkinValue: '+1,000 hingga +2,000 mata',
    checkinDesc: 'Hari 1–6 (+1,000), Hari 7 (+2,000) & kongsi sosial +1,000 mata/hari',
    referralTitle: 'Ganjaran Rujukan',
    referralValue: '+5,000 mata/rakan',
    referralDesc: 'Pautan kod +200 mata, tontonan sah 3,600s +5,000 mata & ganjaran berterusan',
    conversionLabel: 'Kadar Penukaran',
    conversionValue: '100,000 mata = 1 USDT (Rujukan 18,200 IDR)',
    minPayoutLabel: 'Pengeluaran Minimum',
    minPayoutValue: '$5.00 / Rp 50,000',
    timezoneLabel: 'Zon Waktu Tetapan Semula',
    timezoneValue: 'Dikunci ke UTC (Tetap semula 17:00 UTC)',
    ctaPrimary: 'Log Masuk & Tuntut +25,000 Mata',
    ctaContinueWatch: 'Teruskan Menonton',
    ctaClose: 'Tutup',
    closeAria: 'Tutup tetingkap ganjaran log masuk',
  },
  tl: {
    dialogLabel: 'Mag-sign In para Kumita ng Puntos at Rewards sa KanoDrama',
    badge: 'Bagong Miyembro Bonus',
    title: 'Mag-sign In at Kumita Habang Nanonood',
    subtitleDefault:
      'Mag-sign in gamit ang Google o Email para gawing redeemable points ang oras ng panonood.',
    subtitleWatch:
      'Kasalukuyan kang nanonood! Mag-sign in ngayon para automatikong kumita ng puntos bawat minuto.',
    subtitleEpisode:
      'Magpatuloy sa susunod na episode habang kumikita ng per-minute points at episode bonus.',
    subtitleRewards:
      'Mag-sign in para makuha ang daily check-in, watch milestones, at payout.',
    welcomePillLabel: 'Unang Sign-In Bonus (Bagong Account)',
    watchTitle: 'Aktibong Panonood at Episode',
    watchValue: '+40 pts/min',
    watchDesc: '15/30/60m milestones (+300/+600/+1,200) at tapos na episode +500 pts',
    checkinTitle: 'Araw-araw na Check-in at Share',
    checkinValue: '+1,000 hanggang +2,000 pts',
    checkinDesc: 'Araw 1–6 (+1,000), Araw 7 (+2,000) at daily share +1,000 pts',
    referralTitle: 'Referral Rewards',
    referralValue: '+5,000 pts/imbita',
    referralDesc: '+200 pts bind bonus, +5,000 pts pagkatapos ng 3,600s verified watch',
    conversionLabel: 'Palitan ng Puntos',
    conversionValue: '100,000 pts = 1 USDT (Ref. 18,200 IDR)',
    minPayoutLabel: 'Minimum Payout',
    minPayoutValue: '$5.00 / Rp 50,000',
    timezoneLabel: 'Canonical Daily Reset',
    timezoneValue: 'Naka-lock sa UTC (Reset 17:00 UTC)',
    ctaPrimary: 'Mag-sign In & Kunin ang +25,000 Pts',
    ctaContinueWatch: 'Magpatuloy sa Panonood',
    ctaClose: 'Isara',
    closeAria: 'Isara ang popup ng login rewards',
  },
};

export const GuestRewardsInviteModal: React.FC = () => {
  const {
    user,
    authLoading,
    language,
    guestInviteModalOpen,
    guestInviteTriggerSource,
    guestInviteContextLabel,
    pointsPerUsd,
    closeGuestInviteModal,
    openAuthModal,
  } = useDramaContext();

  const isId = language === 'id';
  const copy = GUEST_INVITE_COPY[language] ?? GUEST_INVITE_COPY.en;

  useEffect(() => {
    if (!guestInviteModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeGuestInviteModal(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [guestInviteModalOpen, closeGuestInviteModal]);

  if (!guestInviteModalOpen || user || authLoading) return null;

  const isWatchTrigger =
    guestInviteTriggerSource === 'watch_duration' ||
    guestInviteTriggerSource === 'episode_milestone';
  const subtitle =
    guestInviteContextLabel ||
    (guestInviteTriggerSource === 'watch_duration'
      ? copy.subtitleWatch
      : guestInviteTriggerSource === 'episode_milestone'
      ? copy.subtitleEpisode
      : guestInviteTriggerSource === 'rewards_action'
      ? copy.subtitleRewards
      : copy.subtitleDefault);

  const oneUsdtDisplay = (Math.max(1000, pointsPerUsd || 100000)).toLocaleString(
    isId ? 'id-ID' : 'en-US'
  );
  const conversionDisplay = isId
    ? `${oneUsdtDisplay} poin = 1 USDT (Rp 18.200)`
    : `${oneUsdtDisplay} pts = 1 USDT (IDR ref 18,200)`;

  const handleProceedToSignIn = () => {
    closeGuestInviteModal(false);
    openAuthModal(subtitle);
  };

  return (
    <div
      onClick={() => closeGuestInviteModal(true)}
      className="fixed inset-0 z-[84] flex items-end sm:items-center justify-center sm:p-4 bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={copy.dialogLabel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="spotlight-card-enter relative w-full sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#0E0D12]/98 border-t sm:border border-amber-400/30 shadow-[0_24px_80px_rgba(0,0,0,0.9)]"
      >
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-32 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse at 50% 0%, rgba(212,175,55,0.18) 0%, rgba(239,68,68,0.06) 55%, transparent 82%)',
          }}
        />

        <button
          type="button"
          onClick={() => closeGuestInviteModal(true)}
          aria-label={copy.closeAria}
          className="absolute top-3.5 right-3.5 z-10 min-w-[40px] min-h-[40px] rounded-full bg-white/5 hover:bg-white/12 text-[#D4D4D8] hover:text-white flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="relative px-5 pt-6 pb-[max(20px,env(safe-area-inset-bottom))] space-y-4">
          {/* Header & First-Login Bonus */}
          <div className="space-y-2 pr-8">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/35 text-[11px] font-bold text-[#FDE68A]">
              <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>{copy.badge}</span>
            </span>

            <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight leading-snug">
              {copy.title}
            </h2>

            <p className="text-xs text-[#D4D4D8] leading-relaxed">
              {subtitle}
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-[#D4AF37]/18 via-[#D4AF37]/10 to-transparent border border-[#D4AF37]/35 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center shrink-0">
                <Gift className="w-4 h-4 text-[#FDE68A]" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-[#FDE68A] font-semibold truncate">
                  {copy.welcomePillLabel}
                </p>
                <p className="text-base sm:text-lg font-extrabold text-white tabular-nums leading-tight">
                  {isId ? '+25.000 Poin' : '+25,000 Pts'}
                </p>
              </div>
            </div>
            <Coins className="w-5 h-5 text-[#D4AF37] shrink-0" />
          </div>

          {/* Earning Summary */}
          <div className="rounded-2xl bg-[#141319] border border-white/10 divide-y divide-white/8">
            <div className="p-3 flex items-start gap-2.5">
              <Play className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-white">{copy.watchTitle}</span>
                  <span className="font-bold text-emerald-300 tabular-nums shrink-0">
                    {copy.watchValue}
                  </span>
                </div>
                <p className="text-[11px] text-[#A1A1AA] mt-0.5 leading-relaxed">
                  {copy.watchDesc}
                </p>
              </div>
            </div>

            <div className="p-3 flex items-start gap-2.5">
              <CalendarCheck2 className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-white">{copy.checkinTitle}</span>
                  <span className="font-bold text-amber-200 tabular-nums shrink-0">
                    {copy.checkinValue}
                  </span>
                </div>
                <p className="text-[11px] text-[#A1A1AA] mt-0.5 leading-relaxed">
                  {copy.checkinDesc}
                </p>
              </div>
            </div>

            <div className="p-3 flex items-start gap-2.5">
              <Users className="w-4 h-4 text-sky-300 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-white">{copy.referralTitle}</span>
                  <span className="font-bold text-sky-200 tabular-nums shrink-0">
                    {copy.referralValue}
                  </span>
                </div>
                <p className="text-[11px] text-[#A1A1AA] mt-0.5 leading-relaxed">
                  {copy.referralDesc}
                </p>
              </div>
            </div>
          </div>

          {/* Conversion, Minimum Payout & Canonical Timezone Info */}
          <div className="rounded-xl bg-[#0B0A0F] border border-white/10 px-3.5 py-2.5 space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[#A1A1AA]">
                <Wallet className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                <span>{copy.conversionLabel}</span>
              </span>
              <span className="font-semibold text-white tabular-nums text-right">
                {conversionDisplay}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[#A1A1AA]">
                <Coins className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>{copy.minPayoutLabel}</span>
              </span>
              <span className="font-semibold text-emerald-300 tabular-nums text-right">
                {copy.minPayoutValue}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[#A1A1AA]">
                <Clock className="w-3.5 h-3.5 text-sky-300 shrink-0" />
                <span>{copy.timezoneLabel}</span>
              </span>
              <span className="font-semibold text-[#E4E4E7] tabular-nums text-right">
                {copy.timezoneValue}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2 pt-0.5">
            <button
              type="button"
              onClick={handleProceedToSignIn}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#F59E0B] to-[#D97706] hover:brightness-110 text-[#09090B] text-sm font-extrabold flex items-center justify-center gap-2 shadow-[0_12px_28px_rgba(245,158,11,0.28)] transition-all active:scale-[0.98]"
            >
              <span>{copy.ctaPrimary}</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => closeGuestInviteModal(true)}
              className="w-full min-h-[40px] px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-[#E4E4E7] transition-colors"
            >
              {isWatchTrigger ? copy.ctaContinueWatch : copy.ctaClose}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
