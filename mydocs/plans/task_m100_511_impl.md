# 구현계획서: Task #511 — HWP3 Square wrap 렌더링 세부 보정

## 구현 현황

cherry-pick으로 3개 커밋이 local/task511에 적용됨. 빌드/테스트 통과 확인 완료.

## 단계 구성

### 1단계: 검증 + 단계별 완료보고서

**작업**:
- `cargo build` / `cargo test` 통과 확인 ✅ (완료)
- SVG 시각 확인 (`hwp3-sample5.hwp` p27) ✅ (완료)
- 단계별 완료보고서 `mydocs/working/task_m100_511_stage1.md` 작성

**커밋 대상**: 보완6-8 커밋 이미 존재. 보고서 문서만 추가 커밋.

### 2단계: 최종 보고서 + 오늘할일 갱신

**작업**:
- `mydocs/report/task_m100_511_report.md` 작성
- `mydocs/orders/20260501.md` task511 항목 추가
- 최종 커밋 후 local/devel merge 요청

## 파일 변경 목록 (보완6-8)

| 파일 | 변경 내용 |
|------|---------|
| `src/model/paragraph.rs` | `wrap_precomputed: bool` 필드 추가 |
| `src/parser/hwp3/mod.rs` | wrap_precomputed 설정 (보완6) + 앵커 높이 보정 (보완7) + single-LineSeg 감지 (보완8) |
| `src/renderer/typeset.rs` | wrap_precomputed=true 문단 처리 분기 |
| `src/renderer/layout/paragraph_layout.rs` | line_cs_offset + effective_col_x 병합 x오프셋 |
| `src/renderer/layout.rs` | wrap_precomputed 플래그로 Square wrap 재처리 스킵 |
