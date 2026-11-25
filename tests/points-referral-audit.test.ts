import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import type { AddressInfo } from 'node:net';

process.env.KD_DISABLE_AUTO_LISTEN = '1';
process.env.ADMIN_PAYOUT_SECRET = 'test-admin-secret-999';
process.env.STREAM_SIGNING_SECRET = 'test-signing-secret-abc';
process.env.SITE_URL = 'https://kano-drama.live';
delete process.env.DATABASE_URL;

import {
  _setDbPoolForTest,
  getJakartaDateKey,
  getPayoutRuntimeConfig,
  recordWatchHeartbeatInDb,
  startWatchSessionInDb,
} from '../server/db';
import { createServerApp, signAuthSessionToken } from '../server';
import {
  formatTelegramWithdrawMessage,
  notifyAdminTelegramNewWithdrawal,
} from '../server/telegramNotify';
import { getProductionReferralUrl } from '../src/config/auth';

interface MemUser {
  uid: string;
  email: string;
  display_name: string;
  referral_code: string;
  referred_by: string | null;
  streak_count: number;
  last_visit_date: string;
  is_vip: boolean;
}

interface MemLedger {
  id: string;
  user_id: string;
  type: 'earn' | 'redeem';
  points: number;
  description: string;
  reference_id: string;
  balance_after: number | null;
  created_at: Date;
}

interface MemPayout {
  id: string;
  user_id: string;
  points_spent: number;
  usd_amount: string;
  idr_amount: string;
  fx_rate_used: string;
  currency: string;
  method: string;
  bank_code: string;
  network: string;
  destination_account: string;
  account_holder_name: string;
  status: string;
  admin_note: string;
  idempotency_key: string | null;
  risk_flag: string;
  suspicious_reason: string;
  created_at: Date;
  updated_at: Date;
}

interface MemCheckin {
  user_id: string;
  checkin_date: string;
  streak_day: number;
  points_awarded: number;
  ledger_id: string;
  created_at: Date;
}

interface MemRewardedEpisode {
  user_id: string;
  provider: string;
  drama_id: string;
  episode_number: number;
  points_awarded: number;
  session_token: string;
  ledger_id: string;
  created_at: Date;
}

interface MemWatchSession {
  session_token: string;
  user_id: string;
  media_key: string;
  provider: string;
  drama_id: string;
  episode_number: number;
  device_hash: string;
  started_at: Date;
  last_heartbeat_at: Date | null;
  last_video_time_sec: number;
  accumulated_sec: number;
  last_seq: number;
  is_active: boolean;
  expires_at: Date;
  updated_at: Date;
}

interface MemWatchTelemetry {
  user_id: string;
  verified_watch_seconds: number;
  today_watch_seconds: number;
  today_date_key: string;
  active_stream_session_id: string;
  active_stream_media_key: string;
  last_heartbeat_at: Date | null;
  last_video_time_sec: string;
  fast_delta_strikes: number;
  concurrent_tab_strikes: number;
  risk_flag: string;
  suspicious_reason: string;
  updated_at: Date;
}

interface MemSecuritySignal {
  user_id: string;
  ip_hash: string;
  subnet_hash: string;
  ua_hash: string;
  device_hash: string;
  risk_flag: string;
  suspicious_reason: string;
  last_seen_at: Date;
}

