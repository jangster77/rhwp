# Task #460 Stage 6 완료 보고서: 페이지에 걸친 대형 그림 anchor 처리

## 개요

HWP3 문서에서 대형 비-TAC 그림(bin_id=2, 533.6×474.4px)이 anchor 문단(pi=41)과 함께
페이지 2 하단에서 페이지 3으로 분할 표시되던 현상을 수정하였다.

## 버그 원인

`TypesetEngine::typeset_section()` 내 비-표 문단 처리 흐름:

1. `typeset_paragraph()` → anchor 문단 텍스트(21.3px)를 현재 페이지에 추가
2. 인라인 컨트롤 처리 루프 → 그림 높이(474.4px)를 `st.current_height`에 누적

이 순서로 인해, 텍스트만으로는 페이지에 들어가지만(21.3px < 30.7px 잔여)
그림 높이 포함 시 초과(21.3 + 474.4 = 495.7px > 30.7px)하는 경우에도
anchor 문단이 현재 페이지에 커밋된 후 그림이 넘침.

렌더러(layout)는 anchor 문단의 `para_y`를 기준으로 그림을 배치하므로,
anchor가 페이지 2 하단에 있으면 그림이 페이지 경계를 가로지르게 됨.

## 수정 내용

**파일**: `src/renderer/typeset.rs`

`typeset_paragraph()` 호출 직전에 선제적 쪽 나눔 검사를 추가:

```rust
// 비-TAC TopAndBottom VertRelTo::Para 그림이 있을 때:
// 텍스트 줄(para_h) + 그림 높이를 합산하여 현재 페이지를 초과하면
// 먼저 쪽 나눔 → anchor 문단과 그림을 같은 페이지에 배치
{
    use crate::model::shape::{TextWrap, VertRelTo};
    let non_tac_para_pic_h: f64 = para.controls.iter().filter_map(|c| {
        if let Control::Picture(pic) = c {
            if !pic.common.treat_as_char
                && matches!(pic.common.text_wrap, TextWrap::TopAndBottom)
                && matches!(pic.common.vert_rel_to, VertRelTo::Para)
            {
                let h = hwpunit_to_px(pic.common.height as i32, self.dpi);
                let mt = hwpunit_to_px(pic.common.margin.top as i32, self.dpi);
                let mb = hwpunit_to_px(pic.common.margin.bottom as i32, self.dpi);
                Some(h + mt + mb)
            } else { None }
        } else { None }
    }).sum();
    if non_tac_para_pic_h > 0.0 && !st.current_items.is_empty() {
        let para_h_px: f64 = para.line_segs.iter()
            .map(|s| hwpunit_to_px(s.line_height + s.line_spacing, self.dpi))
            .sum();
        if st.current_height + para_h_px + non_tac_para_pic_h > st.available_height() + 0.5 {
            st.advance_column_or_new_page();
        }
    }
}
```

**조건**:
- 비-TAC (`!treat_as_char`)
- TopAndBottom 배치 (`TextWrap::TopAndBottom`)
- 세로 위치 기준: 문단 (`VertRelTo::Para`)
- 현재 페이지에 이미 내용이 있을 것 (`!current_items.is_empty()`)
- 텍스트 + 그림 합산 높이가 잔여 공간 초과

## 디버깅 과정에서 발견한 사항

### TypesetEngine vs PaginationEngine

기본 조판 엔진은 `TypesetEngine` (`src/renderer/typeset.rs`)이다.
`PaginationEngine` (`src/renderer/pagination/engine.rs`)은 `RHWP_USE_PAGINATOR=1` 환경변수 시에만 사용되는 레거시 폴백이다.

이전 커밋의 수정은 PaginationEngine에 적용되었으므로 실제 동작에 영향이 없었다.
이번 Stage에서 TypesetEngine에 동일한 로직을 적용하였다.

## 검증 결과

| 항목 | 결과 |
|------|------|
| `cargo test --lib` | 1068 passed, 0 failed |
| `cargo test` (전체) | 1068 lib + 6 svg_snapshot + 1 tab_cross_run = 전부 통과 |
| `cargo build --release` | 성공 |
| hwp3-sample.hwp SVG 내보내기 | 17페이지 정상 완료 |
| 페이지 2 pi=41 제거 | 확인 — pi=40까지만, used=806.4px |
| 페이지 3 pi=41 + Shape | 확인 — Shape y=132.3px (body 상단), 474.4px 높이 |
| 그림 페이지 내 배치 | y=132.3 ~ y=606.7px (body 876.9px 이내) |

### 페이지 수 변화

수정 전 16페이지 → 수정 후 17페이지.
pi=41을 페이지 3으로 이동하면서 페이지 2가 pi=40까지만 포함하게 되어 자연스러운 +1.

### 잔존 LAYOUT_OVERFLOW_DRAW 경고

`pi=18446744073709551615 overflow=36.0px` — 꼬리말 내부 LINE_SEG 높이 문제.
이번 Stage 범위 외.

## 수정 파일

| 파일 | 변경 내용 |
|------|---------|
| `src/renderer/typeset.rs` | 비-TAC TopAndBottom Para 그림 선제적 쪽 나눔 추가 |
| `src/renderer/pagination/engine.rs` | 동일 로직 적용 (레거시 폴백 경로), debug eprintln! 제거 |
