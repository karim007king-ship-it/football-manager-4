# Football Manager 4 — Development Roadmap

> Living plan for FM4. Keep the working branch isolated until the acceptance gates below are met. Do not merge PR #1 or replace the legacy match engine without explicit approval.

## 1. Current verified baseline

- Working branch: `fix/match-engine-v2`.
- Legacy match engine remains authoritative for career results and saves.
- New engine is isolated in read-only shadow mode.
- New engine currently supports seeded deterministic simulation, player coordinates and role-aware team shape, possession, carrying, passing, interceptions, tackles, shots, saves, goals, basic adaptive mentality, stamina drain, manpower effects, substitutions, and shadow comparison.
- The live monitor mirrors user/opponent lineups, dismissals, substitutions and selected legacy incidents.
- Match session and shadow RNG serialization/restoration exist. The match event timeline is now persisted and replayed without replaying audio.
- Latest verified automated run for commit `5b6df859f62efe12c7a950acf48e81cc574eac8b`: 91 tests passed, 0 failed. Android APK workflow also completed successfully for that commit.
- These are CI results, not proof of real-device behavior. Phone testing remains required.
- PR #1 remains open as a draft. Do not merge it without approval.

## 2. Match-engine roadmap — highest priority

### M0 — Freeze, inspect and define contracts
- Preserve the legacy engine and FM3 baseline.
- Define canonical match state, team/player IDs, coordinates, event schema, minute/action clock, possession accounting, substitutions, cards, injuries and restart rules.
- Separate simulation rules from presentation and legacy-game adapters.
- Add invariants: no duplicate active IDs, valid ball carrier, legal active-player counts, bounded coordinates/stamina, monotonic match clock, deterministic seeded replay.

**Gate:** contract tests pass; no writes from the shadow engine into legacy match/game/player objects.

### M1 — Core simulation correctness
- Audit possession and clock accounting over every action and minute.
- Make ball ownership and transitions explicit: carry, pass, interception, tackle, shot, save, goal, restart and dead-ball state.
- Handle missing/inactive carrier, goalkeeper ownership, substitutions while in possession, dismissals, extra time and safe restart points.
- Ensure every event has stable ID, minute, team, player references and source.
- Add home/away mirror tests and identical-seed replay tests.

**Gate:** invariant tests across large seed sets; mirrored teams show no unexplained directional bias.

### M2 — Player movement and football intelligence
- Formation-aware position targets and role responsibilities.
- Support angles, passing triangles, width, depth, overlap/underlap, forward runs and defensive recovery.
- Individual decisions based on attributes, stamina, role, morale, pressure and tactical instructions.
- Team compactness, line height, pressing triggers, marking, cover shadows and transition behavior.
- Avoid teleportation, bunching, static lines and endless midfield circulation.

**Gate:** movement heatmaps and event sequences demonstrate purposeful progression, width, support and defensive recovery for both sides.

### M3 — Attacking model
- Build-up from goalkeeper and defenders.
- Short/long passing, through balls, switches, crosses, cutbacks and counterattacks.
- Shot selection based on angle, distance, pressure, body/role skill and goalkeeper position.
- Rebounds, blocks, deflections and second balls.
- Chance quality (xG-like internal measure) and clear separation of shots, shots on target and goals.

**Gate:** chance quality predicts scoring frequency across large seeded cohorts; no unrealistic shot spam or guaranteed goals.

### M4 — Defensive model
- Pressing intensity and triggers, low/mid/high blocks, marking and cover.
- Tackles, interceptions, blocks, clearances and defensive errors.
- Fouls and advantage where appropriate.
- Team shape reacts to score, minute, opponent style and manpower.

**Gate:** stronger defensive attributes and coherent defensive tactics measurably improve prevention without making matches sterile.

### M5 — Goalkeeper model
- Positioning, angles, reflexes, handling, distribution and one-on-ones.
- Saves, catches, parries, rebounds, punches and goalkeeper errors.
- Correct goal-kick, corner and restart ownership.

**Gate:** goalkeeper quality affects save outcomes; shots on target and goals remain internally consistent.

### M6 — Referee, discipline and set pieces
- Fouls, yellow cards, second yellows, direct reds, advantage and penalties.
- Offside decisions and restart locations.
- Corners, free kicks, penalties, throw-ins and goal kicks with attacking/defending routines.
- Match officials may vary by strictness, but decisions must remain explainable and deterministic.

