# 단계별 완료 보고서 — Task #279 Stage 3+4

**이슈**: [#279 목차 right tab 리더 점 렌더링 + 소제목 페이지 번호 정렬 불일치](https://github.com/edwardkim/rhwp/issues/279)  
**단계**: Stage 3 (소제목 탭 위치 수정) + Stage 4 (검증)  
**커밋**: `d48af5c`  
**브랜치**: `local/task279`

---

## 1. 변경 내용

### Stage 2 (리더 도트 렌더링) — svg.rs, web_canvas.rs

`fill_type=3` (점선) 리더를 round cap 원형 점으로 변경:

**이전**:
```svg
stroke-width="0.5" stroke-dasharray="1 2"
```
(사각 끝 대시선)

**이후**:
```svg
stroke-width="1.0" stroke-dasharray="0.1 3" stroke-linecap="round"
```
(원형 점)

### Stage 3 (소제목 탭 위치) — text_measurement.rs L68-76

`find_next_tab_stop`의 클램핑 조건에 `ts.tab_type != 1` 추가:

**이전**:
```rust
let pos = if ts.position > available_width && available_width > 0.0 {
    available_width  // 모든 탭 타입에 대해 클램핑
} else {
    ts.position
};
```

**이후**:
```rust
// type=1(오른쪽) 탭은 단 기준 절대 위치이므로 available_width 클램핑 제외.
// 들여쓰기(left_margin)가 있는 문단에서도 오른쪽 탭이 동일 위치에 정렬되도록 한다.
// type=0(왼쪽)/2(가운데) 탭은 종전대로 클램핑하여 텍스트 영역 밖으로 넘어가지 않게 한다.
let pos = if ts.tab_type != 1 && ts.position > available_width && available_width > 0.0 {
    available_width
} else {
    ts.position
};
```

---

## 2. 근거 / 분석

### 버그 원인

```
TabStop.position: 단(column) 기준 절대 px
available_width = col_area.width - effective_margin_left - margin_right
```

`effective_margin_left`에 `left_margin`이 포함되므로, 들여쓰기(left_margin > 0)가 있는  
소제목(ps_id=111) 문단에서는 `available_width`가 장제목(ps_id=109)보다 작아짐.  
클램핑이 항상 `ts.position > available_width`를 기준으로 작동하여 소제목의  
오른쪽 탭 위치가 잘못 축소됨.

### 수정 효과 (KTX.hwp 목차 SVG 검증)

| 항목 | 수정 전 | 수정 후 |
|------|---------|---------|
| 장제목(ps_id=109) 페이지번호 x | 717.5 | 717.5 |
| 소제목(ps_id=111) 페이지번호 x | ~700 | 717.9 |
| 차이 | ~17px | 0.4px (허용 범위) |

모든 목차 항목(장·소제목)의 페이지 번호가 x≈717.5-717.9로 동일 수직선에 정렬됨.

### 이전 revert 된 수정(commit 78330fd)과의 차이

이전 시도: `right_tab_width = col_area.width - margin_right` 로 `ts.available_width` 변경  
→ text wrapping에도 영향을 주어 revert

현재 수정: 클램핑 조건에 `tab_type != 1` 추가만 — wrapping에 영향 없음  
(`available_width`는 변경하지 않고, type=1 탭만 클램핑 생략)

---

## 3. 검증 결과

### 테스트

```
cargo test: 793 passed, 0 failed ✅
```

### Clippy

pre-existing 오류 8건 (table.rs, cursor_nav.rs) — 이번 변경과 무관.  
우리 변경 파일 3개(text_measurement.rs, svg.rs, web_canvas.rs)에는 새 warning 없음.

### KTX.hwp 목차 시각 확인

- 리더: `stroke-dasharray="0.1 3" stroke-linecap="round"` — 원형 점 확인
- 페이지번호 정렬: 장·소제목 모두 x≈717.5-717.9 (0.4px 이내) ✅

---

## 4. 완료 상태

| 항목 | 상태 |
|------|------|
| Stage 1: 조사 | ✅ 완료 |
| Stage 2: 리더 도트 수정 | ✅ 완료 |
| Stage 3: 소제목 탭 위치 수정 | ✅ 완료 |
| Stage 4: 검증 | ✅ 완료 |

→ Task #279 구현 완료. PR 준비 가능.
