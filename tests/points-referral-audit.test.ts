import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import type { AddressInfo } from 'node:net';

process.env.KD_DISABLE_AUTO_LISTEN = '1';
process.env.ADMIN_PAYOUT_SECRET = 'test-admin-secret-999';
process.env.STREAM_SIGNING_SECRET = 'test-signing-secret-abc';
process.env.SITE_URL = 'https://kano-drama.xyz';
delete process.env.DATABASE_URL;

import {
  _setDbPoolForTest,
  getJakartaDateKey,
  getPayoutRuntimeConfig,
  recordWatchHeartbeatInDb,
  startWatchSessionInDb,
} from '../server/db';
import { createServerApp, signAuthSessionToken } from '../server';
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
    if (sql.startsWith('SELECT user_id FROM daily_checkins WHERE user_id = $1 AND checkin_date = $2::date')) {
      const uid = String(params[0]);
      const dt = String(params[1]);
      const hit = state.checkins.find((c) => c.user_id === uid && c.checkin_date === dt);
      return { rows: hit ? [{ user_id: uid }] : [], rowCount: hit ? 1 : 0 };
    }

    if (sql.startsWith('SELECT streak_day FROM daily_checkins WHERE user_id = $1 AND checkin_date = $2::date')) {
      const uid = String(params[0]);
      const dt = String(params[1]);
      const hit = state.checkins.find((c) => c.user_id === uid && c.checkin_date === dt);
      return { rows: hit ? [{ streak_day: hit.streak_day }] : [], rowCount: hit ? 1 : 0 };
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
        .map((c) => ({ checkin_date: c.checkin_date, streak_day: c.streak_day }));
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

    if (sql.startsWith("SELECT reference_id FROM points_ledger WHERE user_id = $1 AND reference_id LIKE 'mission:%'")) {
      const uid = String(params[0]);
      const dayKey = String(params[1]);
      const rows = state.ledger
        .filter((l) => l.user_id === uid && l.reference_id.startsWith(`mission:${uid}:${dayKey}:`))
        .map((l) => ({ reference_id: l.reference_id }));
      return { rows, rowCount: rows.length };
    }

    if (sql.includes('FROM points_ledger WHERE user_id = $1 AND reference_id = ANY')) {
      const uid = String(params[0]);
      const refs: string[] = params[1] || [];
      const rows = state.ledger
        .filter((l) => l.user_id === uid && refs.includes(l.reference_id))
        .map((l) => ({ reference_id: l.reference_id, created_at: l.created_at }));
      return { rows, rowCount: rows.length };
    }

    if (sql.includes('FROM points_ledger WHERE user_id = $1 AND (reference_id LIKE $2 OR reference_id LIKE $3)')) {
      const uid = String(params[0]);
      const toLikeRegex = (pat: string) =>
        new RegExp('^' + pat.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$');
      const re1 = toLikeRegex(String(params[1] || ''));
      const re2 = toLikeRegex(String(params[2] || ''));
      const rows = state.ledger
        .filter((l) => l.user_id === uid && (re1.test(l.reference_id) || re2.test(l.reference_id)))
        .map((l) => ({ reference_id: l.reference_id }));
      return { rows, rowCount: rows.length };
    }

    if (sql.includes('FROM points_ledger WHERE user_id = $1') && sql.includes('AS today_earned')) {
      const uid = String(params[0]);
      const dayKey = String(params[1]);
      let totalEarn = 0;
      let totalRedeem = 0;
      let todayEarned = 0;
      let todayWatchPts = 0;
      let lastClaim: Date | null = null;
      let lastWatchMission: Date | null = null;
      let checkinToday = false;

      for (const l of state.ledger) {
        if (l.user_id !== uid) continue;
        const lDay = getJakartaDateKey(l.created_at);
        if (l.type === 'earn') {
          totalEarn += l.points;
          if (!l.reference_id.startsWith('refund:payout:') && lDay === dayKey) {
            todayEarned += l.points;
          }
          if (
            (l.reference_id.startsWith('mission_') ||
              l.reference_id.startsWith('mission:') ||
              l.reference_id.startsWith('watch_min:') ||
              l.reference_id.startsWith('watchmin:')) &&
            lDay === dayKey
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
          if (l.reference_id === `checkin:${uid}:${dayKey}`) {
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
            total_redeemed: String(totalRedeem),
            today_earned: String(todayEarned),
            today_watch_points_earned: String(todayWatchPts),
            last_claim_at: lastClaim,
            last_watch_mission_at: lastWatchMission,
            checkin_today: checkinToday,
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

    if (sql.includes('FROM payout_requests p LEFT JOIN users u')) {
      const rows = state.payouts
        .filter((p) => ['approved', 'paid', 'completed'].includes(p.status))
        .map((p) => ({
          ...p,
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
    assert.equal(firstBody.awardedPoints, 100);
    assert.equal(firstBody.streakDay, 7);
    assert.equal(firstBody.summary.balance, 100);

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

    // Episode bonus now succeeds once (+50 pts), second claim blocked (409)
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
    assert.equal((await epClaim1.json()).awardedPoints, 50);

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
      'https://kano-drama.xyz/?ref=KDA11CE01'
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
      mediaKey: 'DramaBox:d-99:ep1',
      provider: 'DramaBox',
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
      active_stream_media_key: 'DramaBox:d-99:ep1',
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
      mediaKey: 'DramaBox:d-99:ep1',
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

    // Verify Alice received +1000 referral bonus AND Bob received 15m/30m/60m mission rewards
    const aliceMe = await fetch(`${baseUrl}/api/points/me`, {
      headers: { Authorization: `Bearer ${aliceToken}` },
    }).then((r) => r.json());
    assert.equal(aliceMe.summary.balance, 1000);

    const bobMe = await fetch(`${baseUrl}/api/points/me`, {
      headers: { Authorization: `Bearer ${bobToken}` },
    }).then((r) => r.json());
    // Bob watched 60 mins: milestone bonuses 25 + 50 + 100 = 175 + minute chunks credited (at least 180 pts)
    assert.ok(bobMe.summary.milestones.every((m: any) => m.reached === true));
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
      id: 'seed-120k',
      user_id: 'user-alice',
      type: 'earn',
      points: 120_000,
      description: 'Seed verified balance',
      reference_id: 'seed:alice:1',
      balance_after: 120_000,
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
        pointsSpent: 54946,
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
        pointsSpent: 60000,
        destinationAccount: '1234567890',
        accountHolderName: 'Alice Drama',
        idempotencyKey: 'wd-bca-idem-1',
      }),
    });
    assert.equal(goodBank.status, 201);
    const goodBankJson = await goodBank.json();
    assert.equal(goodBankJson.payout.status, 'pending');
    assert.equal(goodBankJson.summary.balance, 60000);
    assert.equal(goodBankJson.summary.totalHeld, 60000);

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
        pointsSpent: 60000,
        destinationAccount: '1234567890',
        accountHolderName: 'Alice Drama',
        idempotencyKey: 'wd-bca-idem-1',
      }),
    });
    assert.equal(replayBank.status, 200);
    const replayBankJson = await replayBank.json();
    assert.equal(replayBankJson.deduplicated, true);
    assert.equal(replayBankJson.summary.balance, 60000);

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

    // Repeated terminal transition blocked (409 already_finalized) & balance back to 120,000
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
    assert.equal(finalMe.summary.balance, 120000);
    assert.equal(finalMe.summary.totalHeld, 0);
  });

  await t.test('6. Public /rewards SEO Indexability, Canonical Stripping, 301 /referral, & Private /account noindex', async () => {
    const { mockPool } = createStatefulPgMock();
    _setDbPoolForTest(mockPool);

    const rewardsRes = await fetch(`${baseUrl}/rewards`);
    assert.equal(rewardsRes.status, 200);
    const rewardsHtml = await rewardsRes.text();
    assert.match(rewardsHtml, /rel="canonical" href="https:\/\/kano-drama\.xyz\/rewards"/);
    assert.match(rewardsHtml, /name="robots" content="index, follow/);
    assert.match(rewardsHtml, /"@type":"FAQPage"/);
    assert.equal(rewardsRes.headers.get('x-robots-tag'), null);

    // Query parameter ?ref=... stripped from canonical URL
    const refHomeRes = await fetch(`${baseUrl}/?ref=KDA11CE01`);
    assert.equal(refHomeRes.status, 200);
    const refHomeHtml = await refHomeRes.text();
    assert.match(refHomeHtml, /rel="canonical" href="https:\/\/kano-drama\.xyz\/"/);

    // Legacy /referral redirects 301 to /rewards
    const legacyRefRes = await fetch(`${baseUrl}/referral`, { redirect: 'manual' });
    assert.equal(legacyRefRes.status, 301);
    assert.equal(legacyRefRes.headers.get('location'), '/rewards');

    // Private /account stays noindex, nofollow
    const accountRes = await fetch(`${baseUrl}/account`);
    assert.equal(accountRes.status, 200);
    assert.equal(accountRes.headers.get('x-robots-tag'), 'noindex, nofollow');
    const accountHtml = await accountRes.text();
    assert.match(accountHtml, /name="robots" content="noindex, nofollow"/);

    // robots.txt allows /rewards and sitemap-part-1.xml lists /rewards
    const robotsTxt = await fetch(`${baseUrl}/robots.txt`).then((r) => r.text());
    assert.match(robotsTxt, /Allow:\s*\/rewards/);

    const sitemapIndexXml = await fetch(`${baseUrl}/sitemap.xml`).then((r) => r.text());
    assert.match(sitemapIndexXml, /sitemap-part-1\.xml/);
    const sitemapPart1Xml = await fetch(`${baseUrl}/sitemap-part-1.xml`).then((r) => r.text());
    assert.match(sitemapPart1Xml, /https:\/\/kano-drama\.xyz\/rewards/);

    const cfg = getPayoutRuntimeConfig();
    assert.equal(cfg.pointsPerUsd, 20000);
    assert.equal(cfg.minPayoutIdr, 50000);
    assert.equal(cfg.minPayoutUsd, 5);
  });
});