**Gate:** event rates and consequences are calibrated; dismissals affect shape and strength without deciding every match automatically.

### M7 — Fitness, injuries and substitutions
- Workload by role, pressing intensity, match tempo and player traits.
- Fatigue affects movement, decisions, passing, shooting and recovery gradually.
- Injury risk tied to load, condition and contact; avoid random injury spam.
- Substitution rules, formation-slot inheritance, tactical role changes and post-red-card legality.
- Tactical AI substitutions based on score, fatigue, cards, player performance and remaining windows.

**Gate:** substitutions and fatigue have measurable but non-scripted impact; all roster limits and player states remain valid.

### M8 — Match context and AI coaches
- Home advantage, crowd, weather/pitch conditions only where supported by the game data.
- Opponent scouting and tactical identity.
- Pre-match plan, in-match adaptation, mentality and risk management.
- Distinct team styles rather than one generic opponent behavior.

**Gate:** teams with different styles produce distinguishable but balanced match patterns.

### M9 — Statistics, commentary and analysis
- Possession, passes/accuracy, shots/on target, chances, xG-like quality, tackles, interceptions, fouls, cards, corners, saves, distance/workload and player ratings.
- Event log and commentary generated from actual simulation events.
- Half-time and full-time reports; player and team heatmaps.
- Ensure displayed statistics are derived from the same event/state source.

**Gate:** score, events, statistics and reports reconcile; no contradictory commentary.

### M10 — Calibration and comparison
- Run at least 1,000 seeded matches per key scenario where practical.
- Test equal teams, stronger/weaker teams, home/away reversals, tactical styles, fatigue bands, red cards, substitutions and extra time.
- Compare both engines on matched initial lineups and scenarios; compare distributions, not just individual scores.
- Record metrics and accepted ranges in versioned audit reports.
- Investigate outliers; do not tune only to make a single test pass.

**Gate:** no unexplained home/away bias, extreme score inflation, implausible shot/pass rates, or tactical exploits.

### M11 — Shadow integration and staged activation
- Keep the new engine read-only while fixing differences.
- Compare score, minute, possession, shots, cards, substitutions, injuries, events and player availability.
- Run a shadow soak over complete matches and career scenarios.
- Add feature flag and immediate rollback path before any live result authority changes.
- Activate only after explicit approval and a verified rollback build.

**Gate:** full parity/reconciliation report, device testing, backup/rollback test and user approval.

## 3. Match presentation — second priority, developed alongside engine milestones

- Live match screen: readable score/time, pitch, player positions, ball, event feed and controls.
- Clear visual distinction between user and opponent, home/away orientation, active/inactive/sent-off players.
- Tactical panel: formation, mentality, line/press settings and player roles.
- Substitution panel: bench, position compatibility, fatigue, cards and remaining substitutions.
- Match statistics and player ratings that update from engine data.
- Half-time, extra-time, penalties and full-time screens.
- Match replay/incident detail where performance permits.
- Responsive Arabic RTL layout, touch-sized controls, readable typography and small-screen support.
- Preserve the event feed across pause, app close and session restore; prevent duplicate events/audio.

## 4. Whole-game roadmap — do not lose these systems

### Club and navigation
- Professional home dashboard with next fixture, recent results, league position, objectives, finances and urgent notices.
- Consistent design system across every screen: club, squad, tactics, player profile, transfers, training, fixtures, table, cup, finance, staff, news, inbox, settings and reports.
- Search, filters, sorting, clear back navigation and contextual help.

### Squad and player lifecycle
- Full squad/bench/reserves, positions and role familiarity.
- Player profiles: attributes, form, morale, fitness, condition, contracts, history and statistics.
- Development, potential, aging, retirement and new player generation.
- Injuries, suspensions, discipline and availability.

### Transfers and scouting
- Transfer/loan/renewal/contract negotiations, wages, bonuses and squad registration.
- Scouting assignments, reports, player fit, potential and uncertainty.
- AI club behavior, realistic budgets and transfer windows.

### Training and staff
- Weekly schedules, individual training, tactical familiarity and development.
- Coaches, scouts, medical staff and board responsibilities.
- Training load, recovery and injury prevention.

