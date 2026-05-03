# Task #511 Stage 1 완료 보고서 — 보완10: Square wrap y위치 보정

## 완료 일자

2026-05-01

## 작업 내용

### cherry-pick 검증

보완6-8 커밋(fccab59, aa1f7ce, db45be6)이 local/task511에 정상 적용된 상태로 `cargo build` / `cargo test` 통과 확인.

### 문제 발견 (page 4 wrap zone y위치 불일치)

`hwp3-sample5.hwp` 4쪽(0-indexed: page 3) 시각 확인 결과:

- **rhwp**: wrap zone 텍스트가 본문 상단에서 약 75.6px 아래에서 시작
- **한컴**: wrap zone 텍스트가 본문 상단(y≈76.8px)에서 시작

차이: ~75.6px → 3줄 × 19.2px = 57.6px (Fix B) + 앵커 문단 높이 19.2px (Fix A) 합산

### 원인 분석

pgy(per-line Y, 1/1800인치 단위, 용지 상단 기준) 분석:

| 문단 | pgy | 위치 |
|------|-----|------|
| pi=74 (앵커) | 0 | 용지 최상단 (body_top_pgy≈1417보다 훨씬 위) |
| pi=75 line 0 | 360 | 용지 여백 (< body_top) |
| pi=75 line 1 | 720 | 용지 여백 |
| pi=75 line 2 | 1080 | 용지 여백 |
| pi=75 line 3 (cs>0) | 1430 | 본문 시작 ≈ body_top |

- **Pi=74**: 앵커 문단이 pgy=0(용지 상단 여백)에 있음에도 `text`/`line_segs`를 가지고 있어 typeset.rs에서 19.2px 높이를 차지
- **Pi=75**: 선행 3개 줄(cs=0)이 용지 여백에 위치하지만 본문 렌더링에 포함되어 57.6px 낭비

### 수정 내용 (보완10)

`src/parser/hwp3/mod.rs`의 `parse_paragraph_list()` 후처리 블록 수정:

**Fix A** — 보완7 블록 수정 (lines 1595-1607):

기존 `continue`를 앵커 문단 text/line_segs 제거로 교체.
다음 문단이 `wrap_precomputed`이고 현재 문단에 Square wrap 부동 그림이 있으면 `text.clear()` + `line_segs.clear()`.
`controls`는 유지 (그림은 Shape PageItem 경로로 절대 위치 렌더링).

```
효과: composed.lines.len()=0 → typeset total_height=0 → 앵커 문단 높이 0
```

**Fix B** — 새 블록 추가 (lines 1620-1629):

`wrap_precomputed` 문단에서 선행 `column_start=0` LineSeg들을 `drain`으로 제거.

```
효과: 용지 여백 내 줄 제거 → 본문 첫 줄이 body_top에서 시작
```

### 검증 결과

```
cargo build    → Finished dev profile (7.18s) ✓
cargo test     → 6 passed (golden_svg) + 1 passed (tab_cross_run) ✓
```

SVG 확인 (`output/svg/task511_fix/hwp3-sample5_004.svg`):

- 이미지: x=51.627 y=76.267 (body_top=75.573, 정상)
- 첫 텍스트 baseline: y=91.107 (body_top+15.5px, 12pt 기준선 정상)
- 줄 간격: 19.2px/line (일정)
- 수정 전 대비: 첫 텍스트가 y≈148.7px에서 y=91.1px으로 57.6px 상향 ✓

## 변경 파일

| 파일 | 변경 |
|------|------|
| `src/parser/hwp3/mod.rs` | Fix A (앵커 text/line_segs 클리어) + Fix B (선행 cs=0 LineSeg drain) |

## 다음 단계

2단계: 최종 보고서(`mydocs/report/task_m100_511_report.md`) + `mydocs/orders/20260501.md` task511 항목 추가 → local/devel merge 요청