interface MemReferral {
  id: string;
  referrer_uid: string;
  referee_uid: string;
  referral_code: string;
  status: 'pending_watch' | 'qualified' | 'rejected_fraud';
  bonus_points: number;
  referee_ip_hash: string;
  referee_subnet_hash: string;
  referee_ua_hash: string;
  referee_device_hash: string;
  risk_flag: string;
  suspicious_reason: string;
  qualified_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function createStatefulPgMock() {
  const state = {
    users: new Map<string, MemUser>(),
    emailCredentials: new Map<
      string,
      { email: string; uid: string; password_hash: string; display_name: string }
    >(),
    gmailLogins: new Map<
      string,
      { account_key: string; uid: string; email: string; login_count: number }
    >(),
    ledger: [] as MemLedger[],
    payouts: [] as MemPayout[],
    checkins: [] as MemCheckin[],
    rewardedEpisodes: [] as MemRewardedEpisode[],
    watchSessions: new Map<string, MemWatchSession>(),
    telemetry: new Map<string, MemWatchTelemetry>(),
    securitySignals: new Map<string, MemSecuritySignal>(),
    referrals: [] as MemReferral[],
  };

  function userBalance(uid: string): number {
    let earn = 0;
    let redeem = 0;
    for (const r of state.ledger) {
      if (r.user_id !== uid) continue;
      if (r.type === 'earn') earn += r.points;
      else redeem += r.points;
    }
    return earn - redeem;
  }

  function runQuery(sqlRaw: string, params: any[] = []) {
    const sql = sqlRaw.replace(/\s+/g, ' ').trim();

    if (
      sql === 'BEGIN' ||
      sql === 'COMMIT' ||
      sql === 'ROLLBACK' ||
      sql.startsWith('SELECT pg_advisory_xact_lock')
    ) {
      return { rows: [], rowCount: 0 };
    }

    // 1. User security signals
    if (sql.startsWith('INSERT INTO user_security_signals')) {
      const uid = String(params[0]);
      const existing = state.securitySignals.get(uid);
      if (params.length === 4) {
        const risk = String(params[1] || '');
        const reason = String(params[2] || '');
        if (!existing) {
          state.securitySignals.set(uid, {
            user_id: uid,
            ip_hash: '',
            subnet_hash: '',
            ua_hash: '',
            device_hash: '',
            risk_flag: risk,
            suspicious_reason: reason,
            last_seen_at: new Date(),
          });
        } else {
          existing.risk_flag = existing.risk_flag
            ? `${existing.risk_flag},${risk}`
            : risk;
          existing.suspicious_reason = existing.suspicious_reason
            ? `${existing.suspicious_reason}; ${reason}`
            : reason;
          existing.last_seen_at = new Date();
        }
      } else {
        state.securitySignals.set(uid, {
          user_id: uid,
          ip_hash: String(params[1] || existing?.ip_hash || ''),
          subnet_hash: String(params[2] || existing?.subnet_hash || ''),
          ua_hash: String(params[3] || existing?.ua_hash || ''),
          device_hash: String(params[4] || existing?.device_hash || ''),
          risk_flag: String(params[5] || existing?.risk_flag || ''),
          suspicious_reason: String(params[6] || existing?.suspicious_reason || ''),
          last_seen_at: new Date(),
        });
      }
      return { rows: [], rowCount: 1 };
    }

    if (sql.includes('FROM user_security_signals WHERE user_id = $1 AND user_id <> $2') ||
        sql.includes('FROM user_security_signals WHERE user_id = $1 AND device_hash')) {
      const targetUid = String(params[0]);
      const devHash = String(params[1] || '');
      const ipHash = String(params[2] || '');
      const sig = state.securitySignals.get(targetUid);
      if (!sig) return { rows: [], rowCount: 0 };
      const matchDev = Boolean(devHash && sig.device_hash === devHash);
      const matchIp = Boolean(ipHash && sig.ip_hash === ipHash);
      return matchDev || matchIp
        ? { rows: [sig], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }

    if (sql.includes('SELECT risk_flag, suspicious_reason FROM user_security_signals WHERE user_id = $1')) {
      const sig = state.securitySignals.get(String(params[0]));
      return { rows: sig ? [{ risk_flag: sig.risk_flag, suspicious_reason: sig.suspicious_reason }] : [], rowCount: sig ? 1 : 0 };
    }

    if (sql.includes('SELECT risk_flag FROM user_security_signals WHERE user_id = $1')) {
      const sig = state.securitySignals.get(String(params[0]));
      return { rows: sig ? [{ risk_flag: sig.risk_flag }] : [], rowCount: sig ? 1 : 0 };
    }

    if (sql.includes('SELECT ip_hash, subnet_hash, ua_hash, device_hash FROM user_security_signals WHERE user_id = $1')) {
      const sig = state.securitySignals.get(String(params[0]));
      return {
        rows: sig
          ? [
              {
                ip_hash: sig.ip_hash,
                subnet_hash: sig.subnet_hash,
                ua_hash: sig.ua_hash,
                device_hash: sig.device_hash,
              },
            ]
          : [],
        rowCount: sig ? 1 : 0,
      };
    }

    if (sql.includes('COUNT(DISTINCT user_id)::text AS cnt FROM user_security_signals')) {
      const hashVal = String(params[0] || '');
      const isDev = sql.includes('WHERE device_hash = $1');
      const users = new Set<string>();
      for (const s of state.securitySignals.values()) {
        if (isDev ? s.device_hash === hashVal : s.subnet_hash === hashVal) {
          users.add(s.user_id);
        }
      }
      return { rows: [{ cnt: String(users.size) }], rowCount: 1 };
    }

    if (sql.includes('COUNT(*)::text AS cnt FROM user_security_signals')) {
      const targetUid = String(params[0]);
      const dev = String(params[1] || '');
      const ip = String(params[2] || '');
      let cnt = 0;
      for (const s of state.securitySignals.values()) {
        if (s.user_id !== targetUid && ((dev && s.device_hash === dev) || (ip && s.ip_hash === ip))) {
          cnt++;
        }
      }
      return { rows: [{ cnt: String(cnt) }], rowCount: 1 };
    }

    if (sql.startsWith('UPDATE user_security_signals SET risk_flag')) {
      const sig = state.securitySignals.get(String(params[0]));
      if (sig) {
        sig.risk_flag = String(params[1] || '');
        sig.suspicious_reason = String(params[2] || '');
      }
      return { rows: [], rowCount: 1 };
    }

    // 2. Users queries
    if (sql.includes('SELECT uid, COALESCE(LOWER(TRIM(email))') ||
        sql.includes('FROM users WHERE referral_code = $1')) {
      const code = String(params[0]).toUpperCase();
      for (const u of state.users.values()) {
        if (u.referral_code.toUpperCase() === code) {
          return { rows: [{ uid: u.uid, email: u.email.toLowerCase() }], rowCount: 1 };
        }
      }
      return { rows: [], rowCount: 0 };
    }

    if (sql.includes('SELECT COALESCE(LOWER(TRIM(email))') && sql.includes('FROM users WHERE uid = $1')) {
      const u = state.users.get(String(params[0]));
      return { rows: u ? [{ email: u.email.toLowerCase() }] : [{ email: '' }], rowCount: 1 };
    }

    if (sql.includes('UPDATE users SET referral_code')) {
      const uid = String(params[0]);
      const code = String(params[1]);
      const u = state.users.get(uid);
      if (u && !u.referral_code) u.referral_code = code;
      return { rows: [], rowCount: 1 };
    }

    if (sql.startsWith('UPDATE users SET streak_count')) {
      const uid = String(params[0]);
      const u = state.users.get(uid);
      if (u) {
        u.streak_count = Number(params[1]);
        u.last_visit_date = String(params[2]);
        if (u.streak_count >= 3) u.is_vip = true;
      }
      return { rows: [], rowCount: 1 };
    }

    if (sql.startsWith('UPDATE users SET referred_by')) {
      const uid = String(params[0]);
      const refUid = String(params[1]);
      const u = state.users.get(uid);
      if (u) u.referred_by = refUid;
      return { rows: [], rowCount: 1 };
    }

    if (sql === 'SELECT streak_count, last_visit_date FROM users WHERE uid = $1') {
      const u = state.users.get(String(params[0]));
      return {
        rows: u ? [{ streak_count: u.streak_count, last_visit_date: u.last_visit_date }] : [],
        rowCount: u ? 1 : 0,
      };
    }

    if (sql.startsWith('INSERT INTO users (')) {
      const uid = String(params[0]);
      const email = String(params[1] || '');
      const displayName = String(params[2] || 'Kano Viewer');
      const streakCount = Number(params[6] || 1);
      const lastVisitDate = String(params[7] || '');
      const isVip = Boolean(params[8]);
      const referralCode = String(params[9] || '');
      const existing = state.users.get(uid);
      const nextDisplay =
        existing && existing.display_name && existing.display_name !== 'Kano Viewer'
          ? existing.display_name
          : displayName;
      const nextEmail = email || existing?.email || '';
      const nextRefCode = existing?.referral_code || referralCode;
      const nextUser: MemUser = {
        uid,
        email: nextEmail,
        display_name: nextDisplay,
        referral_code: nextRefCode,
        referred_by: existing?.referred_by ?? null,
        streak_count: streakCount,
        last_visit_date: lastVisitDate,
        is_vip: isVip,
      };
      state.users.set(uid, nextUser);
      return {
        rows: [
          {
            uid: nextUser.uid,
            email: nextUser.email,
            display_name: nextUser.display_name,
            photo_url: params[3] ? String(params[3]) : null,
            avatar_initials: String(params[4] || 'KD'),
            avatar_color: String(params[5] || '#EF4444'),
            streak_count: nextUser.streak_count,
            last_visit_date: nextUser.last_visit_date,
            is_vip: nextUser.is_vip,
            bio: '',
            preferred_language: 'en',
            preferences_json: {},
          },
        ],
        rowCount: 1,
      };
    }

    if (sql === 'SELECT email FROM email_credentials WHERE email = $1 LIMIT 1') {
      const hit = state.emailCredentials.get(String(params[0]).toLowerCase());
      return { rows: hit ? [{ email: hit.email }] : [], rowCount: hit ? 1 : 0 };
    }

    if (sql.startsWith('INSERT INTO email_credentials')) {
      const email = String(params[0]).toLowerCase();
      if (state.emailCredentials.has(email)) {
        const err = new Error('duplicate key') as Error & { code?: string };
        err.code = '23505';
        throw err;
      }
      state.emailCredentials.set(email, {
        email,
        uid: String(params[1]),
        password_hash: String(params[2]),
        display_name: String(params[3]),
      });
      return { rows: [], rowCount: 1 };
    }

    if (sql === 'SELECT uid, password_hash, display_name FROM email_credentials WHERE email = $1 LIMIT 1') {
      const hit = state.emailCredentials.get(String(params[0]).toLowerCase());
      return {
        rows: hit
          ? [{ uid: hit.uid, password_hash: hit.password_hash, display_name: hit.display_name }]
          : [],
        rowCount: hit ? 1 : 0,
      };
    }

    if (sql.startsWith('INSERT INTO gmail_login_accounts')) {
      const accountKey = String(params[0]);
      const uid = String(params[1]);
      const email = String(params[2] || '');
      const existing = state.gmailLogins.get(accountKey);
      const isIncrement = sql.includes('login_count, 1) + 1');
      if (!existing) {
        state.gmailLogins.set(accountKey, {
          account_key: accountKey,
          uid,
          email,
          login_count: 1,
        });
      } else {
        existing.uid = uid;
        if (email) existing.email = email;
        existing.login_count = isIncrement ? existing.login_count + 1 : Math.max(1, existing.login_count);
      }
      return { rows: [], rowCount: 1 };
    }

    if (sql.includes('FROM gmail_login_accounts')) {
      let sum = 0;
      for (const g of state.gmailLogins.values()) {
        sum += Math.max(1, g.login_count);
      }
      return { rows: [{ cnt: String(sum) }], rowCount: 1 };
    }

    // 3. Account age / watch check during bindReferral
    if (sql.includes('(SELECT COUNT(*)::text FROM points_ledger') && sql.includes('AS ledger_cnt')) {
      const uid = String(params[0]);
      const ledgerCnt = state.ledger.filter((l) => l.user_id === uid).length;
      const tel = state.telemetry.get(uid);
      return {
        rows: [
          {
            created_at: new Date(),
            ledger_cnt: String(ledgerCnt),
            watch_sec: tel?.verified_watch_seconds ?? 0,
          },
        ],
        rowCount: 1,
      };
    }

    // 4. Daily Check-in queries
    if (sql.includes('FROM daily_checkins WHERE user_id = $1 AND (checkin_date = $2::date') ||
        sql.startsWith('SELECT user_id FROM daily_checkins WHERE user_id = $1 AND checkin_date = $2::date')) {
      const uid = String(params[0]);
      const dt = String(params[1]);
      const pStart = params[2] instanceof Date ? params[2].getTime() : null;
      const pEnd = params[3] instanceof Date ? params[3].getTime() : null;
      const hit = state.checkins.find((c) => {
        if (c.user_id !== uid) return false;
        if (c.checkin_date === dt) return true;
        if (pStart !== null && pEnd !== null) {
          const ts = c.created_at.getTime();
          return ts >= pStart && ts < pEnd;
        }
        return false;
      });
      return { rows: hit ? [{ user_id: uid }] : [], rowCount: hit ? 1 : 0 };
    }

    if (sql.startsWith('SELECT streak_day FROM daily_checkins WHERE user_id = $1 AND checkin_date = $2::date')) {
      const uid = String(params[0]);
      const dt = String(params[1]);
      const hit = state.checkins.find((c) => c.user_id === uid && c.checkin_date === dt);
      return { rows: hit ? [{ streak_day: hit.streak_day }] : [], rowCount: hit ? 1 : 0 };
    }

    if (sql.startsWith('SELECT MAX(created_at) AS last_at FROM daily_checkins WHERE user_id = $1')) {
      const uid = String(params[0]);
      let latest: Date | null = null;
      for (const c of state.checkins) {
        if (c.user_id === uid && (!latest || c.created_at > latest)) {
          latest = c.created_at;
        }
      }
      return { rows: [{ last_at: latest }], rowCount: 1 };
    }

    if (sql.startsWith('INSERT INTO daily_checkins')) {
      const uid = String(params[0]);
      const dt = String(params[1]);
      const exists = state.checkins.some((c) => c.user_id === uid && c.checkin_date === dt);
      if (!exists) {
        state.checkins.push({
          user_id: uid,
          checkin_date: dt,
          streak_day: Number(params[2]),
          points_awarded: Number(params[3]),
          ledger_id: String(params[4]),
          created_at: new Date(),
        });
      }
      return { rows: [], rowCount: exists ? 0 : 1 };
    }

    if (sql.includes('FROM daily_checkins WHERE user_id = $1 ORDER BY checkin_date DESC')) {
      const uid = String(params[0]);
      const rows = state.checkins
        .filter((c) => c.user_id === uid)
        .sort((a, b) => b.checkin_date.localeCompare(a.checkin_date))
        .slice(0, 14)
        .map((c) => ({
          checkin_date: c.checkin_date,
          streak_day: c.streak_day,
          created_at: c.created_at,
        }));
      return { rows, rowCount: rows.length };
    }

    // 5. Rewarded episodes queries
    if (sql.includes('FROM rewarded_episodes WHERE user_id = $1')) {
      const uid = String(params[0]);
      const prov = String(params[1]).toLowerCase();
      const did = String(params[2]);
      const ep = Number(params[3]);
      const hit = state.rewardedEpisodes.find(
        (r) =>
          r.user_id === uid &&
          r.provider.toLowerCase() === prov &&
          r.drama_id === did &&
          r.episode_number === ep
      );
      return { rows: hit ? [{ user_id: uid }] : [], rowCount: hit ? 1 : 0 };
    }

    if (sql.startsWith('INSERT INTO rewarded_episodes')) {
      const rec: MemRewardedEpisode = {
        user_id: String(params[0]),
        provider: String(params[1]),
        drama_id: String(params[2]),
        episode_number: Number(params[3]),
        points_awarded: Number(params[4]),
        session_token: String(params[5]),
        ledger_id: String(params[6]),
        created_at: new Date(),
      };
      const dup = state.rewardedEpisodes.some(
        (r) =>
          r.user_id === rec.user_id &&
          r.provider === rec.provider &&
          r.drama_id === rec.drama_id &&
          r.episode_number === rec.episode_number
      );
      if (!dup) state.rewardedEpisodes.push(rec);
      return { rows: [], rowCount: dup ? 0 : 1 };
    }

    // 6. Watch sessions
    if (sql.startsWith('UPDATE watch_sessions SET is_active = FALSE')) {
      const sess = state.watchSessions.get(String(params[0]));
      if (sess && sess.user_id === String(params[1])) {
        sess.is_active = false;
      }
      return { rows: [], rowCount: sess ? 1 : 0 };
    }

    if (sql.startsWith('INSERT INTO watch_sessions')) {
      const tok = String(params[0]);
      state.watchSessions.set(tok, {
        session_token: tok,
        user_id: String(params[1]),
        media_key: String(params[2]),
        provider: String(params[3]),
        drama_id: String(params[4]),
        episode_number: Number(params[5]),
        device_hash: String(params[6] || ''),
        started_at: new Date(),
        last_heartbeat_at: null,
        last_video_time_sec: -1,
        accumulated_sec: 0,
        last_seq: 0,
        is_active: true,
        expires_at: params[7] instanceof Date ? params[7] : new Date(params[7]),
        updated_at: new Date(),
      });
      return { rows: [], rowCount: 1 };
    }

    if (sql.includes('FROM watch_sessions WHERE session_token = $1 AND user_id = $2')) {
      const sess = state.watchSessions.get(String(params[0]));
      if (!sess || sess.user_id !== String(params[1])) {
        return { rows: [], rowCount: 0 };
      }
      return {
        rows: [
          {
            session_token: sess.session_token,
            accumulated_sec: sess.accumulated_sec,
            last_seq: sess.last_seq,
            is_active: sess.is_active,
            expires_at: sess.expires_at,
          },
        ],
        rowCount: 1,
      };
    }

    if (sql.includes('FROM watch_sessions WHERE user_id = $1 AND (')) {
      const uid = String(params[0]);
      const tok = String(params[1] || '');
      const prov = String(params[2] || '').toLowerCase();
      const did = String(params[3] || '');
      const ep = Number(params[4] || 0);
      const mk = String(params[5] || '').toLowerCase();
      const matches = Array.from(state.watchSessions.values())
        .filter(
          (s) =>
            s.user_id === uid &&
            ((tok && s.session_token === tok) ||
              (s.provider.toLowerCase() === prov && s.drama_id === did && s.episode_number === ep) ||
              s.media_key.toLowerCase() === mk)
        )
        .sort((a, b) => b.accumulated_sec - a.accumulated_sec);
      return {
        rows: matches[0]
          ? [
              {
                session_token: matches[0].session_token,
                accumulated_sec: matches[0].accumulated_sec,
              },
            ]
          : [],
        rowCount: matches[0] ? 1 : 0,
      };
    }

    if (sql.startsWith('UPDATE watch_sessions SET last_seq = $2')) {
      const s = state.watchSessions.get(String(params[0]));
      if (s) {
        s.last_seq = Number(params[1]);
        s.updated_at = new Date();
      }
      return { rows: [], rowCount: 1 };
    }

    if (sql.startsWith('UPDATE watch_sessions SET accumulated_sec = $2')) {
      const s = state.watchSessions.get(String(params[0]));
      if (s) {
        s.accumulated_sec = Number(params[1]);
        s.last_heartbeat_at = new Date();
        s.last_video_time_sec = Number(params[2]);
        s.updated_at = new Date();
      }
      return { rows: [], rowCount: 1 };
    }

    if (sql.startsWith('UPDATE watch_sessions SET last_heartbeat_at = NOW(), last_video_time_sec = $2')) {
      const s = state.watchSessions.get(String(params[0]));
      if (s) {
        s.last_heartbeat_at = new Date();
        s.last_video_time_sec = Number(params[1]);
        s.updated_at = new Date();
      }
      return { rows: [], rowCount: 1 };
    }

    // 7. Watch telemetry
    if (sql.includes('SELECT * FROM watch_telemetry WHERE user_id = $1 FOR UPDATE')) {
      const t = state.telemetry.get(String(params[0]));
      return { rows: t ? [t] : [], rowCount: t ? 1 : 0 };
    }

    if (sql.includes('SELECT today_watch_seconds, today_date_key FROM watch_telemetry')) {
      const t = state.telemetry.get(String(params[0]));
      return {
        rows: t
          ? [{ today_watch_seconds: t.today_watch_seconds, today_date_key: t.today_date_key }]
          : [],
        rowCount: t ? 1 : 0,
      };
    }

    if (sql.includes('SELECT verified_watch_seconds, today_watch_seconds, today_date_key, risk_flag FROM watch_telemetry')) {
      const t = state.telemetry.get(String(params[0]));
      return {
        rows: t
          ? [
              {
                verified_watch_seconds: t.verified_watch_seconds,
                today_watch_seconds: t.today_watch_seconds,
                today_date_key: t.today_date_key,
                risk_flag: t.risk_flag,
              },
            ]
          : [],
        rowCount: t ? 1 : 0,
      };
    }

    if (sql.startsWith('UPDATE watch_telemetry SET active_stream_session_id')) {
      const t = state.telemetry.get(String(params[0]));
      if (t) {
        if (t.active_stream_session_id === String(params[1])) {
          t.active_stream_session_id = '';
        }
        t.last_video_time_sec = '-1';
      }
      return { rows: [], rowCount: 1 };
    }

    if (sql.startsWith('INSERT INTO watch_telemetry')) {
      const uid = String(params[0]);
      // Differentiate variants cleanly via parameter length / column list
      if (sql.includes("active_stream_session_id, active_stream_media_key, last_heartbeat_at, last_video_time_sec") &&
          sql.includes("VALUES ($1, $2, $3, $4, '', $5, NOW(), -1")) {
        state.telemetry.set(uid, {
          user_id: uid,
          verified_watch_seconds: Number(params[1]),
          today_watch_seconds: Number(params[2]),
          today_date_key: String(params[3]),
          active_stream_session_id: '',
          active_stream_media_key: String(params[4]),
          last_heartbeat_at: new Date(),
          last_video_time_sec: '-1',
          fast_delta_strikes: Number(params[5]),
          concurrent_tab_strikes: Number(params[6]),
          risk_flag: String(params[7]),
          suspicious_reason: String(params[8]),
          updated_at: new Date(),
        });
      } else if (params.length === 10) {
        const cur = state.telemetry.get(uid);
        state.telemetry.set(uid, {
          user_id: uid,
          verified_watch_seconds: Number(params[1]),
          today_watch_seconds: Number(params[2]),
          today_date_key: String(params[3]),
          active_stream_session_id: String(params[4]),
          active_stream_media_key: String(params[5]),
          last_heartbeat_at: new Date(),
          last_video_time_sec: '-1',
          fast_delta_strikes: Number(params[6]),
          concurrent_tab_strikes: Number(params[7]),
          risk_flag: String(params[8]),
          suspicious_reason: String(params[9]),
          updated_at: new Date(),
        });
        void cur;
      } else {
        state.telemetry.set(uid, {
          user_id: uid,
          verified_watch_seconds: Number(params[1]),
          today_watch_seconds: Number(params[2]),
          today_date_key: String(params[3]),
          active_stream_session_id: String(params[4]),
          active_stream_media_key: String(params[5]),
          last_heartbeat_at: new Date(),
          last_video_time_sec: String(params[6]),
          fast_delta_strikes: Number(params[7]),
          concurrent_tab_strikes: Number(params[8]),
          risk_flag: String(params[9]),
          suspicious_reason: String(params[10]),
          updated_at: new Date(),
        });
      }
      return { rows: [], rowCount: 1 };
    }

    if (sql.startsWith('UPDATE watch_telemetry SET concurrent_tab_strikes')) {
      const t = state.telemetry.get(String(params[0]));
      if (t) {
        t.concurrent_tab_strikes = Number(params[1]);
        t.risk_flag = String(params[2]);
        t.suspicious_reason = String(params[3]);
      }
      return { rows: [], rowCount: 1 };
    }

    if (sql.startsWith('UPDATE watch_telemetry SET fast_delta_strikes')) {
      const t = state.telemetry.get(String(params[0]));
      if (t) {
        t.fast_delta_strikes = Number(params[1]);
        t.risk_flag = String(params[2]);
        t.suspicious_reason = String(params[3]);
      }
      return { rows: [], rowCount: 1 };
    }

    if (sql.startsWith('UPDATE watch_telemetry SET last_heartbeat_at = NOW(), last_video_time_sec = $2')) {
      const t = state.telemetry.get(String(params[0]));
      if (t) {
        t.last_heartbeat_at = new Date();
        t.last_video_time_sec = String(params[1]);
      }
      return { rows: [], rowCount: 1 };
    }

    if (sql.startsWith('UPDATE watch_telemetry SET verified_watch_seconds = $2')) {
      const t = state.telemetry.get(String(params[0]));
      if (t) {
        t.verified_watch_seconds = Number(params[1]);
        t.today_watch_seconds = Number(params[2]);
        t.today_date_key = String(params[3]);
        t.active_stream_session_id = String(params[4]);
        t.active_stream_media_key = String(params[5]);
        t.last_heartbeat_at = new Date();
        t.last_video_time_sec = String(params[6]);
      }
      return { rows: [], rowCount: 1 };
    }

    // 8. Points Ledger queries
    if (sql.startsWith('SELECT id FROM points_ledger WHERE reference_id = $1')) {
      const ref = String(params[0]);
      const hit = state.ledger.find((l) => l.reference_id === ref);
      return { rows: hit ? [{ id: hit.id }] : [], rowCount: hit ? 1 : 0 };
    }

    if (sql.startsWith('SELECT id FROM points_ledger WHERE user_id = $1 AND ( reference_id = $2') ||
        sql.includes('FROM points_ledger WHERE user_id = $1 AND ( reference_id = $2')) {
      const uid = String(params[0]);
      const exactRef = String(params[1] || '');
      const likePat = String(params[2] || '');
      const toLikeRegex = (pat: string) =>
        new RegExp('^' + pat.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$');
      const re = toLikeRegex(likePat);
      const pStart = params[3] instanceof Date ? params[3].getTime() : 0;
      const pEnd = params[4] instanceof Date ? params[4].getTime() : Number.MAX_SAFE_INTEGER;
      const hit = state.ledger.find((l) => {
        if (l.user_id !== uid) return false;
        if (l.reference_id === exactRef) return true;
        const ts = l.created_at.getTime();
        return re.test(l.reference_id) && ts >= pStart && ts < pEnd;
      });
      return { rows: hit ? [{ id: hit.id }] : [], rowCount: hit ? 1 : 0 };
    }

    if (sql.startsWith("SELECT reference_id FROM points_ledger WHERE user_id = $1 AND reference_id LIKE 'mission:%'")) {
      const uid = String(params[0]);
      const dayKey = String(params[1]);
      const rows = state.ledger
        .filter((l) => l.user_id === uid && l.reference_id.startsWith(`mission:${uid}:${dayKey}:`))
        .map((l) => ({ reference_id: l.reference_id }));
      return { rows, rowCount: rows.length };
    }

    if (sql.includes('FROM points_ledger WHERE user_id = $1') && sql.includes('reference_id = ANY')) {
      const uid = String(params[0]);
      const refs: string[] = params[1] || [];
      const toLikeRegex = (pat: string) =>
        new RegExp('^' + pat.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$');
      const re = params[2] ? toLikeRegex(String(params[2])) : null;
      const pStart = params[3] instanceof Date ? params[3].getTime() : null;
      const pEnd = params[4] instanceof Date ? params[4].getTime() : null;
      const rows = state.ledger
        .filter((l) => {
          if (l.user_id !== uid) return false;
          if (refs.includes(l.reference_id)) return true;
          if (re && pStart !== null && pEnd !== null) {
            const ts = l.created_at.getTime();
            return re.test(l.reference_id) && ts >= pStart && ts < pEnd;
          }
          return false;
        })
        .map((l) => ({ reference_id: l.reference_id, created_at: l.created_at }));
      return { rows, rowCount: rows.length };
    }

    if (sql.includes('FROM points_ledger WHERE user_id = $1') && sql.includes('reference_id LIKE $2')) {
      const uid = String(params[0]);
      const toLikeRegex = (pat: string) =>
        new RegExp('^' + pat.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$');
      const re1 = toLikeRegex(String(params[1] || ''));
      const re2 = params.length >= 3 && params[2] ? toLikeRegex(String(params[2])) : null;
      const pStart = params.length >= 5 && params[3] instanceof Date ? params[3].getTime() : null;
      const pEnd = params.length >= 5 && params[4] instanceof Date ? params[4].getTime() : null;
      const rows = state.ledger
        .filter((l) => {
          if (l.user_id !== uid) return false;
          if (re1.test(l.reference_id)) return true;
          if (re2 && re2.test(l.reference_id)) {
            if (pStart !== null && pEnd !== null) {
              const ts = l.created_at.getTime();
              return ts >= pStart && ts < pEnd;
            }
            return true;
          }
          return false;
        })
        .map((l) => ({ reference_id: l.reference_id, created_at: l.created_at }));
      return { rows, rowCount: rows.length };
    }

    if (sql.includes('FROM points_ledger WHERE user_id = $1') && sql.includes('AS today_earned')) {
      const uid = String(params[0]);
      const dateArgs = params.filter((p) => p instanceof Date) as Date[];
      const pStart = dateArgs.length >= 2 ? dateArgs[0].getTime() : null;
      const pEnd = dateArgs.length >= 2 ? dateArgs[1].getTime() : null;
      const checkinExact =
        typeof params[1] === 'string' && params[1].startsWith('checkin:') ? params[1] : null;
      const dayKey = getJakartaDateKey();

      let totalEarn = 0;
      let lifetimeEarnedForLevel = 0;
      let totalRedeem = 0;
      let todayEarned = 0;
      let todayWatchPts = 0;
      let lastClaim: Date | null = null;
      let lastWatchMission: Date | null = null;
      let checkinToday = false;
      let ledgerCount = 0;

      for (const l of state.ledger) {
        if (l.user_id !== uid) continue;
        ledgerCount += 1;
        const ts = l.created_at.getTime();
        const inCurrentPeriod =
          pStart !== null && pEnd !== null
            ? ts >= pStart && ts < pEnd
            : getJakartaDateKey(l.created_at) === dayKey;
        if (l.type === 'earn') {
          totalEarn += l.points;
          if (!l.reference_id.startsWith('refund:payout:')) {
            lifetimeEarnedForLevel += l.points;
            if (inCurrentPeriod && !l.reference_id.startsWith('welcome_login:')) {
              todayEarned += l.points;
            }
          }
          if (
            (l.reference_id.startsWith('mission_') ||
              l.reference_id.startsWith('mission:') ||
              l.reference_id.startsWith('watch_min:') ||
              l.reference_id.startsWith('watchmin:')) &&
            inCurrentPeriod
          ) {
            todayWatchPts += l.points;
            if (!lastWatchMission || l.created_at > lastWatchMission) {
              lastWatchMission = l.created_at;
            }
          }
          if (l.reference_id.startsWith('checkin:') || l.reference_id.startsWith('watch:')) {
            if (!lastClaim || l.created_at > lastClaim) {
              lastClaim = l.created_at;
            }
          }
          if (
            (checkinExact && l.reference_id === checkinExact) ||
            (l.reference_id.startsWith(`checkin:${uid}:`) && inCurrentPeriod)
          ) {
            checkinToday = true;
          }
        } else {
          totalRedeem += l.points;
        }
      }

      return {
        rows: [
          {
            balance: String(totalEarn - totalRedeem),
            total_earned: String(totalEarn),
            lifetime_earned_for_level: String(lifetimeEarnedForLevel),
            total_redeemed: String(totalRedeem),
            today_earned: String(todayEarned),
            today_watch_points: String(todayWatchPts),
            today_watch_points_earned: String(todayWatchPts),
            last_claim_at: lastClaim,
            last_watch_mission_at: lastWatchMission,
            checkin_today: checkinToday,
            ledger_total: String(ledgerCount),
          },
        ],
        rowCount: 1,
      };
    }

    if (sql.includes('AS balance FROM points_ledger WHERE user_id = $1') ||
        sql.includes('::text AS balance FROM points_ledger WHERE user_id = $1')) {
      return {
        rows: [{ balance: String(userBalance(String(params[0]))) }],
        rowCount: 1,
      };
    }

    if (sql.startsWith('SELECT COUNT(*)::text AS cnt FROM points_ledger WHERE user_id = $1')) {
      const uid = String(params[0]);
      return {
        rows: [{ cnt: String(state.ledger.filter((l) => l.user_id === uid).length) }],
        rowCount: 1,
      };
    }

    if (sql.includes('FROM points_ledger WHERE user_id = $1 ORDER BY created_at DESC')) {
      const uid = String(params[0]);
      const limit = Number(params[1] || 20);
      const offset = Number(params[2] || 0);
      const rows = state.ledger
        .filter((l) => l.user_id === uid)
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .slice(offset, offset + limit);
      return { rows, rowCount: rows.length };
    }

    if (sql.startsWith('INSERT INTO points_ledger')) {
      const isWatchMissionMin = params.length === 4;
      let row: MemLedger;
      if (isWatchMissionMin) {
        const refId = String(params[3]);
        if (state.ledger.some((l) => l.reference_id === refId)) {
          return { rows: [], rowCount: 0 };
        }
        const uid = String(params[1]);
        const pts = Number(params[2]);
        const balAfter = userBalance(uid) + pts;
        row = {
          id: String(params[0]),
          user_id: uid,
          type: 'earn',
          points: pts,
          description: 'Misi Nonton Aktif Harian',
          reference_id: refId,
          balance_after: balAfter,
          created_at: new Date(),
        };
      } else {
        const hasType = sql.includes("'earn'") || sql.includes("'redeem'");
        if (sql.includes(", 'earn',")) {
          const refId = String(params[4]);
          if (state.ledger.some((l) => l.reference_id === refId)) {
            return { rows: [], rowCount: 0 };
          }
          row = {
            id: String(params[0]),
            user_id: String(params[1]),
            type: 'earn',
            points: Number(params[2]),
            description: String(params[3]),
            reference_id: refId,
            balance_after: Number(params[5]),
            created_at: new Date(),
          };
        } else if (sql.includes(", 'redeem',")) {
          row = {
            id: String(params[0]),
            user_id: String(params[1]),
            type: 'redeem',
            points: Number(params[2]),
            description: String(params[3]),
            reference_id: String(params[4]),
            balance_after: Number(params[5]),
            created_at: new Date(),
          };
        } else if (hasType) {
          throw new Error(`Unhandled INSERT points_ledger SQL: ${sql}`);
        } else {
          throw new Error(`Unhandled INSERT points_ledger SQL: ${sql}`);
        }
      }
      state.ledger.push(row);
      return { rows: [row], rowCount: 1 };
    }

    // 9. Payout Requests queries
    if (sql.includes('FROM payout_requests WHERE user_id = $1 AND idempotency_key = $2')) {
      const hit = state.payouts.find(
        (p) => p.user_id === String(params[0]) && p.idempotency_key === String(params[1])
      );
      return { rows: hit ? [hit] : [], rowCount: hit ? 1 : 0 };
    }

    if (sql.includes('COALESCE(SUM(CASE WHEN status IN')) {
      const uid = String(params[0]);
      let held = 0;
      let withdrawn = 0;
      for (const p of state.payouts) {
        if (p.user_id !== uid) continue;
        if (['pending', 'processing', 'approved'].includes(p.status)) held += p.points_spent;
        if (['paid', 'completed'].includes(p.status)) withdrawn += p.points_spent;
      }
      return { rows: [{ total_held: String(held), total_withdrawn: String(withdrawn) }], rowCount: 1 };
    }

    if (sql.startsWith('SELECT COUNT(*)::text AS cnt FROM payout_requests WHERE user_id = $1')) {
      const uid = String(params[0]);
      return {
        rows: [{ cnt: String(state.payouts.filter((p) => p.user_id === uid).length) }],
        rowCount: 1,
      };
    }

    if (sql.includes('FROM payout_requests WHERE user_id = $1 ORDER BY created_at DESC')) {
      const uid = String(params[0]);
      const limit = Number(params[1] || 15);
      const offset = Number(params[2] || 0);
      const rows = state.payouts
        .filter((p) => p.user_id === uid)
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .slice(offset, offset + limit);
      return { rows, rowCount: rows.length };
    }

    if (sql.includes('SELECT DISTINCT user_id FROM payout_requests WHERE LOWER(destination_account)')) {
      const dest = String(params[0]).toLowerCase();
      const uid = String(params[1]);
      const hits = Array.from(
        new Set(
          state.payouts
            .filter((p) => p.destination_account.toLowerCase() === dest && p.user_id !== uid)
            .map((p) => p.user_id)
        )
      ).map((u) => ({ user_id: u }));
      return { rows: hits, rowCount: hits.length };
    }

    if (sql.startsWith('INSERT INTO payout_requests')) {
      const rec: MemPayout = {
        id: String(params[0]),
        user_id: String(params[1]),
        points_spent: Number(params[2]),
        usd_amount: String(params[3]),
        idr_amount: String(params[4]),
        fx_rate_used: String(params[5]),
        currency: String(params[6]),
        method: String(params[7]),
        bank_code: String(params[8]),
        network: String(params[9]),
        destination_account: String(params[10]),
        account_holder_name: String(params[11]),
        status: 'pending',
        admin_note: '',
        idempotency_key: params[12] ? String(params[12]) : null,
        risk_flag: String(params[13] || ''),
        suspicious_reason: String(params[14] || ''),
        created_at: new Date(),
        updated_at: new Date(),
      };
      state.payouts.push(rec);
      return { rows: [rec], rowCount: 1 };
    }

    if (sql === 'SELECT * FROM payout_requests WHERE id = $1 FOR UPDATE') {
      const p = state.payouts.find((x) => x.id === String(params[0]));
      return { rows: p ? [p] : [], rowCount: p ? 1 : 0 };
    }

    if (sql.startsWith('UPDATE payout_requests SET status = $2')) {
      const p = state.payouts.find((x) => x.id === String(params[0]));
      if (!p) return { rows: [], rowCount: 0 };
      p.status = String(params[1]);
      if (params[2]) p.admin_note = String(params[2]);
      p.updated_at = new Date();
      return { rows: [p], rowCount: 1 };
    }

    if (sql.startsWith('SELECT COUNT(*)::text AS cnt FROM payout_requests WHERE status = $1')) {
      const targetStatus = String(params[0]);
      return {
        rows: [{ cnt: String(state.payouts.filter((p) => p.status === targetStatus).length) }],
        rowCount: 1,
      };
    }

    if (sql === 'SELECT COUNT(*)::text AS cnt FROM payout_requests') {
      return {
        rows: [{ cnt: String(state.payouts.length) }],
        rowCount: 1,
      };
    }

    if (sql.includes('FROM payout_requests p LEFT JOIN users u')) {
      if (sql.includes('SELECT p.*,')) {
        const hasStatusFilter = sql.includes('WHERE p.status = $1');
        const targetStatus = hasStatusFilter ? String(params[0]) : null;
        const limit = Number(hasStatusFilter ? params[1] : params[0]) || 50;
        const offset = Number(hasStatusFilter ? params[2] : params[1]) || 0;
        const rows = state.payouts
          .filter((p) => !targetStatus || p.status === targetStatus)
          .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
          .slice(offset, offset + limit)
          .map((p) => {
            const u = state.users.get(p.user_id);
            const tel = state.telemetry.get(p.user_id);
            const sig = state.securitySignals.get(p.user_id);
            return {
              ...p,
              user_name: u?.display_name || null,
              user_email: u?.email || null,
              verified_watch_seconds: tel?.verified_watch_seconds ?? 0,
              fast_delta_strikes: tel?.fast_delta_strikes ?? 0,
              concurrent_tab_strikes: tel?.concurrent_tab_strikes ?? 0,
              signal_risk_flag: sig?.risk_flag || tel?.risk_flag || '',
              signal_suspicious_reason: sig?.suspicious_reason || tel?.suspicious_reason || '',
            };
          });
        return { rows, rowCount: rows.length };
      }

      const rows = state.payouts
        .filter((p) => ['approved', 'paid', 'completed'].includes(p.status))
        .sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime())
        .map((p) => ({
          ...p,
          user_name: state.users.get(p.user_id)?.display_name || 'User',
          display_name: state.users.get(p.user_id)?.display_name || 'User',
        }));
      return { rows, rowCount: rows.length };
    }

    // 10. Referrals queries
    if (sql.startsWith('SELECT status FROM referrals WHERE referee_uid = $1')) {
      const hit = state.referrals.find((r) => r.referee_uid === String(params[0]));
      return { rows: hit ? [{ status: hit.status }] : [], rowCount: hit ? 1 : 0 };
    }

    if (sql.startsWith('SELECT id FROM referrals WHERE referee_device_hash = $1')) {
      const hit = state.referrals.find((r) => r.referee_device_hash === String(params[0]));
      return { rows: hit ? [{ id: hit.id }] : [], rowCount: hit ? 1 : 0 };
    }

    if (sql.includes("AS daily_cnt,") && sql.includes("FROM referrals WHERE referrer_uid = $1")) {
      const refUid = String(params[0]);
      const now = Date.now();
      const daily = state.referrals.filter(
        (r) => r.referrer_uid === refUid && now - r.created_at.getTime() < 86_400_000
      ).length;
      const weekly = state.referrals.filter(
        (r) => r.referrer_uid === refUid && now - r.created_at.getTime() < 7 * 86_400_000
      ).length;
      return { rows: [{ daily_cnt: String(daily), weekly_cnt: String(weekly) }], rowCount: 1 };
    }

    if (sql.startsWith('INSERT INTO referrals')) {
      const rec: MemReferral = {
        id: String(params[0]),
        referrer_uid: String(params[1]),
        referee_uid: String(params[2]),
        referral_code: String(params[3]),
        status: sql.includes("'rejected_fraud'") ? 'rejected_fraud' : 'pending_watch',
        bonus_points: Number(params[4]),
        referee_ip_hash: String(params[5] || ''),
        referee_subnet_hash: String(params[6] || ''),
        referee_ua_hash: String(params[7] || ''),
        referee_device_hash: String(params[8] || ''),
        risk_flag: sql.includes("'rejected_fraud'") ? String(params[9] || '') : '',
        suspicious_reason: sql.includes("'rejected_fraud'") ? String(params[10] || '') : '',
        qualified_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      state.referrals.push(rec);
      return { rows: [], rowCount: 1 };
    }

    if (sql.includes("FROM referrals WHERE referee_uid = $1 AND status = 'pending_watch'")) {
      const r = state.referrals.find(
        (x) => x.referee_uid === String(params[0]) && x.status === 'pending_watch'
      );
      return {
        rows: r ? [{ id: r.id, referrer_uid: r.referrer_uid, bonus_points: r.bonus_points }] : [],
        rowCount: r ? 1 : 0,
      };
    }

    if (sql.includes('FROM referrals WHERE referee_uid = $1 LIMIT 1')) {
      const r = state.referrals.find((x) => x.referee_uid === String(params[0]));
      return { rows: r ? [r] : [], rowCount: r ? 1 : 0 };
    }

    if (sql.startsWith('UPDATE referrals SET status = $2') ||
        sql.includes("UPDATE referrals SET status = 'qualified'")) {
      const r = state.referrals.find((x) => x.id === String(params[0]));
      if (r) {
        const nextStatus = sql.includes("status = 'qualified'") ? 'qualified' : params[1];
        r.status = nextStatus;
        if (nextStatus === 'qualified') {
          r.qualified_at = new Date();
        } else {
          r.risk_flag = String(params[2] || params[1] || '');
          r.suspicious_reason = String(params[3] || '');
        }
        r.updated_at = new Date();
      }
      return { rows: [], rowCount: r ? 1 : 0 };
    }

    if (sql.startsWith("UPDATE referrals SET status = 'rejected_fraud'")) {
      const r = state.referrals.find((x) => x.id === String(params[0]));
      if (r) {
        r.status = 'rejected_fraud';
        r.risk_flag = String(params[1] || '');
        r.updated_at = new Date();
      }
      return { rows: [], rowCount: r ? 1 : 0 };
    }

    if (sql.includes('FROM referrals r LEFT JOIN users u ON u.uid = r.referee_uid')) {
      const uid = String(params[0]);
      const rows = state.referrals
        .filter((r) => r.referrer_uid === uid)
        .map((r) => ({
          id: r.id,
          referee_uid: r.referee_uid,
          referee_name: state.users.get(r.referee_uid)?.display_name || 'Viewer',
          status: r.status,
          bonus_points: r.bonus_points,
          verified_watch_seconds: state.telemetry.get(r.referee_uid)?.verified_watch_seconds ?? 0,
          risk_flag: r.risk_flag,
          qualified_at: r.qualified_at,
          created_at: r.created_at,
        }));
      return { rows, rowCount: rows.length };
    }

    // Left joins in createPayoutRequest / referral lookup
    if (sql.includes('FROM (SELECT $1::text AS uid) base')) {
      const uid = String(params[0]);
      const s = state.securitySignals.get(uid);
      const t = state.telemetry.get(uid);
      return {
        rows: [
          {
            sec_risk: s?.risk_flag ?? null,
            sec_reason: s?.suspicious_reason ?? null,
            tel_risk: t?.risk_flag ?? null,
            tel_reason: t?.suspicious_reason ?? null,
          },
        ],
        rowCount: 1,
      };
    }

    // Non-points catalog/cache/SSR background reads return empty rows cleanly
    if (
      sql.includes('FROM drama_catalog') ||
      sql.includes('FROM movies') ||
      sql.includes('FROM home_cache') ||
      sql.includes('FROM api_response_cache') ||
      sql.includes('FROM lk21_cache') ||
      sql.includes('FROM video_stats')
    ) {
      return { rows: [], rowCount: 0 };
    }

    throw new Error(`Unexpected SQL in mock: ${sql}`);
  }

  const mockPool: any = {
    query: async (sql: string, params?: any[]) => runQuery(sql, params),
    connect: async () => ({
      query: async (sql: string, params?: any[]) => runQuery(sql, params),
      release: () => {},
    }),
  };

  return { state, mockPool };
}

test('KanoDrama Points, Anti-Cheat, Referral, Withdrawal & SEO Full Audit', async (t) => {
  const { app } = await createServerApp({ enableVite: false });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(() => {
    _setDbPoolForTest(null);
    server.close();
  });

  const aliceToken = signAuthSessionToken({
    uid: 'user-alice',
    email: 'alice@example.com',
    displayName: 'Alice Drama',
    photoURL: null,
  });
  const bobToken = signAuthSessionToken({
    uid: 'user-bob',
    email: 'bob@example.com',
    displayName: 'Bob Viewer',
    photoURL: null,
  });
  const sameEmailCloneToken = signAuthSessionToken({
    uid: 'user-alice-clone',
    email: 'ALICE@example.com',
    displayName: 'Alice Clone',
    photoURL: null,
  });
  const eveToken = signAuthSessionToken({
    uid: 'user-eve',
    email: 'eve@example.com',
    displayName: 'Eve Intruder',
    photoURL: null,
  });

  await t.test('1. Honest HTTP 503 diagnostic response when PostgreSQL is unconfigured', async () => {
    _setDbPoolForTest(null);

    const cfgRes = await fetch(`${baseUrl}/api/points/config`).then((r) => r.json());
    assert.equal(cfgRes.ok, true);
    assert.equal(cfgRes.dbConnected, false);
    assert.equal(cfgRes.banks.length, 10);
    assert.equal(cfgRes.usdtNetworks.length, 4);

    const meRes = await fetch(`${baseUrl}/api/points/me`, {
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    assert.equal(meRes.status, 503);
    const meJson = await meRes.json();
    assert.equal(meJson.ok, false);
    assert.equal(meJson.code, 'DATABASE_NOT_CONFIGURED');
    assert.deepEqual(meJson.requiredConfig, ['DATABASE_URL']);

    const checkinRes = await fetch(`${baseUrl}/api/points/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken}`,
      },
      body: JSON.stringify({ action: 'daily_checkin' }),
    });
    assert.equal(checkinRes.status, 503);
  });

  await t.test('2. Permanent DB Check-in, WIB Streak Progression & Duplicate Prevention', async () => {
    const { state, mockPool } = createStatefulPgMock();
    _setDbPoolForTest(mockPool);

    state.users.set('user-alice', {
      uid: 'user-alice',
      email: 'alice@example.com',
      display_name: 'Alice Drama',
      referral_code: 'KDA11CE01',
      referred_by: null,
      streak_count: 1,
      last_visit_date: '',
      is_vip: false,
    });

    // Seed yesterday check-in with streak 6 -> today should advance to streak 7
    const yestKey = getJakartaDateKey(new Date(Date.now() - 86_400_000));
    state.checkins.push({
      user_id: 'user-alice',
      checkin_date: yestKey,
      streak_day: 6,
      points_awarded: 100,
      ledger_id: 'prev-checkin',
      created_at: new Date(Date.now() - 86_400_000),
    });

    const first = await fetch(`${baseUrl}/api/points/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken}`,
      },
      body: JSON.stringify({ action: 'daily_checkin' }),
    });
    assert.equal(first.status, 200);
    const firstBody = await first.json();
    assert.equal(firstBody.ok, true);
    assert.equal(firstBody.awardedPoints, 500);
    assert.equal(firstBody.streakDay, 7);
    assert.equal(firstBody.summary.balance, 500);

    // Duplicate same WIB day must fail cleanly with 409
    const dup = await fetch(`${baseUrl}/api/points/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken}`,
      },
      body: JSON.stringify({ action: 'daily_checkin' }),
    });
    assert.equal(dup.status, 409);
    const dupBody = await dup.json();
    assert.equal(dupBody.reason, 'duplicate_claim');
  });

  await t.test('3. Watch Session, Anti-Cheat Telemetry, Buffering/Speed/Seek/Replay/Multi-Tab & Episode Bonus Uniqueness', async () => {
    const { state, mockPool } = createStatefulPgMock();
    _setDbPoolForTest(mockPool);

    // Issue watch session token
    const sessRes = await fetch(`${baseUrl}/api/watch/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken}`,
      },
      body: JSON.stringify({
        dramaId: 'd-101',
        provider: 'DramaBox',
        episodeNumber: 3,
      }),
    });
    assert.equal(sessRes.status, 201);
    const sessJson = await sessRes.json();
    assert.ok(sessJson.sessionToken);

    // Reject premature episode bonus claim (< 15s active verified watch)
    const prematureClaim = await fetch(`${baseUrl}/api/points/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken}`,
      },
      body: JSON.stringify({
        action: 'watch_episode',
        dramaId: 'd-101',
        provider: 'DramaBox',
        episodeNumber: 3,
        sessionToken: sessJson.sessionToken,
      }),
    });
    assert.equal(prematureClaim.status, 400);
    assert.equal((await prematureClaim.json()).reason, 'watch_duration_insufficient');

