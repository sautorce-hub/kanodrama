# Security Summary

**Reviewed Files**: 14
**Issues Resolved**: 8

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Unconfigured Database Fail-Open Risk | `server/db.ts` | 80 | Missing or unreachable PostgreSQL connections risked silent fallback behavior on points mutations or ambiguous 500 errors. | High | Fixed | Introduced `DatabaseUnavailableError` (`DATABASE_NOT_CONFIGURED` / `DATABASE_UNAVAILABLE`) mapping to strict HTTP `503` diagnostic JSON with `requiredConfig: ['DATABASE_URL']` and no client-storage fallback. |
| Heartbeat Replay & Out-of-Order Race | `server/db.ts` | 6455 | Repeated or replayed `/api/watch/heartbeat` payloads with stale sequence numbers could attempt duplicate duration credits. | High | Fixed | Enforced server-issued `watch_sessions` tokens with monotonic `seq` tracking (`seq <= last_seq` rejected with HTTP `409` `replay_blocked`) under `SELECT ... FOR UPDATE`. |
| Speed, Seek & Buffering Counter Manipulation | `server/db.ts`, `src/components/CinemaVideoPlayer.tsx` | 6520, 62 | Client playback while buffering, accelerated (`2x`), or seeking forward could inflate elapsed watch seconds. | High | Fixed | Rejected invalid playback speeds outside `0.75–1.15x`, ignored forward/backward seek jumps exceeding real wall-clock delta, halted on `isBuffering` / hidden tabs, and cleared active telemetry reliably on `<video>` events. |
| Duplicate Episode & Milestone Claims | `server/db.ts` | 4910 | Concurrent requests to claim a new-episode bonus or prematurely claim before watching an episode risked double-crediting. | High | Fixed | Added PostgreSQL advisory locks (`pg_advisory_xact_lock`), composite primary key `(user_id, provider, drama_id, episode_number)` on `rewarded_episodes`, idempotent ledger `reference_id` unique constraint, and `>= 15s` verified watch prerequisite. |
| Concurrent Multi-Tab Farming | `server/db.ts`, `server.ts` | 6505, 5510 | Multiple tabs streaming simultaneously could accumulate parallel watch mission seconds for one account. | Medium | Fixed | Bound one active `active_stream_session_id` per user telemetry row and rejected competing active sessions with HTTP `429` (`concurrent_stream_detected`). |
| Self-Referral & Multi-Account Cloning | `server/db.ts` | 5933 | Users could attempt to refer themselves via matching normalized email, identical IP/subnet + UA, or shared device fingerprints. | High | Fixed | Blocked matching UID, normalized email, IP/device fingerprint matches, and enforced real 1-hour (`3600s`) verified active watch qualification inside atomic DB transactions before crediting `+1,000` points. |
| Double Withdrawal & Terminal Refund Races | `server/db.ts`, `server.ts` | 5120, 5223 | Duplicate payout form clicks or concurrent admin terminal status transitions risked double debits or duplicate refunds. | High | Fixed | Required `idempotencyKey` on `/api/points/redeem` (unique index per `(user_id, idempotency_key)`), atomic balance check + lock, strict destination validation, and single atomic refund on terminal `rejected`/`failed` transitions (blocking repeat transitions with HTTP `409`). |
| Preview Domain Leakage & Private Route Indexing | `src/config/auth.ts`, `server.ts` | 115, 7990 | Referral URLs generated from preview origins (`*.run.app`) broke share attribution, while `/referral` needed SEO consolidation and `/account` needed strict private headers. | Medium | Fixed | Forced canonical production origin `https://kano-drama.xyz/?ref=...` across share flows, added permanent `301` redirect `/referral` -> `/rewards`, kept `/rewards` crawlable (`index, follow`, stripped `?ref=` canonical, `FAQPage` JSON-LD), and enforced `X-Robots-Tag: noindex, nofollow` on `/account`. |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| Session & Role Verification | `server.ts` | Extracts signed HMAC session cookies/Bearer tokens via `extractAuthSessionFromRequest` on all `/api/points/*`, `/api/watch/*`, and `/api/referrals/*` routes; rejects unauthenticated requests with HTTP `401`. |
| IDOR Prevention | `server.ts` | Checks `requestedUid !== session.uid` on `/api/points/ledger`, `/api/points/payouts`, and `/api/referrals/me`, returning HTTP `403 Forbidden`. |
| Parameterized Database Queries | `server/db.ts` | All PostgreSQL queries use `$1, $2, ...` positional parameter bindings through `pg` pool clients with explicit `BEGIN` / `COMMIT` / `ROLLBACK` transactions. |
| Admin Endpoint Authorization | `server.ts` | Admin payout routes (`/api/admin/payouts`, `/api/admin/payouts/:id`) verify `x-admin-secret` / Bearer secret using constant-time comparison against `ADMIN_PAYOUT_SECRET`. |
| Client Rendering Safety | `src/components/RewardsPayoutSection.tsx` | All user-controlled ledger descriptions, masked payout accounts, and referral fields render via escaped JSX bindings without raw HTML injection. |

