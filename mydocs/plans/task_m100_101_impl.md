# Task #101: PartialTable LAYOUT_OVERFLOW — 구현계획서 (v2)

> **이슈**: [#101](https://github.com/edwardkim/rhwp/issues/101)
> **브랜치**: `local/task101`
> **작성일**: 2026-04-10
> **수정일**: 2026-04-10 (v2 — 실제 원인 재분석 후 수정)

---

## 원인 분석 (수정)

### 데이터

```
표 pi=78: 26행×3열, spacing_before=1000 HU (13.3px)
19페이지 body_area: h=930.5px, bottom=1034.1px
layout y after pi=77: ~844.3px
pi=78 spacing_before=13.3px → table starts at ~857.6px
rows=0..20 range_height ≈ 186.2px
table end y ≈ 857.6 + 186.2 = 1043.8px > page_bottom 1034.1px → overflow ~9.7px
```

### 실제 원인 (v1 구현계획서 수정)

`split_table_rows` 함수의 `page_avail` 계산에서 `spacing_before`(문단 앞 간격)가 차감되지 않는 문제.

`host_spacing`은 `before(spacing_before + outer_top) + sa + host_line_spacing`으로 구성되지만,
`page_avail`에는 이 값이 전혀 반영되지 않는다:

```rust
// engine.rs ~1409
let page_avail = if is_continuation {
    base_available_height
} else {
    (table_available_height - st.current_height - caption_extra - host_extra - v_extra).max(0.0)
};
let avail_for_rows = (page_avail - header_overhead).max(0.0);
// → find_break_row에 spacing_before만큼 과도한 avail이 전달됨
```

레이아웃 엔진은 표를 배치하기 전에 `spacing_before`(13.3px)만큼 y_offset을 이미 전진시킨다.
따라서 첫 분할(비-연속, cursor_row==0)에서 `avail_for_rows`에서 `spacing_before`를 차감해야
실제 페이지에 남은 공간과 일치한다.

### v1 픽스(SPLIT_EPSILON=0.5)의 한계

`find_break_row`에 SPLIT_EPSILON=0.5를 적용했으나:
- 실제 부족분은 ~13.3px (spacing_before 전체)
- 0.5px 마진으로는 해결 불가
- rows=0..20 여전히 선택, LAYOUT_OVERFLOW 그대로 11.2px 발생

---

## 수정 전략

### 접근 방법: `split_table_rows`에서 `spacing_before_px` 차감

`split_table_rows` 시그니처에 `spacing_before_px: f64` 파라미터를 추가하고,
첫 분할 조건(`!is_continuation && cursor_row == 0 && content_offset == 0.0`)에서만
`avail_for_rows`에서 차감한다.

```rust
// 수정 전 (engine.rs ~1417)
let avail_for_rows = (page_avail - header_overhead).max(0.0);

// 수정 후: 첫 분할에서 spacing_before만큼 차감
let sb_extra = if !is_continuation && cursor_row == 0 && content_offset == 0.0 {
    spacing_before_px
} else {
    0.0
};
let avail_for_rows = (page_avail - header_overhead - sb_extra).max(0.0);
```

`spacing_before_px`는 호출부(`paginate_table_control`)에서 `sb` 값(measured spacing_before)으로 전달.

### v1 픽스 제거

`find_break_row`의 `SPLIT_EPSILON` 상수 및 관련 코드는 삭제한다.
(부동소수점 오차 가설 기반이었으므로 실제 원인 수정 후 불필요)

### 영향 범위

- `split_table_rows` 함수 시그니처 1개 파라미터 추가
- 호출부 `paginate_table_control` 1곳
- `find_break_row` SPLIT_EPSILON 제거 (height_measurer.rs)
- 다른 경로(`range_height`, `cumulative_heights` 등) 무변경

---

## 단계별 구현

### 1단계: `split_table_rows` spacing_before 차감 + v1 픽스 제거

**파일 1**: `src/renderer/pagination/engine.rs`

변경 내용:
1. `split_table_rows` 시그니처에 `spacing_before_px: f64` 추가
2. `avail_for_rows` 계산 시 첫 분할 조건에서 `spacing_before_px` 차감
3. 호출부 `paginate_table_control`에서 `spacing_before_px` (= `sb` 변수) 전달

**파일 2**: `src/renderer/height_measurer.rs`

변경 내용:
1. `find_break_row`에서 `SPLIT_EPSILON` 관련 코드 제거 (v1 픽스 롤백)

**검증**:
- `dump-pages -p 18`: `PartialTable pi=78 ci=0 rows=0..19` — 19행 이하로 조정되어야 함
- `export-svg -p 18`: LAYOUT_OVERFLOW 제거 확인

### 2단계: 회귀 테스트

- 226개 샘플 전체 SVG 내보내기 오류 0건 확인

---

## 제약 조건 재확인

- `spacing_before_px` 차감은 `split_table_rows` 첫 분할 조건에만 국소 적용
- `range_height`, `cumulative_heights` 등 다른 계산 로직은 변경하지 않음
- `find_break_row` v1 픽스(SPLIT_EPSILON) 완전 제거
- 전역 적용 금지: 다른 높이 계산 경로에 영향 없어야 함