### Competitions and calendar
- League, cups, fixtures, standings, tie-breakers and schedule congestion.
- Home/away fixtures, postponements if supported, extra time and penalties.
- AI-controlled matches and consistent simulation rules across all competitions.

### Club management and finances
- Income, wages, prize money, transfers, facilities, attendance and operating costs.
- Board objectives, confidence, sponsorship and stadium/facility upgrades.
- Financial warnings and season-to-season accounting.

### Career depth and world simulation
- News, press conferences, rivalries, player conversations and dressing-room morale.
- Youth academy, scouting network, staff changes and manager reputation.
- AI clubs make transfers, develop players, change tactics and respond to results.
- Long-term database consistency and believable multi-season progression.

### Technical quality and release
- Reliable offline operation and versioned save migrations.
- Automatic safe saves, backups, recovery from corrupted/incompatible saves.
- Android performance, memory use, battery use, responsive UI and accessibility.
- Arabic RTL everywhere; localization-ready text and number/date formatting.
- Regression tests, device smoke tests, APK reproducibility and release notes.

## 5. Quality gates for every change

1. Read the current implementation before editing.
2. Add a focused regression test before or with the fix.
3. Run the complete test suite; report exact pass/fail counts.
4. Build APK only from a tested commit; verify artifact and checksum.
5. Never claim device testing unless the user has tested that APK.
6. Keep changes isolated and reversible; never merge PR #1 or change match-result authority without approval.
7. Update this roadmap when a milestone is completed or a new gap is found.

## 6. Immediate next work

1. Finish the code-level audit of the engine, adapter, bridge and monitor.
2. Add missing correctness tests for event/state invariants, mirrored home/away scenarios, goalkeeper/restart behavior and substitutions/dismissals.
3. Fix the highest-impact defects revealed by those tests.
4. Then deepen player decision-making and attacking/defensive phase logic before adding decorative features.


## 7. Professional execution plan — active revision (2026-11-07)

The following sequence is the release-oriented plan. A phase is not considered complete because code exists; it must pass its acceptance gate and be reflected in the test/report artifacts.

### P0 — Stabilize current branch
- Verify the active striker-run implementation with both-direction tests.
- Correct any coordinate-mirroring, defensive-line selection, or bounds defects before extending behavior.
- Avoid stacking duplicate feature commits while CI is still running; validate the newest commit, not an earlier SHA.
- Preserve the known-good APK from `927019963f85838040d49996aa1d342d5f6a52c2` as a rollback reference.

**Acceptance:** newest FM4 checks and Android APK workflows both succeed on the same commit; no claim of device verification until installed and tested by the user.

### P1 — Match-engine correctness audit
- Audit the engine, adapter, bridge, live monitor, serialization and restore paths as one connected system.
- Check ball ownership after every event and restart; player IDs must resolve to active players unless the event explicitly records a dismissed/inactive actor.
- Check event schemas, monotonic action/minute clocks, possession totals, shots/on-target/goals, substitutions, red cards, keeper behavior and restart ownership.
- Add mirrored home/away tests for every spatial rule and edge-case tests for missing defensive lines, inactive players and reduced squads.
- Ensure seeded replay remains identical across snapshot/restore and version migration.

**Acceptance:** invariant/property-style tests across broad deterministic seed cohorts; no known crash, NaN, invalid coordinate, stale player reference or nondeterministic restore defect.

### P2 — Football intelligence and match balance
- Striker runs behind the defensive line and into channels.
- Wide forwards, overlapping fullbacks, midfield support, third-player runs and defensive cover.
- Pass selection should consider receiver run timing, pressure, lane, foot/role suitability and risk.
- Defenders should track runners, hold line, pass runners between defenders and avoid unrealistic synchronized chasing.
- Add tactical instructions (line height, width, tempo, pressing, directness) only when they change decisions in observable and testable ways.
- Calibrate with 1,000+ seeded matches per important scenario where practical; compare home/away, strong/weak, styles, fatigue and dismissals.

**Acceptance:** purposeful movement and varied attacking patterns, stable scoring/pass/shot distributions, no one tactic exploiting the simulation.

### P3 — Complete football rules
- Set pieces and restarts: throw-ins, goal kicks, corners, free kicks and penalties.
- Offside, fouls, advantage, cards and referee profile.
- Rebounds, second balls, deflections and goalkeeper parries.
- Extra time and penalty shootouts; substitution windows and roster rules.

