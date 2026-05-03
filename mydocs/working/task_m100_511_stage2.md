# Task #511 Stage 2 완료 보고서 — 보완11: wrap cs linfo.sx 기반 보정

## 완료 일자

2026-05-01

## 작업 내용

### 문제 발견 (page4/page8 텍스트가 right indentation 초과)

`hwp3-sample5.hwp` 4쪽·8쪽 시각 확인 결과:

- **rhwp**: wrap zone 텍스트가 그림의 오른쪽 경계를 침범하여 표시
- **한컴**: 텍스트가 outer margin을 포함한 위치에서 정렬

### 원인 분석

기존 `column_start` 계산:

```
cs = pic_right_col = pic_x + pic_width (단위: HWPUNIT, column_left 기준)
```

HWP3 엔진이 저장하는 `linfo.sx`(줄당 x 시작, hunit):

```
sx = (pic_right_col + outer_margin) / 4  (hunit)
→ cs_sx = sx * 4 = pic_right_col + outer_margin (HWPUNIT)
```

실측값 비교:

| 페이지 | linfo.sx | cs_sx (HU) | 기존 cs (HU) | 차이 (HU) |
|--------|---------|------------|-------------|-----------|
| page4  | 9291    | 37164      | 35460       | +1704     |
| page8  | 6566    | 26264      | 24560       | +1704     |

차이 1704 HU = outer margin 6mm (양쪽 3mm×2) — HWP3 저장값이 outer margin을 이미 포함.

### 수정 내용 (보완11)

`src/parser/hwp3/mod.rs`의 `line_cs_sw` 계산 블록 수정 (~line 1401):

**기존**:
```rust
Some((cs, sw))
```

**수정 후**:
```rust
if linfo.sx > 0 {
    let cs_sx = (linfo.sx as i32) * 4;
    let sw_sx = (column_width_hu - cs_sx).max(0);
    Some((cs_sx, sw_sx))
} else {
    Some((cs, sw))
}
```

- `linfo.sx > 0`: HWP3 엔진이 저장한 실제 줄 시작 x → outer margin 자동 포함
- `linfo.sx == 0`: 기존 geometry 기반 계산 폴백 (비wrap 줄 / 여백 줄)

### 검증 결과

```
cargo build    → Finished dev profile ✓
cargo test     → 6 passed (golden_svg) + 1 passed (tab_cross_run) ✓
cargo clippy   → 경고 없음 ✓
```

SVG 확인:

| 페이지 | 이전 첫 wrap 텍스트 x | 수정 후 | 한컴 기대값 |
|--------|---------------------|---------|-----------|
| page4  | ~529.5px (35460HU)  | 552.2px (37164HU) | ≈552px ✓ |
| page8  | ~384.2px (24560HU)  | 406.9px (26264HU) | ≈407px ✓ |

## 변경 파일

| 파일 | 변경 |
|------|------|
| `src/parser/hwp3/mod.rs` | 보완11: linfo.sx > 0 시 cs_sx 사용 |

## 커밋

`afac4d2` Task #511 Stage 2: HWP3 Square wrap cs 보정 (보완11 linfo.sx 기반)