---

## PoC Verification

> **Test Environment Note**: `DATABASE_URL` is unconfigured in this preview environment (`dbConnected: false`). Live HTTP endpoints were verified returning strict `503 DATABASE_NOT_CONFIGURED`, and all database-backed exploit/transaction proofs below were executed via `npx tsx --test tests/points-referral-audit.test.ts` (7/7 passing) against the real Express app with a stateful in-memory PostgreSQL query driver.

### 1. Heartbeat Replay Attack (`seq` Reuse Blocked)

#### Summary
| Field | Value |
|---|---|
| Issue Type | Telemetry Replay Attack |
| Impact | High |
| Affected File | `server/db.ts:6461` |
| Test Scenario | Re-submitting `POST /api/watch/heartbeat` with repeated `seq: 1` after baseline heartbeat `seq: 1` was already recorded for the session. |

#### How It Was Fixed
Each `/api/watch/session` issues a database-backed token tracking `last_seq`. Any heartbeat with `seq <= last_seq` inside the locked session row returns `reason: 'replay_blocked'`, mapped to HTTP `409`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Signed-in request arrives at `POST /api/watch/heartbeat` (`server.ts:5467`) with `{ sessionToken, seq: 1 }`. | Auth passes; forwards to DB handler. |
| 2 | `recordWatchHeartbeatInDb` locks session row and checks `seq <= sess.last_seq` (`server/db.ts:6458`). | Condition triggers (`1 <= 1`). |
| 3 | Route returns HTTP `409 Conflict` with `{ reason: 'replay_blocked', addedSeconds: 0 }` (`server.ts:5557`). | **Handled Safely** |

#### Conclusion
**Fix Verified** — Repeating or replaying an already-processed heartbeat packet cannot credit additional watch seconds.

---

### 2. Premature & Duplicate New-Episode Bonus Claims

#### Summary
| Field | Value |
|---|---|
| Issue Type | Reward Threshold Bypass & Race Condition |
| Impact | High |
| Affected File | `server/db.ts:4910`, `server.ts:5076` |
| Test Scenario | Claiming `action: 'watch_episode'` at `0s` watched (`< 15s`), then claiming twice after `20s` of verified active playback. |

#### How It Was Fixed
Episode claims acquire a transaction advisory lock, require `>= 15s` of verified session watch duration (`watch_duration_insufficient`), and enforce primary key `(user_id, provider, drama_id, episode_number)` in `rewarded_episodes`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | First `POST /api/points/claim` arrives before 15s verified heartbeat accumulates. | Returns HTTP `400` (`watch_duration_insufficient`). |
| 2 | After `20s` valid active playback, claim succeeds once with `+50` points and inserts into `rewarded_episodes` + `points_ledger`. | Credited exactly once. |
| 3 | Second `POST /api/points/claim` for same `(user_id, DramaBox, d-101, 3)` hits existing row / `ON CONFLICT DO NOTHING`. | Returns HTTP `409` (`duplicate_claim`). |