**Acceptance:** each restart and rule has state-transition tests and produces consistent commentary/statistics.

### P4 — Match UI redesign
- Rebuild live match presentation around a clear pitch, score/time, team identity and event timeline.
- Add readable player markers, ball movement, selected player, cards, substitutions and injury indicators.
- Tactical and substitution drawers designed for touch input and Arabic RTL.
- Match center: live stats, player ratings, commentary, half-time/full-time reports and replay.
- Optimize animations and rendering for mid-range Android devices; provide reduced-motion/performance mode.

**Acceptance:** every match state is readable and actionable on the target phone size; no clipped Arabic, overlapping controls or lost state after pause/restore.

### P5 — Whole-game UI and UX
- Establish shared design tokens, typography, spacing, iconography, cards, tables, dialogs and navigation.
- Main dashboard: next match, table position, recent form, objectives, finances, inbox and urgent actions.
- Squad/player profiles, tactics, transfers, scouting, training, fixtures, competition tables, finance, staff, news, inbox and settings.
- Add useful search/filter/sort, consistent back navigation, confirmation for destructive actions and empty/error/loading states.
- Maintain RTL and responsive layouts consistently, not screen-by-screen overrides.

**Acceptance:** all screens use one coherent visual system, all primary actions work, and no dead-end navigation.

### P6 — Career simulation depth
- Contracts, renewals, loans, transfer windows, registration and AI negotiations.
- Scouting uncertainty, player development, training load, staff and youth academy.
- League/cup scheduling, tie-breakers, AI club decisions, finances and season transitions.
- Player aging, retirement, generated youth and multi-season world consistency.

**Acceptance:** multi-season simulations retain valid squads, contracts, finances, competition schedules and save integrity.

### P7 — Save system, performance and release hardening
- Versioned saves, migrations, rotating backups, crash recovery and safe write/restore.
- Offline-first behavior, memory/battery profiling, asset loading and Android lifecycle handling.
- Accessibility, text scaling, localization-ready dates/numbers and device compatibility.
- Automated regression, APK reproducibility, release notes, checksum and staged rollout.

**Acceptance:** clean install, upgrade install, offline play, save/restore, app pause/resume and long-session soak tests pass on real Android devices.

### Non-negotiable release rules
- No milestone is marked complete without evidence from tests and its acceptance gate.
- No generated APK is called install-ready until the matching commit's test and build workflows pass.
- No phone compatibility claim until the user tests the exact APK on the target device.
- The legacy match engine remains authoritative until shadow comparison, rollback and explicit user approval are complete.
- Do not merge PR #1 or alter FM3.


## 8. Latest execution update — 2026-11-07

- The striker-run boundary and home/away direction changes are now covered by the passing CI run for commit `e42011b86aa4fb04a37db54af5ebbdd37cf51d43`.
- Added `tests/match-state-invariants.test.js`: 60 deterministic seeds, checked after every minute for 90 minutes.
- The new audit checks score/shot/on-target consistency, possession reconciliation, bounded player and ball coordinates, stamina bounds, active ball ownership, event clock validity and player-reference integrity.
- This audit is pending its own CI result; it is not yet an accepted milestone.
- Continue next with integration-level movement/defensive tracking tests, then set-piece/restart correctness. Keep the shadow engine read-only and the legacy engine authoritative.


## 9. Restart and boundary audit — 2026-11-07

