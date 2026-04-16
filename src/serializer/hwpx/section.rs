//! Contents/section{N}.xml — Section 본문 직렬화
//!
//! Stage 2.1: 첫 문단의 순수 텍스트를 `<hp:t/>` 자리에 주입.
//! Stage 2.2: 제어문자(탭/줄바꿈)를 `<hp:tab/>` / `<hp:lineBreak/>` 인라인 요소로 출력.
//!            (한컴 레퍼런스 패턴: `<hp:t>text<hp:lineBreak/>text</hp:t>`)

use crate::model::document::{Document, Section};
use super::utils::xml_escape;
use super::SerializeError;

const EMPTY_SECTION_XML: &str = include_str!("templates/empty_section0.xml");
const TEXT_SLOT: &str = "<hp:t/>";

pub fn write_section(
    section: &Section,
    _doc: &Document,
    _index: usize,
) -> Result<Vec<u8>, SerializeError> {
    let injected = match section.paragraphs.first() {
        Some(p) if !p.text.is_empty() => {
            let rendered = render_text_run(&p.text);
            EMPTY_SECTION_XML.replacen(TEXT_SLOT, &rendered, 1)
        }
        _ => EMPTY_SECTION_XML.to_string(),
    };
    Ok(injected.into_bytes())
}

/// 문단 텍스트를 `<hp:t>` 하나에 담되, `\t`/`\n`을 인라인 요소로 분리 출력한다.
/// 그 외 HWP 제어 문자(U+0001..U+001F)는 무시(삭제)한다 — Stage 2.3 이후 확장.
fn render_text_run(text: &str) -> String {
    let mut out = String::with_capacity(text.len() + 16);
    out.push_str("<hp:t>");
    let mut buf = String::new();
    for c in text.chars() {
        match c {
            '\t' => {
                flush(&mut out, &mut buf);
                out.push_str("<hp:tab/>");
            }
            '\n' => {
                flush(&mut out, &mut buf);
                out.push_str("<hp:lineBreak/>");
            }
            c if (c as u32) < 0x20 => {
                // 그 외 제어문자: Stage 2.3까지 무시
            }
            c => buf.push(c),
        }
    }
    flush(&mut out, &mut buf);
    out.push_str("</hp:t>");
    out
}

fn flush(out: &mut String, buf: &mut String) {
    if !buf.is_empty() {
        out.push_str(&xml_escape(buf));
        buf.clear();
    }
}