    // Baseline heartbeat seq=1
    const hb1 = await fetch(`${baseUrl}/api/watch/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken}`,
      },
      body: JSON.stringify({
        sessionToken: sessJson.sessionToken,
        seq: 1,
        dramaId: 'd-101',
        provider: 'DramaBox',
        episodeNumber: 3,
        currentTimeSec: 5,
        isPlaying: true,
        isBuffering: false,
        tabVisible: true,
        playbackRate: 1,
      }),
    });
    assert.equal(hb1.status, 200);
    assert.equal((await hb1.json()).reason, 'session_started');

    // Replay attack: repeating seq=1 blocked (409)
    const replay = await fetch(`${baseUrl}/api/watch/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken}`,
      },
      body: JSON.stringify({
        sessionToken: sessJson.sessionToken,
        seq: 1,
        dramaId: 'd-101',
        provider: 'DramaBox',
        episodeNumber: 3,
        currentTimeSec: 15,
        isPlaying: true,
        isBuffering: false,
        tabVisible: true,
        playbackRate: 1,
      }),
    });
    assert.equal(replay.status, 409);

    // Multi-tab concurrent stream attempt blocked (429)
    const tab2 = await startWatchSessionInDb({
      userId: 'user-alice',
      mediaKey: 'DramaBox:d-202:ep1',
      provider: 'DramaBox',
      dramaId: 'd-202',
      episodeNumber: 1,
    });
    const concurrentRes = await fetch(`${baseUrl}/api/watch/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken}`,
      },
      body: JSON.stringify({
        sessionToken: tab2.sessionToken,
        seq: 1,
        dramaId: 'd-202',
        provider: 'DramaBox',
        episodeNumber: 1,
        currentTimeSec: 5,
        isPlaying: true,
        isBuffering: false,
        tabVisible: true,
        playbackRate: 1,
      }),
    });
    assert.equal(concurrentRes.status, 429);
    assert.equal((await concurrentRes.json()).reason, 'concurrent_stream_detected');

    // Simulate 20s elapsed wall clock -> seek jump (+300s forward) must award 0s
    const tel = state.telemetry.get('user-alice')!;
    tel.last_heartbeat_at = new Date(Date.now() - 20_000);
    const seekRes = await recordWatchHeartbeatInDb({
      userId: 'user-alice',
      streamSessionId: sessJson.sessionToken,
      mediaKey: 'DramaBox:d-101:ep3',
      currentTimeSec: 325,
      isPlaying: true,
      isBuffering: false,
      tabVisible: true,
      playbackRate: 1,
      seq: 2,
      ipHash: 'ip1',
      subnetHash: 'sub1',
      uaHash: 'ua1',
      deviceHash: 'dev1',
    });
    assert.equal(seekRes.reason, 'seek_jump_ignored');
    assert.equal(seekRes.addedSeconds, 0);

    // Speed manipulation (2.0x) rejected cleanly with 0s
    const fastSpeedRes = await recordWatchHeartbeatInDb({
      userId: 'user-alice',
      streamSessionId: sessJson.sessionToken,
      mediaKey: 'DramaBox:d-101:ep3',
      currentTimeSec: 340,
      isPlaying: true,
      isBuffering: false,
      tabVisible: true,
      playbackRate: 2.0,
      seq: 3,
      ipHash: 'ip1',
      subnetHash: 'sub1',
      uaHash: 'ua1',
      deviceHash: 'dev1',
    });
    assert.equal(fastSpeedRes.reason, 'invalid_playback_speed');
    assert.equal(fastSpeedRes.addedSeconds, 0);

    // Buffering pauses counter with 0s
    const bufRes = await recordWatchHeartbeatInDb({
      userId: 'user-alice',
      streamSessionId: sessJson.sessionToken,
      mediaKey: 'DramaBox:d-101:ep3',
      currentTimeSec: 340,
      isPlaying: true,
      isBuffering: true,
      tabVisible: true,
      playbackRate: 1,
      seq: 4,
      ipHash: 'ip1',
      subnetHash: 'sub1',
      uaHash: 'ua1',
      deviceHash: 'dev1',
    });
    assert.equal(bufRes.reason, 'buffering');
    assert.equal(bufRes.addedSeconds, 0);

    // Re-anchor + legitimate 20s playback -> awards 20s and unlocks episode claim
    await recordWatchHeartbeatInDb({
      userId: 'user-alice',
      streamSessionId: sessJson.sessionToken,
      mediaKey: 'DramaBox:d-101:ep3',
      currentTimeSec: 340,
      isPlaying: true,
      isBuffering: false,
      tabVisible: true,
      playbackRate: 1,
      seq: 5,
      ipHash: 'ip1',
      subnetHash: 'sub1',
      uaHash: 'ua1',
      deviceHash: 'dev1',
    });
    state.telemetry.get('user-alice')!.last_heartbeat_at = new Date(Date.now() - 20_000);
    const valid20 = await recordWatchHeartbeatInDb({
      userId: 'user-alice',
      streamSessionId: sessJson.sessionToken,
      mediaKey: 'DramaBox:d-101:ep3',
      currentTimeSec: 360,
      isPlaying: true,
      isBuffering: false,
      tabVisible: true,
      playbackRate: 1,
      seq: 6,
      ipHash: 'ip1',
      subnetHash: 'sub1',
      uaHash: 'ua1',
      deviceHash: 'dev1',
    });
    assert.equal(valid20.reason, 'counted');
    assert.equal(valid20.addedSeconds, 20);

    // Episode bonus now succeeds once (+200 pts), second claim blocked (409)
    const epClaim1 = await fetch(`${baseUrl}/api/points/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken}`,
      },
      body: JSON.stringify({
        action: 'watch_episode',
        dramaId: 'd-101',
        provider: 'DramaBox',
        episodeNumber: 3,
        sessionToken: sessJson.sessionToken,
      }),
    });
    assert.equal(epClaim1.status, 200);
    assert.equal((await epClaim1.json()).awardedPoints, 200);

    const epClaimDup = await fetch(`${baseUrl}/api/points/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken}`,
      },
      body: JSON.stringify({
        action: 'watch_episode',
        dramaId: 'd-101',
        provider: 'DramaBox',
        episodeNumber: 3,
        sessionToken: sessJson.sessionToken,
      }),
    });
    assert.equal(epClaimDup.status, 409);
  });

  await t.test('4. Production Referral URL, Self/Clone Referral Block & 1h Verification Bonus', async () => {
    const { state, mockPool } = createStatefulPgMock();
    _setDbPoolForTest(mockPool);

    assert.equal(
      getProductionReferralUrl('KDA11CE01'),
      'https://kano-drama.live/?ref=KDA11CE01'
    );

    state.users.set('user-alice', {
      uid: 'user-alice',
      email: 'alice@example.com',
      display_name: 'Alice Drama',
      referral_code: 'KDA11CE01',
      referred_by: null,
      streak_count: 1,
      last_visit_date: '',
      is_vip: false,
    });
    state.users.set('user-alice-clone', {
      uid: 'user-alice-clone',
      email: 'alice@example.com',
      display_name: 'Alice Clone',
      referral_code: 'KDC10AE01',
      referred_by: null,
      streak_count: 1,
      last_visit_date: '',
      is_vip: false,
    });
    state.users.set('user-bob', {
      uid: 'user-bob',
      email: 'bob@example.com',
      display_name: 'Bob Viewer',
      referral_code: 'KDB0B0001',
      referred_by: null,
      streak_count: 1,
      last_visit_date: '',
      is_vip: false,
    });

    // Record distinct baseline fingerprint for Alice
    await fetch(`${baseUrl}/api/points/me`, {
      headers: {
        Authorization: `Bearer ${aliceToken}`,
        'X-Forwarded-For': '203.0.113.10',
        'User-Agent': 'AliceDevice/1.0',
        'x-device-fingerprint': 'fp-alice-device-001',
      },
    });

    // Self-referral blocked
    const selfRes = await fetch(`${baseUrl}/api/referrals/bind`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken}`,
        'X-Forwarded-For': '203.0.113.10',
        'x-device-fingerprint': 'fp-alice-device-001',
      },
      body: JSON.stringify({ referralCode: 'KDA11CE01' }),
    }).then((r) => r.json());
    assert.equal(selfRes.bound, false);
    assert.equal(selfRes.reason, 'self_referral');

    // Same email clone blocked
    const cloneRes = await fetch(`${baseUrl}/api/referrals/bind`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sameEmailCloneToken}`,
        'X-Forwarded-For': '198.51.100.77',
        'x-device-fingerprint': 'fp-clone-device-002',
      },
      body: JSON.stringify({ referralCode: 'KDA11CE01' }),
    }).then((r) => r.json());
    assert.equal(cloneRes.bound, false);
    assert.equal(cloneRes.reason, 'self_referral');

    // Legitimate friend Bob on distinct IP/device binds cleanly
    const bobBind = await fetch(`${baseUrl}/api/referrals/bind`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bobToken}`,
        'X-Forwarded-For': '198.51.100.88',
        'User-Agent': 'BobDevice/2.0',
        'x-device-fingerprint': 'fp-bob-device-003',
      },
      body: JSON.stringify({ referralCode: 'KDA11CE01' }),
    }).then((r) => r.json());
    assert.equal(bobBind.bound, true);
    assert.equal(bobBind.status, 'pending_watch');

    // Simulate Bob crossing 3600s verified watch time
    const bobSess = await startWatchSessionInDb({
      userId: 'user-bob',
      mediaKey: 'DramaBoxV2:d-99:ep1',
      provider: 'DramaBoxV2',
      dramaId: 'd-99',
      episodeNumber: 1,
    });
    const todayKey = getJakartaDateKey();
    state.telemetry.set('user-bob', {
      user_id: 'user-bob',
      verified_watch_seconds: 3590,
      today_watch_seconds: 3590,
      today_date_key: todayKey,
      active_stream_session_id: bobSess.sessionToken,
      active_stream_media_key: 'DramaBoxV2:d-99:ep1',
      last_heartbeat_at: new Date(Date.now() - 20_000),
      last_video_time_sec: '100',
      fast_delta_strikes: 0,
      concurrent_tab_strikes: 0,
      risk_flag: '',
      suspicious_reason: '',
      updated_at: new Date(),
    });
    const qualHb = await recordWatchHeartbeatInDb({
      userId: 'user-bob',
      streamSessionId: bobSess.sessionToken,
      mediaKey: 'DramaBoxV2:d-99:ep1',
      currentTimeSec: 120,
      isPlaying: true,
      isBuffering: false,
      tabVisible: true,
      playbackRate: 1,
      seq: 1,
      ipHash: 'bob-ip',
      subnetHash: 'bob-sub',
      uaHash: 'bob-ua',
      deviceHash: 'bob-dev',
    });
    assert.equal(qualHb.referralQualified, true);

    // Verify Alice received +5000 referral bonus AND Bob received auto 20 pts/min (1200 pts) with milestones ready to claim
    const aliceMe = await fetch(`${baseUrl}/api/points/me`, {
      headers: { Authorization: `Bearer ${aliceToken}` },
    }).then((r) => r.json());
    assert.equal(aliceMe.summary.balance, 5000);

    const bobMe = await fetch(`${baseUrl}/api/points/me`, {
      headers: { Authorization: `Bearer ${bobToken}` },
    }).then((r) => r.json());
    assert.equal(bobMe.summary.todayWatchPointsEarned, 1200);
    assert.ok(bobMe.summary.milestones.every((m: any) => m.reached === true && m.claimed === false));
  });

  await t.test('5. Withdrawals, Idempotency, Bank/USDT Validation, IDOR & Admin Single-Refund', async () => {
    const { state, mockPool } = createStatefulPgMock();
    _setDbPoolForTest(mockPool);

    state.users.set('user-alice', {
      uid: 'user-alice',
      email: 'alice@example.com',
      display_name: 'Alice Drama',
      referral_code: 'KDALICE01',
      referred_by: null,
      streak_count: 1,
      last_visit_date: '',
      is_vip: false,
    });
    state.ledger.push({
      id: 'seed-600k',
      user_id: 'user-alice',
      type: 'earn',
      points: 600_000,
      description: 'Seed verified balance',
      reference_id: 'seed:alice:1',
      balance_after: 600_000,
      created_at: new Date(),
    });

    // IDOR guard: Eve cannot read Alice's ledger or payouts
    const idorLedger = await fetch(
      `${baseUrl}/api/points/ledger?userId=user-alice`,
      { headers: { Authorization: `Bearer ${eveToken}` } }
    );
    assert.equal(idorLedger.status, 403);

    // Invalid BCA digit count (8 digits instead of 10) rejected
    const badBank = await fetch(`${baseUrl}/api/points/redeem`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken}`,
      },
      body: JSON.stringify({
        method: 'bank_transfer',
        bankCode: 'BCA',
        pointsSpent: 274726,
        destinationAccount: '12345678',
        accountHolderName: 'Alice Drama',
        idempotencyKey: 'wd-bad-bank',
      }),
    });
    assert.equal(badBank.status, 400);

    // Valid BCA 10 digits withdrawal with idempotency key succeeds (201)
    const goodBank = await fetch(`${baseUrl}/api/points/redeem`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken}`,
      },
      body: JSON.stringify({
        method: 'bank_transfer',
        bankCode: 'BCA',
        pointsSpent: 300000,
        destinationAccount: '1234567890',
        accountHolderName: 'Alice Drama',
        idempotencyKey: 'wd-bca-idem-1',
      }),
    });
    assert.equal(goodBank.status, 201);
    const goodBankJson = await goodBank.json();
    assert.equal(goodBankJson.payout.status, 'pending');
    assert.equal(goodBankJson.summary.balance, 300000);
    assert.equal(goodBankJson.summary.totalHeld, 300000);

    // Double-submit with same idempotencyKey returns deduplicated 200 without second debit
    const replayBank = await fetch(`${baseUrl}/api/points/redeem`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken}`,
      },
      body: JSON.stringify({
        method: 'bank_transfer',
        bankCode: 'BCA',
        pointsSpent: 300000,
        destinationAccount: '1234567890',
        accountHolderName: 'Alice Drama',
        idempotencyKey: 'wd-bca-idem-1',
      }),
    });
    assert.equal(replayBank.status, 200);
    const replayBankJson = await replayBank.json();
    assert.equal(replayBankJson.deduplicated, true);
    assert.equal(replayBankJson.summary.balance, 300000);

    // Admin transitions pending -> processing -> failed (atomic single refund)
    const payoutId = goodBankJson.payout.id;
    const stepProc = await fetch(`${baseUrl}/api/admin/payouts/${payoutId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': 'test-admin-secret-999',
      },
      body: JSON.stringify({ status: 'processing', adminNote: 'Disbursing BCA' }),
    });
    assert.equal(stepProc.status, 200);

    const stepFail = await fetch(`${baseUrl}/api/admin/payouts/${payoutId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': 'test-admin-secret-999',
      },
      body: JSON.stringify({ status: 'failed', adminNote: 'Invalid beneficiary' }),
    });
    assert.equal(stepFail.status, 200);
    const failJson = await stepFail.json();
    assert.equal(failJson.refunded, true);

    // Repeated terminal transition blocked (409 already_finalized) & balance back to 600,000
    const repeatFail = await fetch(`${baseUrl}/api/admin/payouts/${payoutId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': 'test-admin-secret-999',
      },
      body: JSON.stringify({ status: 'rejected' }),
    });
    assert.equal(repeatFail.status, 409);

    const finalMe = await fetch(`${baseUrl}/api/points/me`, {
      headers: { Authorization: `Bearer ${aliceToken}` },
    }).then((r) => r.json());
    assert.equal(finalMe.summary.balance, 600000);
    assert.equal(finalMe.summary.totalHeld, 0);
  });

  await t.test('6. Public /rewards SEO Indexability, Canonical Stripping, 301 /referral, & Private /account noindex', async () => {
    const { mockPool } = createStatefulPgMock();
    _setDbPoolForTest(mockPool);

    const rewardsRes = await fetch(`${baseUrl}/rewards`);
    assert.equal(rewardsRes.status, 200);
    const rewardsHtml = await rewardsRes.text();
    assert.match(rewardsHtml, /rel="canonical" href="https:\/\/kano-drama\.live\/rewards"/);
    assert.match(rewardsHtml, /name="robots" content="index, follow/);
    assert.match(rewardsHtml, /"@type":"FAQPage"/);
    assert.equal(rewardsRes.headers.get('x-robots-tag'), null);

    // Query parameter ?ref=... stripped from canonical URL
    const refHomeRes = await fetch(`${baseUrl}/?ref=KDA11CE01`);
    assert.equal(refHomeRes.status, 200);
    const refHomeHtml = await refHomeRes.text();
    assert.match(refHomeHtml, /rel="canonical" href="https:\/\/kano-drama\.live\/"/);

    // Legacy /referral redirects 301 to /rewards (and to https://kano-drama.live/rewards on prod host)
    const legacyRefRes = await fetch(`${baseUrl}/referral`, { redirect: 'manual' });
    assert.equal(legacyRefRes.status, 301);
    assert.equal(legacyRefRes.headers.get('location'), '/rewards');

    const prodLegacyRefRes = await fetch(`${baseUrl}/referral`, {
      redirect: 'manual',
      headers: { 'X-Forwarded-Host': 'kano-drama.live' },
    });
    assert.equal(prodLegacyRefRes.status, 301);
    assert.equal(
      prodLegacyRefRes.headers.get('location'),
      'https://kano-drama.live/rewards'
    );

    const oldDomainRes = await fetch(`${baseUrl}/explore`, {
      redirect: 'manual',
      headers: { 'X-Forwarded-Host': 'kano-drama.xyz' },
    });
    assert.equal(oldDomainRes.status, 301);
    assert.equal(
      oldDomainRes.headers.get('location'),
      'https://kano-drama.live/explore'
    );

    // Private /account stays noindex, nofollow
    const accountRes = await fetch(`${baseUrl}/account`);
    assert.equal(accountRes.status, 200);
    assert.equal(accountRes.headers.get('x-robots-tag'), 'noindex, nofollow');
    const accountHtml = await accountRes.text();
    assert.match(accountHtml, /name="robots" content="noindex, nofollow"/);

    // robots.txt allows /rewards and sitemap-part-1.xml lists /rewards on kano-drama.live
    const robotsTxt = await fetch(`${baseUrl}/robots.txt`).then((r) => r.text());
    assert.match(robotsTxt, /Allow:\s*\/rewards/);
    assert.match(robotsTxt, /Sitemap:\s*https:\/\/kano-drama\.live\/sitemap\.xml/);

    const sitemapIndexXml = await fetch(`${baseUrl}/sitemap.xml`).then((r) => r.text());
    assert.match(sitemapIndexXml, /https:\/\/kano-drama\.live\/sitemap-part-1\.xml/);
    const sitemapPart1Xml = await fetch(`${baseUrl}/sitemap-part-1.xml`).then((r) => r.text());
    assert.match(sitemapPart1Xml, /https:\/\/kano-drama\.live\/rewards/);

    const cfg = getPayoutRuntimeConfig();
    assert.equal(cfg.pointsPerUsd, 100000);
    assert.equal(cfg.minPayoutIdr, 50000);
    assert.equal(cfg.minPayoutUsd, 5);
    assert.equal(cfg.watchMinutePoints, 20);
    assert.equal(cfg.maxDailyWatchPoints, 10000);
    assert.deepEqual(cfg.dailyMissionMilestones, [
      { minutes: 15, bonusPoints: 500 },
      { minutes: 30, bonusPoints: 1200 },
      { minutes: 60, bonusPoints: 2800 },
    ]);
    assert.equal(cfg.levelTiers.length, 4);
  });

  await t.test('7. Tiered Account Level System scales check-in, episode, and watch points authoritatively on server', async () => {
    const { mockPool, state } = createStatefulPgMock();
    _setDbPoolForTest(mockPool);

    const silverUid = 'u-silver-1';
    const silverToken = signAuthSessionToken({
      uid: silverUid,
      email: 'silver@example.com',
      displayName: 'Silver Member',
      photoURL: null,
    });
    state.users.set(silverUid, {
      uid: silverUid,
      email: 'silver@example.com',
      display_name: 'Silver Member',
      referral_code: 'KDSILV01',
      referred_by: null,
      streak_count: 1,
      last_visit_date: '',
      is_vip: false,
    });
    // Seed 20,000 lifetime points yesterday -> qualifies for Lv.2 Silver (1.2x)
    const twoDaysAgo = new Date(Date.now() - 86_400_000 * 2);
    state.ledger.push({
      id: 'seed-silver-1',
      user_id: silverUid,
      type: 'earn',
      points: 20000,
      description: 'Seed Silver Level',
      reference_id: 'seed:silver:1',
      balance_after: 20000,
      created_at: twoDaysAgo,
    });

    const silverMe = await fetch(`${baseUrl}/api/points/me`, {
      headers: { Authorization: `Bearer ${silverToken}` },
    }).then((r) => r.json());
    assert.equal(silverMe.ok, true);
    assert.equal(silverMe.summary.levelInfo.tierId, 'silver');
    assert.equal(silverMe.summary.levelInfo.multiplier, 1.2);
    assert.equal(silverMe.summary.levelInfo.dailyCheckinPoints, 600);
    assert.equal(silverMe.summary.levelInfo.watchMinutePoints, 24);
    assert.equal(silverMe.summary.levelInfo.watchEpisodePoints, 240);

    // Claim daily check-in at Silver -> server grants +600 pts (ignores any client input)
    const silverCheckin = await fetch(`${baseUrl}/api/points/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${silverToken}`,
      },
      body: JSON.stringify({ action: 'daily_checkin', multiplier: 99, points: 9999 }),
    }).then((r) => r.json());
    assert.equal(silverCheckin.ok, true);
    assert.equal(silverCheckin.awardedPoints, 600);

    // Seed Platinum account (300,000 lifetime points) -> Lv.4 Platinum (1.6x)
    const platUid = 'u-plat-1';
    const platToken = signAuthSessionToken({
      uid: platUid,
      email: 'platinum@example.com',
      displayName: 'Platinum Member',
      photoURL: null,
    });
    state.users.set(platUid, {
      uid: platUid,
      email: 'platinum@example.com',
      display_name: 'Platinum Member',
      referral_code: 'KDPLAT01',
      referred_by: null,
      streak_count: 1,
      last_visit_date: '',
      is_vip: false,
    });
    state.ledger.push({
      id: 'seed-plat-1',
      user_id: platUid,
      type: 'earn',
      points: 300000,
      description: 'Seed Platinum Level',
      reference_id: 'seed:plat:1',
      balance_after: 300000,
      created_at: twoDaysAgo,
    });

    const platCheckin = await fetch(`${baseUrl}/api/points/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${platToken}`,
      },
      body: JSON.stringify({ action: 'daily_checkin' }),
    }).then((r) => r.json());
    assert.equal(platCheckin.ok, true);
    assert.equal(platCheckin.awardedPoints, 800);
    assert.equal(platCheckin.summary.levelInfo.tierId, 'platinum');
    assert.equal(platCheckin.summary.levelInfo.watchMinutePoints, 32);
  });

  await t.test('8. Hybrid Daily Watching Bonus: Auto Per-Minute Points, Claimable Milestones, Double-Claim Guard & Daily Watch Cap', async () => {
    const { mockPool, state } = createStatefulPgMock();
    _setDbPoolForTest(mockPool);

    state.users.set('user-alice', {
      uid: 'user-alice',
      email: 'alice@example.com',
      display_name: 'Alice Drama',
      referral_code: 'KDALICE01',
      referred_by: null,
      streak_count: 1,
      last_visit_date: '',
      is_vip: false,
    });

    // 1. Simulate reaching 15m (880s + 20s heartbeat = 900s) -> auto 15*20 = 300 pts, milestones still unclaimed
    const sess = await startWatchSessionInDb({
      userId: 'user-alice',
      mediaKey: 'DramaBoxV2:d-808:ep1',
      provider: 'DramaBoxV2',
      dramaId: 'd-808',
      episodeNumber: 1,
    });
    const todayKey = getJakartaDateKey();
    state.telemetry.set('user-alice', {
      user_id: 'user-alice',
      verified_watch_seconds: 880,
      today_watch_seconds: 880,
      today_date_key: todayKey,
      active_stream_session_id: sess.sessionToken,
      active_stream_media_key: 'DramaBoxV2:d-808:ep1',
      last_heartbeat_at: new Date(Date.now() - 20_000),
      last_video_time_sec: '20',
      fast_delta_strikes: 0,
      concurrent_tab_strikes: 0,
      risk_flag: '',
      suspicious_reason: '',
      updated_at: new Date(),
    });

    const hb15 = await recordWatchHeartbeatInDb({
      userId: 'user-alice',
      streamSessionId: sess.sessionToken,
      mediaKey: 'DramaBoxV2:d-808:ep1',
      currentTimeSec: 40,
      isPlaying: true,
      isBuffering: false,
      tabVisible: true,
      playbackRate: 1,
      seq: 1,
      ipHash: 'ip-a',
      subnetHash: 'sub-a',
      uaHash: 'ua-a',
      deviceHash: 'dev-a',
    });
    assert.equal(hb15.awardedWatchPoints, 300);
    assert.equal(hb15.todayWatchPointsEarned, 300);

    // 2. Premature 30m milestone claim fails (400 milestone_not_reached)
    const premature30 = await fetch(`${baseUrl}/api/points/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken}`,
      },
      body: JSON.stringify({ action: 'watch_milestone', milestoneMinutes: 30 }),
    });
    assert.equal(premature30.status, 400);
    assert.equal((await premature30.json()).reason, 'milestone_not_reached');

    // 3. Valid 15m milestone claim succeeds (+500 pts)
    const claim15 = await fetch(`${baseUrl}/api/points/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken}`,
      },
      body: JSON.stringify({ action: 'watch_milestone', milestoneMinutes: 15 }),
    });
    assert.equal(claim15.status, 200);
    const claim15Json = await claim15.json();
    assert.equal(claim15Json.ok, true);
    assert.equal(claim15Json.awardedPoints, 500);
    assert.equal(claim15Json.summary.todayWatchPointsEarned, 800);
    assert.equal(claim15Json.summary.milestones[0].claimed, true);
    assert.equal(claim15Json.summary.milestones[1].reached, false);

    // 4. Duplicate 15m milestone claim blocked (409 duplicate_claim)
    const dup15 = await fetch(`${baseUrl}/api/points/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken}`,
      },
      body: JSON.stringify({ action: 'watch_milestone', milestoneMinutes: 15 }),
    });
    assert.equal(dup15.status, 409);
    assert.equal((await dup15.json()).reason, 'duplicate_claim');

    // 5. Advance watch time to 60m -> auto awards remaining 45m (900 pts), 30m & 60m ready to claim back-to-back
    const aliceTel = state.telemetry.get('user-alice')!;
    aliceTel.verified_watch_seconds = 3580;
    aliceTel.today_watch_seconds = 3580;
    aliceTel.last_heartbeat_at = new Date(Date.now() - 20_000);
    const hb60 = await recordWatchHeartbeatInDb({
      userId: 'user-alice',
      streamSessionId: sess.sessionToken,
      mediaKey: 'DramaBoxV2:d-808:ep1',
      currentTimeSec: 60,
      isPlaying: true,
      isBuffering: false,
      tabVisible: true,
      playbackRate: 1,
      seq: 2,
      ipHash: 'ip-a',
      subnetHash: 'sub-a',
      uaHash: 'ua-a',
      deviceHash: 'dev-a',
    });
    assert.equal(hb60.awardedWatchPoints, 900);

    const claim30 = await fetch(`${baseUrl}/api/points/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken}`,
      },
      body: JSON.stringify({ action: 'watch_milestone', milestoneMinutes: 30 }),
    });
    assert.equal(claim30.status, 200);
    assert.equal((await claim30.json()).awardedPoints, 1200);

    const claim60 = await fetch(`${baseUrl}/api/points/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken}`,
      },
      body: JSON.stringify({ action: 'watch_milestone', milestoneMinutes: 60 }),
    });
    assert.equal(claim60.status, 200);
    const claim60Json = await claim60.json();
    assert.equal(claim60Json.awardedPoints, 2800);
    assert.equal(claim60Json.summary.todayWatchPointsEarned, 5700);
    assert.ok(claim60Json.summary.milestones.every((m: any) => m.reached && m.claimed));

    // 6. Enforce MAX_DAILY_WATCH_POINTS (10000) cap cleanly with 429
    state.users.set('user-bob', {
      uid: 'user-bob',
      email: 'bob@example.com',
      display_name: 'Bob Viewer',
      referral_code: 'KDBOB01',
      referred_by: null,
      streak_count: 1,
      last_visit_date: '',
      is_vip: false,
    });
    state.telemetry.set('user-bob', {
      user_id: 'user-bob',
      verified_watch_seconds: 1000,
      today_watch_seconds: 1000,
      today_date_key: todayKey,
      active_stream_session_id: '',
      active_stream_media_key: 'DramaBoxV2:d-808:ep1',
      last_heartbeat_at: new Date(),
      last_video_time_sec: '20',
      fast_delta_strikes: 0,
      concurrent_tab_strikes: 0,
      risk_flag: '',
      suspicious_reason: '',
      updated_at: new Date(),
    });
    state.ledger.push({
      id: 'seed-bob-watch-cap',
      user_id: 'user-bob',
      type: 'earn',
      points: 9800,
      description: 'Seed near daily watch cap',
      reference_id: `watch_min:user-bob:${todayKey}:m99`,
      balance_after: 9800,
      created_at: new Date(),
    });
    const capRes = await fetch(`${baseUrl}/api/points/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bobToken}`,
      },
      body: JSON.stringify({ action: 'watch_milestone', milestoneMinutes: 15 }),
    });
    assert.equal(capRes.status, 429);
    assert.equal((await capRes.json()).reason, 'daily_watch_cap_reached');
  });

  await t.test('9. Canonical Reset Period Lock prevents re-claiming when switching between UTC and WIB display timezones', async () => {
    const { mockPool, state } = createStatefulPgMock();
    _setDbPoolForTest(mockPool);

    state.users.set('user-alice', {
      uid: 'user-alice',
      email: 'alice@example.com',
      display_name: 'Alice Drama',
      referral_code: 'KDALICE01',
      referred_by: null,
      streak_count: 1,
      last_visit_date: '',
      is_vip: false,
    });

    // 1. User starts in EN mode (X-User-Timezone: UTC) and claims daily check-in
    const utcCheckin = await fetch(`${baseUrl}/api/points/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken}`,
        'X-User-Timezone': 'UTC',
      },
      body: JSON.stringify({ action: 'daily_checkin' }),
    });
    assert.equal(utcCheckin.status, 200);
    const utcCheckinJson = await utcCheckin.json();
    assert.equal(utcCheckinJson.awardedPoints, 500);
    assert.ok(utcCheckinJson.summary.resetPeriodKey);
    assert.ok(utcCheckinJson.summary.nextResetAt);

    // 2. Simulate 15m watch and claim 15m milestone while in UTC mode
    const sess = await startWatchSessionInDb({
      userId: 'user-alice',
      mediaKey: 'DramaBoxV2:d-909:ep1',
      provider: 'DramaBoxV2',
      dramaId: 'd-909',
      episodeNumber: 1,
    });
    const canonicalKey = utcCheckinJson.summary.resetPeriodKey as string;
    state.telemetry.set('user-alice', {
      user_id: 'user-alice',
      verified_watch_seconds: 880,
      today_watch_seconds: 880,
      today_date_key: canonicalKey,
      active_stream_session_id: sess.sessionToken,
      active_stream_media_key: 'DramaBoxV2:d-909:ep1',
      last_heartbeat_at: new Date(Date.now() - 20_000),
      last_video_time_sec: '20',
      fast_delta_strikes: 0,
      concurrent_tab_strikes: 0,
      risk_flag: '',
      suspicious_reason: '',
      updated_at: new Date(),
    });
    const hbUtc = await recordWatchHeartbeatInDb({
      userId: 'user-alice',
      streamSessionId: sess.sessionToken,
      mediaKey: 'DramaBoxV2:d-909:ep1',
      currentTimeSec: 40,
      isPlaying: true,
      isBuffering: false,
      tabVisible: true,
      playbackRate: 1,
      seq: 1,
      ipHash: 'ip-tz',
      subnetHash: 'sub-tz',
      uaHash: 'ua-tz',
      deviceHash: 'dev-tz',
      timeZone: 'UTC',
    });
    assert.equal(hbUtc.awardedWatchPoints, 300);

    const claim15Utc = await fetch(`${baseUrl}/api/points/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken}`,
        'X-User-Timezone': 'UTC',
      },
      body: JSON.stringify({ action: 'watch_milestone', milestoneMinutes: 15 }),
    });
    assert.equal(claim15Utc.status, 200);
    assert.equal((await claim15Utc.json()).awardedPoints, 500);

    // 3. Switch display timezone header to WIB (Asia/Jakarta): UI status MUST stay locked & claims MUST return 409
    const meWib = await fetch(`${baseUrl}/api/points/me`, {
      headers: {
        Authorization: `Bearer ${aliceToken}`,
        'X-User-Timezone': 'Asia/Jakarta',
      },
    }).then((r) => r.json());
    assert.equal(meWib.summary.resetPeriodKey, canonicalKey);
    assert.equal(meWib.summary.dailyCheckinClaimedToday, true);
    assert.equal(meWib.summary.milestones[0].claimed, true);
    assert.equal(meWib.summary.todayWatchPointsEarned, 800);
    assert.equal(meWib.summary.todayEarned, 1300);
    assert.equal(meWib.summary.balance, 1300);

    const wibReCheckin = await fetch(`${baseUrl}/api/points/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken}`,
        'X-User-Timezone': 'Asia/Jakarta',
      },
      body: JSON.stringify({ action: 'daily_checkin' }),
    });
    assert.equal(wibReCheckin.status, 409);
    assert.equal((await wibReCheckin.json()).reason, 'duplicate_claim');

    const wibReMilestone = await fetch(`${baseUrl}/api/points/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken}`,
        'X-User-Timezone': 'Asia/Jakarta',
      },
      body: JSON.stringify({ action: 'watch_milestone', milestoneMinutes: 15 }),
    });
    assert.equal(wibReMilestone.status, 409);
    assert.equal((await wibReMilestone.json()).reason, 'duplicate_claim');

    // Subsequent watch heartbeat under Asia/Jakarta must NOT double-credit minutes already granted under UTC
    state.telemetry.get('user-alice')!.last_heartbeat_at = new Date(Date.now() - 20_000);
    const hbWib = await recordWatchHeartbeatInDb({
      userId: 'user-alice',
      streamSessionId: sess.sessionToken,
      mediaKey: 'DramaBoxV2:d-909:ep1',
      currentTimeSec: 60,
      isPlaying: true,
      isBuffering: false,
      tabVisible: true,
      playbackRate: 1,
      seq: 2,
      ipHash: 'ip-tz',
      subnetHash: 'sub-tz',
      uaHash: 'ua-tz',
      deviceHash: 'dev-tz',
      timeZone: 'Asia/Jakarta',
    });
    assert.equal(hbWib.awardedWatchPoints, 0);

    // 4. Even a legacy/mismatched-date claim created within the current canonical period window locks across UTC <-> WIB
    state.users.set('user-bob', {
      uid: 'user-bob',
      email: 'bob@example.com',
      display_name: 'Bob Viewer',
      referral_code: 'KDBOB01',
      referred_by: null,
      streak_count: 1,
      last_visit_date: '',
      is_vip: false,
    });
    state.telemetry.set('user-bob', {
      user_id: 'user-bob',
      verified_watch_seconds: 1800,
      today_watch_seconds: 1800,
      today_date_key: canonicalKey,
      active_stream_session_id: '',
      active_stream_media_key: 'DramaBoxV2:d-909:ep1',
      last_heartbeat_at: new Date(),
      last_video_time_sec: '20',
      fast_delta_strikes: 0,
      concurrent_tab_strikes: 0,
      risk_flag: '',
      suspicious_reason: '',
      updated_at: new Date(),
    });
    // Simulate a prior claim stamped with an alternate calendar date inside the same canonical reset window
    state.ledger.push({
      id: 'legacy-utc-checkin',
      user_id: 'user-bob',
      type: 'earn',
      points: 500,
      description: 'Legacy UTC Check-in',
      reference_id: 'checkin:user-bob:1999-12-31',
      balance_after: 500,
      created_at: new Date(),
    });
    state.ledger.push({
      id: 'legacy-utc-m30',
      user_id: 'user-bob',
      type: 'earn',
      points: 200,
      description: 'Legacy UTC Milestone 30m',
      reference_id: 'mission_30m:user-bob:1999-12-31',
      balance_after: 700,
      created_at: new Date(),
    });

    const bobMeWib = await fetch(`${baseUrl}/api/points/me`, {
      headers: {
        Authorization: `Bearer ${bobToken}`,
        'X-User-Timezone': 'Asia/Jakarta',
      },
    }).then((r) => r.json());
    assert.equal(bobMeWib.summary.dailyCheckinClaimedToday, true);
    assert.equal(bobMeWib.summary.milestones[1].claimed, true);

    const bobReCheckin = await fetch(`${baseUrl}/api/points/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bobToken}`,
        'X-User-Timezone': 'Asia/Jakarta',
      },
      body: JSON.stringify({ action: 'daily_checkin' }),
    });
    assert.equal(bobReCheckin.status, 409);

    const bobReM30 = await fetch(`${baseUrl}/api/points/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bobToken}`,
        'X-User-Timezone': 'Asia/Jakarta',
      },
      body: JSON.stringify({ action: 'watch_milestone', milestoneMinutes: 30 }),
    });
    assert.equal(bobReM30.status, 409);
  });

  await t.test('10. Automatic Per-Minute Watch Points credit automatically at every 60s across 15s heartbeats', async () => {
    const { mockPool, state } = createStatefulPgMock();
    _setDbPoolForTest(mockPool);

    state.users.set('user-alice', {
      uid: 'user-alice',
      email: 'alice@example.com',
      display_name: 'Alice Drama',
      referral_code: 'KDALICE01',
      referred_by: null,
      streak_count: 1,
      last_visit_date: '',
      is_vip: false,
    });

    const sess = await startWatchSessionInDb({
      userId: 'user-alice',
      mediaKey: 'DramaBoxV2:d-1010:ep1',
      provider: 'DramaBoxV2',
      dramaId: 'd-1010',
      episodeNumber: 1,
    });

    // Baseline heartbeat at t=0.25s -> 0 pts
    const hb0 = await recordWatchHeartbeatInDb({
      userId: 'user-alice',
      streamSessionId: sess.sessionToken,
      mediaKey: 'DramaBoxV2:d-1010:ep1',
      currentTimeSec: 0.25,
      isPlaying: true,
      isBuffering: false,
      tabVisible: true,
      playbackRate: 1,
      seq: 1,
      ipHash: 'ip-m',
      subnetHash: 'sub-m',
      uaHash: 'ua-m',
      deviceHash: 'dev-m',
    });
    assert.equal(hb0.reason, 'session_started');
    assert.equal(hb0.awardedWatchPoints, 0);

    // Simulate 8 consecutive 15-second heartbeats (minute 1 at t=60s, minute 2 at t=120s)
    // Include slight 300ms RTT jitter (14.7s) on step 1 to verify rounding preserves exact 60s mark
    const steps = [
      { videoSec: 15.25, elapsedMs: 14_700, expectedTotalSec: 15, expectedAward: 0, expectedBal: 0 },
      { videoSec: 30.25, elapsedMs: 15_000, expectedTotalSec: 30, expectedAward: 0, expectedBal: 0 },
      { videoSec: 45.25, elapsedMs: 15_000, expectedTotalSec: 45, expectedAward: 0, expectedBal: 0 },
      { videoSec: 60.25, elapsedMs: 15_000, expectedTotalSec: 60, expectedAward: 20, expectedBal: 20 },
      { videoSec: 75.25, elapsedMs: 15_000, expectedTotalSec: 75, expectedAward: 0, expectedBal: 20 },
      { videoSec: 90.25, elapsedMs: 15_000, expectedTotalSec: 90, expectedAward: 0, expectedBal: 20 },
      { videoSec: 105.25, elapsedMs: 15_000, expectedTotalSec: 105, expectedAward: 0, expectedBal: 20 },
      { videoSec: 120.25, elapsedMs: 15_000, expectedTotalSec: 120, expectedAward: 20, expectedBal: 40 },
    ];

    let seq = 1;
    for (const step of steps) {
      seq += 1;
      state.telemetry.get('user-alice')!.last_heartbeat_at = new Date(
        Date.now() - step.elapsedMs
      );
      const hb = await recordWatchHeartbeatInDb({
        userId: 'user-alice',
        streamSessionId: sess.sessionToken,
        mediaKey: 'DramaBoxV2:d-1010:ep1',
        currentTimeSec: step.videoSec,
        isPlaying: true,
        isBuffering: false,
        tabVisible: true,
        playbackRate: 1,
        seq,
        ipHash: 'ip-m',
        subnetHash: 'sub-m',
        uaHash: 'ua-m',
        deviceHash: 'dev-m',
      });
      assert.equal(hb.todayWatchSeconds, step.expectedTotalSec);
      assert.equal(hb.awardedWatchPoints, step.expectedAward);
      assert.equal(hb.pointsBalance, step.expectedBal);
      assert.equal(hb.todayWatchPointsEarned, step.expectedBal);
    }
  });

  await t.test('11. Provider V2 Consolidation, Legacy V1 Blocking (410/301), Brand & Sitemap Compliance', async () => {
    const { mockPool } = createStatefulPgMock();
    _setDbPoolForTest(mockPool);

    // Legacy V1 API gateway paths must return HTTP 410 (melolo is active canonical upstream /api/melolo/*)
    for (const v1Path of [
      '/api/mola/dramabox/ranking',
      '/api/mola/storyreel/home',
      '/api/mola/vibeshort/home',
      '/api/mola/shortmax/home',
      '/api/mola/idrama/home',
      '/api/mola/reelshort/home',
    ]) {
      const res = await fetch(`${baseUrl}${v1Path}`);
      assert.equal(res.status, 410, `Expected 410 for ${v1Path}`);
    }

    const meloloGatewayRes = await fetch(`${baseUrl}/api/mola/melolo/rank?page=1&page_size=18`);
    assert.notEqual(meloloGatewayRes.status, 410, '/api/mola/melolo/* must stay active');

    // Legacy V1 provider hub URLs 301 redirect to canonical V2 hub URLs
    const v1ToV2Hubs: Array<[string, string]> = [
      ['/provider/dramabox', '/provider/dramaboxv2'],
      ['/provider/melolo', '/provider/melolov2'],
      ['/provider/storyreel', '/provider/storyreelv2'],
      ['/provider/vibeshort', '/provider/vibeshortv2'],
      ['/provider/shortmax', '/provider/shortmaxv2'],
      ['/provider/idrama', '/provider/idramav2'],
      ['/provider/reelshort', '/provider/reelshortv2'],
    ];
    for (const [legacyHub, canonicalHub] of v1ToV2Hubs) {
      const res = await fetch(`${baseUrl}${legacyHub}`, { redirect: 'manual' });
      assert.equal(res.status, 301, `Expected 301 for ${legacyHub}`);
      assert.equal(res.headers.get('location'), canonicalHub);
    }

    // Deprecated /video-sitemap.xml, /embed/*, empty routes & unknown paths return 404 + noindex, nofollow
    for (const deadUrl of [
      '/video-sitemap.xml',
      '/embed/123',
      '/dramaboxv2/detail',
      '/movie',
      '/drama/non-existent-audit-slug-999',
      '/halaman-tidak-ada-seo-404',
      '/genre/null',
    ]) {
      const res = await fetch(`${baseUrl}${deadUrl}`, { redirect: 'manual' });
      assert.equal(res.status, 404, `Expected 404 for ${deadUrl}`);
      assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow');
    }

    // /llms.txt, /ai-catalog.json, /sitemap-part-1.xml are clean of V1/old brand/old domain/VideoObject
    const [llmsRes, aiJsonRes, sitemapRes, rewardsRes, homeHtmlRes] = await Promise.all([
      fetch(`${baseUrl}/llms.txt`).then((r) => r.text()),
      fetch(`${baseUrl}/ai-catalog.json`).then((r) => r.json()),
      fetch(`${baseUrl}/sitemap-part-1.xml`).then((r) => r.text()),
      fetch(`${baseUrl}/rewards`).then((r) => r.text()),
      fetch(`${baseUrl}/`).then((r) => r.text()),
    ]);
    assert.match(llmsRes, /82\+/);
    assert.match(llmsRes, /https:\/\/kano-drama\.live/);
    assert.doesNotMatch(llmsRes, /kano-drama\.xyz|HouseDrama|house-drama\.xyz|house-drama\.web\.id|CoffeeDrama|89\+/i);

    assert.equal(aiJsonRes.url, 'https://kano-drama.live');
    assert.equal(aiJsonRes.providerDirectory.length, 82);
    assert.doesNotMatch(JSON.stringify(aiJsonRes), /kano-drama\.xyz|HouseDrama|house-drama\.xyz|house-drama\.web\.id/i);
    assert.ok(
      aiJsonRes.providerDirectory.every(
        (p: { slug: string }) =>
          !['dramabox', 'melolo', 'storyreel', 'vibeshort', 'shortmax', 'idrama', 'reelshort'].includes(
            p.slug
          )
      )
    );

    assert.doesNotMatch(sitemapRes, /kano-drama\.xyz|VideoObject|\/embed\/|<\/?video:/i);
    assert.doesNotMatch(
      sitemapRes,
      /\/provider\/(?:dramabox|melolo|storyreel|vibeshort|shortmax|idrama|reelshort)<\/loc>/i
    );
    assert.match(rewardsRes, /\+500 poin \(15 menit\), \+1\.200 poin \(30 menit\), dan \+2\.800 poin \(60 menit\)/);
    assert.match(rewardsRes, /00\.00 WIB \/ 17\.00 UTC/);
    assert.doesNotMatch(rewardsRes, /kano-drama\.xyz|HouseDrama|house-drama\.xyz|house-drama\.web\.id|CoffeeDrama/i);
    assert.doesNotMatch(homeHtmlRes, /kano-drama\.xyz|HouseDrama|house-drama\.xyz|house-drama\.web\.id/i);
    assert.match(homeHtmlRes, /rel="canonical" href="https:\/\/kano-drama\.live\/"/);
  });

  await t.test('12. IDOR & Auth Guard on /api/favorites, /api/watch-history, /api/likes, and /api/comments', async () => {
    const { mockPool } = createStatefulPgMock();
    _setDbPoolForTest(mockPool);

    // 1. /api/favorites requires session token and rejects mismatched userId
    const favUnauth = await fetch(`${baseUrl}/api/favorites?userId=user-alice`);
    assert.equal(favUnauth.status, 401);
    const favIdor = await fetch(`${baseUrl}/api/favorites?userId=user-alice`, {
      headers: { Authorization: `Bearer ${eveToken}` },
    });
    assert.equal(favIdor.status, 403);
    const favToggleIdor = await fetch(`${baseUrl}/api/favorites/toggle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eveToken}`,
      },
      body: JSON.stringify({ userId: 'user-alice', dramaId: 'd-1', provider: 'LK21' }),
    });
    assert.equal(favToggleIdor.status, 403);

    // 2. /api/watch-history & /api/likes block unauthenticated non-guest UIDs (401) and cross-user reads (403)
    const whUnauth = await fetch(`${baseUrl}/api/watch-history?userId=user-alice`);
    assert.equal(whUnauth.status, 401);
    const whIdor = await fetch(`${baseUrl}/api/watch-history?userId=user-alice`, {
      headers: { Authorization: `Bearer ${eveToken}` },
    });
    assert.equal(whIdor.status, 403);
    const likesUnauth = await fetch(`${baseUrl}/api/likes?userId=user-alice`);
    assert.equal(likesUnauth.status, 401);
    const likesIdor = await fetch(`${baseUrl}/api/likes?userId=user-alice`, {
      headers: { Authorization: `Bearer ${eveToken}` },
    });
    assert.equal(likesIdor.status, 403);

    // 3. /api/comments user history and comment creation enforce auth + IDOR
    const commUserUnauth = await fetch(`${baseUrl}/api/comments?userId=user-alice`);
    assert.equal(commUserUnauth.status, 401);
    const commUserIdor = await fetch(`${baseUrl}/api/comments?userId=user-alice`, {
      headers: { Authorization: `Bearer ${eveToken}` },
    });
    assert.equal(commUserIdor.status, 403);
    const commPostUnauth = await fetch(`${baseUrl}/api/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dramaId: 'd-1',
        provider: 'DramaBoxV2',
        episodeNumber: 1,
        text: 'Unauthorized spoof',
      }),
    });
    assert.equal(commPostUnauth.status, 401);
    const commPostIdor = await fetch(`${baseUrl}/api/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eveToken}`,
      },
      body: JSON.stringify({
        dramaId: 'd-1',
        provider: 'DramaBoxV2',
        episodeNumber: 1,
        userId: 'user-alice',
        text: 'Spoofed authorUid',
      }),
    });
    assert.equal(commPostIdor.status, 403);
  });

  await t.test('13. First-login bonus awards +5,000 points once per account without consuming daily earn cap', async () => {
    const { mockPool } = createStatefulPgMock();
    _setDbPoolForTest(mockPool);

    const cfgRes = await fetch(`${baseUrl}/api/points/config`).then((r) => r.json());
    assert.equal(cfgRes.config.firstLoginBonusPoints, 5000);
    assert.equal(cfgRes.config.dailyCheckinPoints, 500);

    // 1. First registration via email grants +5,000 first-login bonus
    const regRes = await fetch(`${baseUrl}/api/auth/email/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'newbie@example.com',
        password: 'password123',
        displayName: 'Newbie Viewer',
      }),
    });
    assert.equal(regRes.status, 201);
    const regBody = await regRes.json();
    assert.equal(regBody.ok, true);
    assert.equal(regBody.firstLoginBonusAwarded, 5000);
    const newbieToken = regBody.sessionToken as string;
    assert.ok(newbieToken);

    // 2. Subsequent login for the same account must NOT re-award first-login bonus
    const loginRes = await fetch(`${baseUrl}/api/auth/email/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'newbie@example.com',
        password: 'password123',
      }),
    });
    assert.equal(loginRes.status, 200);
    const loginBody = await loginRes.json();
    assert.equal(loginBody.ok, true);
    assert.equal(loginBody.firstLoginBonusAwarded, 0);

    // 3. Points summary reflects 5,000 balance and 0 todayEarned before daily actions
    const meBefore = await fetch(`${baseUrl}/api/points/me`, {
      headers: { Authorization: `Bearer ${newbieToken}` },
    }).then((r) => r.json());
    assert.equal(meBefore.ok, true);
    assert.equal(meBefore.summary.balance, 5000);
    assert.equal(meBefore.summary.totalEarned, 5000);
    assert.equal(meBefore.summary.todayEarned, 0);

    // 4. Daily check-in still awards +500 points cleanly -> total balance 5,500
    const checkinRes = await fetch(`${baseUrl}/api/points/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${newbieToken}`,
      },
      body: JSON.stringify({ action: 'daily_checkin' }),
    }).then((r) => r.json());
    assert.equal(checkinRes.ok, true);
    assert.equal(checkinRes.awardedPoints, 500);
    assert.equal(checkinRes.summary.balance, 5500);
    assert.equal(checkinRes.summary.todayEarned, 500);

    // 5. /api/users/sync with isLoginEvent=true grants +5,000 once for first-time OAuth sync and 0 on repeat
    const syncFirst = await fetch(`${baseUrl}/api/users/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bobToken}`,
      },
      body: JSON.stringify({ isLoginEvent: true, displayName: 'Bob Viewer' }),
    }).then((r) => r.json());
    assert.equal(syncFirst.ok, true);
    assert.equal(syncFirst.firstLoginBonusAwarded, 5000);

    const syncSecond = await fetch(`${baseUrl}/api/users/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bobToken}`,
      },
      body: JSON.stringify({ isLoginEvent: true, displayName: 'Bob Viewer' }),
    }).then((r) => r.json());
    assert.equal(syncSecond.ok, true);
    assert.equal(syncSecond.firstLoginBonusAwarded, 0);
  });

  await t.test('14. Telegram Withdraw Notification & Admin Payout Queue (/api/admin/payouts, /approve, /reject) + Live Feed Privacy', async () => {
    const { mockPool, state } = createStatefulPgMock();
    _setDbPoolForTest(mockPool);

    // Seed Alice with 1,000,000 points
    state.users.set('user-alice', {
      uid: 'user-alice',
      email: 'alice@example.com',
      display_name: 'Alice Drama',
      referral_code: 'KDA11CE01',
      referred_by: null,
      streak_count: 1,
      last_visit_date: getJakartaDateKey(),
      is_vip: false,
    });
    state.ledger.push({
      id: 'seed-tg-1',
      user_id: 'user-alice',
      type: 'earn',
      points: 1000000,
      description: 'Seed earn for Telegram & Admin Queue test',
      reference_id: 'seed:tg-admin:1',
      balance_after: 1000000,
      created_at: new Date(),
    });

    // A. Safe skip when TELEGRAM_BOT_TOKEN / TELEGRAM_ADMIN_CHAT_ID are empty
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_ADMIN_CHAT_ID;
    let telegramCalls = 0;
    const skippedRes = await notifyAdminTelegramNewWithdrawal(
      {
        payout: {
          id: 'payout-skip-1',
          userId: 'user-alice',
          pointsSpent: 300000,
          usdAmount: 3,
          idrAmount: 54600,
          fxRateUsed: 18200,
          currency: 'IDR',
          method: 'dana',
          bankCode: '',
          network: '',
          destinationAccount: '0812****890',
          destinationMasked: '0812****890',
          accountHolderName: 'Alice Drama',
          status: 'pending',
          adminNote: '',
          idempotencyKey: '',
          riskFlag: '',
          suspiciousReason: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        destinationAccountRaw: '081234567890',
        userId: 'user-alice',
        userEmail: 'alice@example.com',
        userDisplayName: 'Alice Drama',
        levelInfo: { level: 2, tierName: 'Silver', multiplier: 1.2 },
      },
      {
        fetchImpl: async () => {
          telegramCalls += 1;
          return new Response('{"ok":true}', { status: 200 });
        },
      }
    );
    assert.equal(skippedRes.sent, false);
    assert.equal(skippedRes.skipped, true);
    assert.equal(telegramCalls, 0);

    // B. Sends formatted message via Telegram Bot API when configured & handles network errors safely
    process.env.TELEGRAM_BOT_TOKEN = '123456:TEST_BOT_TOKEN';
    process.env.TELEGRAM_ADMIN_CHAT_ID = '-10099887766';
    let capturedEndpoint = '';
    let capturedBody: Record<string, unknown> = {};
    const sentRes = await notifyAdminTelegramNewWithdrawal(
      {
        payout: {
          id: 'payout-msg-1',
          userId: 'user-alice',
          pointsSpent: 300000,
          usdAmount: 3,
          idrAmount: 54600,
          fxRateUsed: 18200,
          currency: 'IDR',
          method: 'bank_transfer',
          bankCode: 'BCA',
          network: '',
          destinationAccount: 'BCA ****890',
          destinationMasked: 'BCA ****890',
          accountHolderName: 'Alice <Drama> & Co',
          status: 'pending',
          adminNote: '',
          idempotencyKey: '',
          riskFlag: '',
          suspiciousReason: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        destinationAccountRaw: 'BCA - 1234567890',
        userId: 'user-alice',
        userEmail: 'alice@example.com',
        userDisplayName: 'Alice Drama',
        levelInfo: { level: 3, tierName: 'Gold', multiplier: 1.4 },
      },
      {
        fetchImpl: async (url, init) => {
          capturedEndpoint = String(url);
          capturedBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
          return new Response('{"ok":true}', { status: 200 });
        },
      }
    );
    assert.equal(sentRes.sent, true);
    assert.equal(
      capturedEndpoint,
      'https://api.telegram.org/bot123456%3ATEST_BOT_TOKEN/sendMessage'
    );
    assert.equal(capturedBody.chat_id, '-10099887766');
    assert.equal(capturedBody.parse_mode, 'HTML');
    const msgText = String(capturedBody.text || '');
    assert.match(msgText, /KanoDrama — Pengajuan Withdraw Baru/);
    assert.match(msgText, /payout-msg-1/);
    assert.match(msgText, /user-alice/);
    assert.match(msgText, /alice@example\.com/);
    assert.match(msgText, /Lv\.3 Gold \(1\.4x\)/);
    assert.match(msgText, /300\.000 poin/);
    assert.match(msgText, /Rp 54\.600/);
    assert.match(msgText, /BCA - 1234567890/);
    assert.match(msgText, /Alice &lt;Drama&gt; &amp; Co/);

    // Network/API error from Telegram must never throw
    const failedTg = await notifyAdminTelegramNewWithdrawal(
      {
        payout: {
          id: 'payout-err-1',
          userId: 'user-alice',
          pointsSpent: 500000,
          usdAmount: 5,
          idrAmount: 91000,
          fxRateUsed: 18200,
          currency: 'USD',
          method: 'usdt_trc20',
          bankCode: '',
          network: 'TRC20',
          destinationAccount: 'T9yD14****789a',
          destinationMasked: 'T9yD14****789a',
          accountHolderName: 'Alice Drama',
          status: 'pending',
          adminNote: '',
          idempotencyKey: '',
          riskFlag: '',
          suspiciousReason: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        userId: 'user-alice',
        userEmail: 'alice@example.com',
        userDisplayName: 'Alice Drama',
        levelInfo: { level: 1, tierName: 'Bronze', multiplier: 1 },
      },
      {
        fetchImpl: async () => {
          throw new Error('Simulated Telegram outage');
        },
      }
    );
    assert.equal(failedTg.sent, false);

    // Restore empty Telegram env before E2E HTTP withdraw tests (must work silently)
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_ADMIN_CHAT_ID;

    // C. Submit two withdrawals (1 for approve flow, 1 for reject + refund flow)
    const wd1 = await fetch(`${baseUrl}/api/points/redeem`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken}`,
      },
      body: JSON.stringify({
        method: 'dana',
        pointsSpent: 300000,
        destinationAccount: '081234567890',
        accountHolderName: 'Alice Drama',
        idempotencyKey: 'tg-wd-1',
      }),
    });
    assert.equal(wd1.status, 201);
    const wd1Json = await wd1.json();
    const payoutApproveId = wd1Json.payout.id as string;

    const wd2 = await fetch(`${baseUrl}/api/points/redeem`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken}`,
      },
      body: JSON.stringify({
        method: 'paypal',
        pointsSpent: 500000,
        destinationAccount: 'alice.secret@example.com',
        accountHolderName: 'Alice Secret',
        idempotencyKey: 'tg-wd-2',
      }),
    });
    assert.equal(wd2.status, 201);
    const wd2Json = await wd2.json();
    const payoutRejectId = wd2Json.payout.id as string;

    // D. Admin endpoints strictly enforce ADMIN_PAYOUT_SECRET
    const unauthQueue = await fetch(`${baseUrl}/api/admin/payouts`);
    assert.equal(unauthQueue.status, 401);
    assert.equal(unauthQueue.headers.get('x-robots-tag'), 'noindex, nofollow');

    const badSecretApprove = await fetch(
      `${baseUrl}/api/admin/payouts/${payoutApproveId}/approve`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': 'wrong-secret',
        },
        body: JSON.stringify({}),
      }
    );
    assert.equal(badSecretApprove.status, 401);

    // E. Admin lists pending queue with full details
    const queueRes = await fetch(`${baseUrl}/api/admin/payouts?status=pending`, {
      headers: { Authorization: 'Bearer test-admin-secret-999' },
    });
    assert.equal(queueRes.status, 200);
    const queueJson = await queueRes.json();
    assert.equal(queueJson.ok, true);
    assert.ok(queueJson.items.some((p: { id: string }) => p.id === payoutApproveId));
    assert.ok(queueJson.items.some((p: { id: string }) => p.id === payoutRejectId));

    // F. Approve endpoint transitions pending -> approved and is idempotent on repeat
    const approve1 = await fetch(
      `${baseUrl}/api/admin/payouts/${payoutApproveId}/approve`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': 'test-admin-secret-999',
        },
        body: JSON.stringify({ adminNote: 'Verified & approved' }),
      }
    );
    assert.equal(approve1.status, 200);
    const approve1Json = await approve1.json();
    assert.equal(approve1Json.ok, true);
    assert.equal(approve1Json.payout.status, 'approved');
    assert.equal(approve1Json.refunded, false);

    const approveRepeat = await fetch(
      `${baseUrl}/api/admin/payouts/${payoutApproveId}/approve`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': 'test-admin-secret-999',
        },
        body: JSON.stringify({}),
      }
    );
    assert.equal(approveRepeat.status, 200);
    const approveRepeatJson = await approveRepeat.json();
    assert.equal(approveRepeatJson.idempotent, true);
    assert.equal(approveRepeatJson.payout.status, 'approved');

    // Backwards transition approved -> processing is blocked (409)
    const regressRes = await fetch(`${baseUrl}/api/admin/payouts/${payoutApproveId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': 'test-admin-secret-999',
      },
      body: JSON.stringify({ status: 'processing' }),
    });
    assert.equal(regressRes.status, 409);

    // G. Live Payout History exposes approved payout with masked display name and ZERO sensitive PII
    const liveFeedRes = await fetch(`${baseUrl}/api/payouts/live?limit=12`);
    assert.equal(liveFeedRes.status, 200);
    const liveFeedJson = await liveFeedRes.json();
    assert.equal(liveFeedJson.ok, true);
    const liveEntry = liveFeedJson.items.find(
      (item: { id: string }) => item.id === payoutApproveId
    );
    assert.ok(liveEntry);
    assert.equal(liveEntry.maskedUser, 'A***e');
    assert.equal(liveEntry.status, 'approved');
    assert.equal(liveEntry.userId, undefined);
    assert.equal(liveEntry.userEmail, undefined);
    assert.equal(liveEntry.destinationAccount, undefined);
    assert.equal(liveEntry.accountHolderName, undefined);

    // H. Reject endpoint transitions pending -> rejected, refunds 500,000 points once, and blocks repeat (409)
    const reject1 = await fetch(
      `${baseUrl}/api/admin/payouts/${payoutRejectId}/reject`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': 'test-admin-secret-999',
        },
        body: JSON.stringify({ reason: 'Invalid beneficiary details' }),
      }
    );
    assert.equal(reject1.status, 200);
    const reject1Json = await reject1.json();
    assert.equal(reject1Json.ok, true);
    assert.equal(reject1Json.payout.status, 'rejected');
    assert.equal(reject1Json.refunded, true);

    const rejectRepeat = await fetch(
      `${baseUrl}/api/admin/payouts/${payoutRejectId}/reject`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': 'test-admin-secret-999',
        },
        body: JSON.stringify({ reason: 'Retry reject' }),
      }
    );
    assert.equal(rejectRepeat.status, 409);

    // Alice started with 1,000,000, spent 300,000 (approved) + 500,000 (rejected & refunded) -> balance 700,000
    const aliceSummary = await fetch(`${baseUrl}/api/points/me`, {
      headers: { Authorization: `Bearer ${aliceToken}` },
    }).then((r) => r.json());
    assert.equal(aliceSummary.summary.balance, 700000);
    assert.equal(aliceSummary.summary.totalHeld, 300000);

    // Ensure formatTelegramWithdrawMessage is usable directly
    const formattedSample = formatTelegramWithdrawMessage({
      payout: wd1Json.payout,
      destinationAccountRaw: '081234567890',
      userId: 'user-alice',
      userEmail: 'alice@example.com',
      userDisplayName: 'Alice Drama',
      levelInfo: { level: 1, tierName: 'Bronze', multiplier: 1 },
    });
    assert.match(formattedSample, /KanoDrama — Pengajuan Withdraw Baru/);
  });
});