- Added a pure boundary classifier for the first pitch line crossed by a supplied ball segment. It awards throw-ins, corners and goal kicks using the attacking direction and last-touch team.
- Added an atomic boundary transition helper that invokes the existing restart resolver, assigns an active taker and creates exactly one restart event. In-play segments leave possession and the event log unchanged.
- Added deterministic tests for both attacking directions, both touchlines, corner/goal-kick ownership, invalid inputs, in-play segments and single-event restart transitions.
- Latest match-engine checks passed on commit `f3923f73f8f332e946fed6a1d6f3b8dd14cdaa2f`. The matching Android APK build is still in progress at the time of this update; no device test is implied.
- Live integration has now begun: an unblocked off-target shot creates a deterministic goal-line segment and is resolved through the boundary/restart pipeline. The shot event is recorded before the goal-kick restart event; the awarded goalkeeper becomes the active ball owner.
- Added a seeded cohort test across 120 full 90-minute simulations. It checks that every unblocked off-target shot is immediately followed by the correct goal-kick event, with a valid active taker and in-pitch restart coordinates.
- This first live shot path is pending the latest CI checks and matching Android APK build for commit `47a17b47af2792d1704cba153f6609872ad213a4`; do not treat it as accepted until those workflows finish successfully. No phone runtime test is implied.
- **Remaining gaps:** blocked shots still resolve directly to the blocker without a modeled deflection trajectory; saved shots still transfer directly to the goalkeeper without a parry/rebound path; crosses and ordinary passes do not yet carry modeled ball segments through the boundary classifier. Corner awards from live deflections are therefore not implemented.
- Next: model goalkeeper parries and defender deflections as explicit, deterministic ball segments, then test corner/goal-kick ownership in both attacking directions. Preserve deterministic replay, event/stat consistency, Shadow Mode and legacy result authority.


## 10. Rebound follow-up and defensive recovery — 2026-11-07

- Added an in-box goalkeeper-parry rebound resolution that selects the nearest active outfield player using distance, pace and stable tie-breakers; the loose ball remains inside the pitch and the event records the goalkeeper, shooter and attacking team.
- A parry now creates a one-action rebound opportunity. If the attacking side wins the loose ball, its immediate next action receives a bounded follow-up-shot probability boost and the shot event records `reboundFollowUp`.
- If the defending side wins the loose ball, its immediate next action is resolved through the existing defensive-recovery decision, allowing a clearance to a forward outlet or a normal interception. The opportunity is consumed once and does not persist into later actions.
- Added deterministic mirrored rebound geometry tests, a 1,200-seed parry/deflection event audit, and focused tests for attacking follow-up shots and defensive recovery. The defender-deflection corner geometry remains covered by controlled mirrored tests rather than relying on rare random occurrence.
- Verified commit: `40b77006115d3f1eab72a512477794fc9df7307a`. CI runs `42394290493` and `42394284558` (FM4 checks) passed; Android APK run `42394284405` passed.
- This is automated CI evidence only. No real-device install or match-play test has been performed. The new engine remains shadow-only; legacy match results and saves remain authoritative.

**Next:** model crossbar/post rebounds as explicit in-play second-ball trajectories, then integrate crosses and passes that leave the pitch through the same boundary/restart resolver. Keep trajectory generation deterministic and test both attacking directions before broader balance tuning.


## 11. Woodwork and overhit-pass boundary integration — 2026-11-07

- Added explicit post and crossbar rebound resolution. The rebound stays in play, selects an active outfield player using distance, pace and deterministic tie-breakers, updates ball ownership and creates a one-action second-ball opportunity.
- Added controlled mirrored tests for home crossbar and away post geometry, ownership, event metadata and invalid input. Commit `70d918a03ce39184b389068140fd2064b4be493f` passed FM4 checks runs `42395354229` and `42395350301`, plus Android APK run `42395350302`.
- Added overhit-pass boundary resolution for cross, switch, through-ball and normal passes. An overhit trajectory is extended beyond its intended receiver and passed through the same first-boundary classifier and atomic restart resolver used by shots. The pass event is recorded before any restart event.
- Added mirrored tests for touchline throw-ins, goal kicks, corners, restart ownership and invalid zero-length trajectories.
- The first implementation consumed an additional random draw on every successful pass and broke the established calibration stream. It was rejected. The corrected implementation derives the overhit decision from the current PRNG state without advancing it, preserving all subsequent random decisions.
- Verified corrected commit: `758c9b0d8d5e23dd20f523b0f65c006ea11a838f`. FM4 checks runs `42397909023` and `42397903926` both passed; Android APK run `42397903941` passed.
- These results confirm CI tests and APK build only. No real-device install or match-play test has been performed. Shadow Mode and legacy result/save authority remain unchanged.

**Next:** implement and test live cross trajectories and their outcomes (completed crosses, interceptions, clearances, overhit crosses, and cross-originated shots) without introducing extra random draws that shift calibration. Then audit pass/cross decision quality, second-ball behavior and team shape under both attacking directions before starting the full match-screen redesign.