#### Conclusion
**Fix Verified** — Episode bonuses require verified minimum watch duration and cannot be double-claimed across tabs or refreshes.

---

### 3. Cross-Account Data Access (IDOR)

#### Summary
| Field | Value |
|---|---|
| Issue Type | Insecure Direct Object Reference |
| Impact | High |
| Affected File | `server.ts:5039` |
| Test Scenario | Authenticated user `user-eve` requests `GET /api/points/ledger?userId=user-alice`. |

#### How It Was Fixed
Both `/api/points/ledger` and `/api/points/payouts` compare any optional `userId` query filter strictly against `session.uid` from the verified auth token.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Request reaches `GET /api/points/ledger` (`server.ts:5032`) with valid Bearer token for `user-eve`. | Session authenticates as `user-eve`. |
| 2 | Handler evaluates `requestedUid && requestedUid !== session.uid` (`server.ts:5040`). | Mismatch detected (`user-alice !== user-eve`). |
| 3 | Immediately responds HTTP `403` `{ ok: false, error: 'Forbidden' }` without querying ledger rows. | **Handled Safely** |

#### Conclusion
**Fix Verified** — Users can never read another account's points ledger or payout history.

---

### 4. Double Withdrawal Submission & Repeated Refund Exploit

#### Summary
| Field | Value |
|---|---|
| Issue Type | Financial Race / Double Spend & Double Refund |
| Impact | High |
| Affected File | `server/db.ts:5120`, `server/db.ts:5455`, `server.ts:5223` |
| Test Scenario | Submitting identical `POST /api/points/redeem` twice with `idempotencyKey: 'wd-bca-idem-1'`, then transitioning payout `pending -> processing -> failed` followed by another `rejected` PATCH. |

#### How It Was Fixed
`createPayoutRequestInDb` locks user points with an advisory lock, checks `(user_id, idempotency_key)` uniqueness, debits once into held status, refunds exactly once when transitioning to terminal `failed`/`rejected`, and rejects subsequent terminal transitions (`already_finalized`).

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | First `POST /api/points/redeem` (60,000 pts, BCA 10 digits) debits wallet from `120,000` to `60,000` held (`201 Created`). | Payout created once. |
| 2 | Identical retry with `wd-bca-idem-1` hits existing `idempotency_key` record (`server/db.ts:5130`). | Returns HTTP `200` `deduplicated: true`; balance stays `60,000`. |
| 3 | Admin sets `processing` -> `failed`: atomic refund ledger row restores balance to `120,000` (`totalHeld: 0`). | Refunded once. |
| 4 | Subsequent `PATCH` to `rejected` is blocked at terminal-status guard (`409` `already_finalized`). | Balance remains `120,000`. |

#### Conclusion
**Fix Verified** — Double clicks and concurrent retries cannot double-debit balances or issue duplicate refunds.

---

### 5. Unconfigured Database Fail-Closed Verification

#### Summary
| Field | Value |
|---|---|
| Issue Type | Silent Persistence Fallback Prevention |
| Impact | High |
| Affected File | `server/db.ts:146` |
| Test Scenario | Calling `GET /api/points/me` and `POST /api/points/claim` while `DATABASE_URL` is unset (`dbConnected: false`). |

#### How It Was Fixed
Removed all fake/local fallback storage for points, check-ins, referrals, and payouts; missing PostgreSQL throws `DatabaseUnavailableError` mapped to HTTP `503`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Request hits `GET /api/points/me` or `POST /api/points/claim` with valid session token. | Invokes `requirePointsDbPool()`. |
| 2 | `getDbPool()` sees no `DATABASE_URL` configured and throws `DatabaseUnavailableError('DATABASE_NOT_CONFIGURED')`. | Propagates to `handlePointsDbError`. |
| 3 | Express sends HTTP `503` `{ ok: false, code: 'DATABASE_NOT_CONFIGURED', requiredConfig: ['DATABASE_URL'] }`. | **Handled Safely** |

#### Conclusion
**Fix Verified** — When PostgreSQL is absent or offline, KanoDrama refuses to fake reward persistence and surfaces clear configuration requirements.
