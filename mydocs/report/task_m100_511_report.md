# Task #511 최종 결과보고서 — HWP3 Square wrap 렌더링 세부 보정

## 완료 일자

2026-05-01

## 작업 범위

`hwp3-sample5.hwp` Square wrap(그림 사각 둘러싸기) 텍스트 흐름 보정.
cherry-pick 적용된 보완6-8 기반으로 보완10·11 추가 수행.

## 단계별 작업 요약

### 1단계 — 보완10: Square wrap y위치 보정

**문제**: page 4 wrap zone 텍스트가 한컴보다 75.6px 아래에서 시작.

**원인**:
1. 앵커 문단(pi=74, pgy=0)이 text/line_segs를 가져 19.2px 높이 차지
2. wrap_precomputed 문단(pi=75)의 선행 3줄(pgy<body_top)이 용지 여백에 위치하지만 본문에 포함되어 57.6px 낭비

**수정**:
- **Fix A**: 앵커 문단의 text/line_segs 클리어 → height=0
- **Fix B**: wrap_precomputed 문단의 선행 cs=0 LineSeg drain → 본문 첫 줄이 body_top에서 시작

**결과**: 첫 텍스트 y=148.7px → y=91.1px (57.6+19.2=76.8px 상향) ✓

### 2단계 — 보완11: wrap cs linfo.sx 기반 보정

**문제**: page4·page8 wrap zone 텍스트가 그림 오른쪽 경계를 침범.

**원인**: `column_start` 계산이 `pic_right_col`(outer margin 미포함)을 사용.
HWP3 엔진 저장값 `linfo.sx`는 outer margin을 이미 포함한 실제 줄 시작 x.
차이: 1704 HWPUNIT = 6mm (outer margin).

**수정**: `linfo.sx > 0` 시 `cs_sx = linfo.sx * 4` 사용 (HWP3 파일의 정확한 값).

**결과**:

| 페이지 | 이전 x | 수정 후 x | 한컴 기대 |
|--------|--------|---------|---------|
| page4  | 529.5px | 552.2px | ≈552px ✓ |
| page8  | 384.2px | 406.9px | ≈407px ✓ |

## 최종 검증

```
cargo test     → 7 tests passed (6 golden_svg + 1 tab_cross_run) ✓
cargo clippy   → 경고 없음 ✓
```

## 변경 파일 목록

| 파일 | 변경 내용 | 커밋 |
|------|---------|------|
| `src/parser/hwp3/mod.rs` | Fix A (앵커 text/line_segs 클리어) | a379d9e |
| `src/parser/hwp3/mod.rs` | Fix B (선행 cs=0 LineSeg drain) | a379d9e |
| `src/parser/hwp3/mod.rs` | 보완11 (linfo.sx 기반 cs 대체) | afac4d2 |

## 기술 인사이트

HWP3 `LineSeg.sx` 필드는 HWP3 엔진이 레이아웃 계산 후 저장한 결과값으로,
그림 outer margin을 포함한 실제 텍스트 시작 x를 인코딩한다.
이를 직접 활용하면 outer margin 파싱 오류나 계산 오차 없이 정확한 wrap 위치를 얻을 수 있다.
`sx == 0` (비wrap 줄 / 여백 줄)인 경우는 geometry 기반 계산으로 폴백.
