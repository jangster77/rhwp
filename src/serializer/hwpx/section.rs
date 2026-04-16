//! Contents/section{N}.xml — Section 본문 직렬화
//!
//! Stage 1: 한컴2020 레퍼런스(ref_empty.hwpx) 템플릿을 그대로 사용.
//! Stage 2.1: 첫 문단의 텍스트를 템플릿의 `<hp:t/>` 자리에 주입한다.
//!            (단일 문단 · 제어문자 없음 가정 — Stage 2.2에서 제어문자, 2.4에서 다중 문단·IR 기반 생성으로 확장)

use crate::model::document::{Document, Section};
use super::utils::xml_escape;
use super::SerializeError;

const EMPTY_SECTION_XML: &str = include_str!("templates/empty_section0.xml");

/// 템플릿 내 빈 텍스트 런 자리 — 여기에 `<hp:t>{escaped}</hp:t>`를 주입한다.
const TEXT_SLOT: &str = "<hp:t/>";

pub fn write_section(
    section: &Section,
    _doc: &Document,
    _index: usize,
) -> Result<Vec<u8>, SerializeError> {
    // 첫 문단의 순수 텍스트만 주입 (제어문자는 Stage 2.2에서 처리)
    let injected = match section.paragraphs.first() {
        Some(p) if !p.text.is_empty() && !has_control_chars(&p.text) => {
            let escaped = xml_escape(&p.text);
            let replacement = format!("<hp:t>{}</hp:t>", escaped);
            EMPTY_SECTION_XML.replacen(TEXT_SLOT, &replacement, 1)
        }
        _ => EMPTY_SECTION_XML.to_string(),
    };
    Ok(injected.into_bytes())
}

/// HWP 제어 문자(U+0001..U+001F 중 일반 문자가 아닌 것) 존재 여부.
/// Stage 2.2 전까지는 이런 문단은 빈 템플릿을 유지해 한컴 오픈을 깨지 않는다.
fn has_control_chars(s: &str) -> bool {
    s.chars().any(|c| (c as u32) < 0x20 && c != '\n' && c != '\t')
}
