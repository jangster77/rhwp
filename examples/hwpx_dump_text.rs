//! Stage 2 검증용 — 텍스트 한 줄을 담은 Document를 HWPX로 직렬화.
//!
//! 실행:
//! ```
//! cargo run --example hwpx_dump_text --release
//! ```
//!
//! 출력: `output/stage2_text.hwpx` (한글2020에서 오픈 시 "안녕 Hello 123" 표시 확인)

use std::fs;
use std::path::Path;

use rhwp::model::document::{Document, Section};
use rhwp::model::paragraph::Paragraph;
use rhwp::serializer::serialize_hwpx;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut doc = Document::default();
    let mut section = Section::default();
    let mut para = Paragraph::default();
    para.text = "안녕 Hello 123".to_string();
    section.paragraphs.push(para);
    doc.sections.push(section);

    let bytes = serialize_hwpx(&doc)?;

    let out_dir = Path::new("output");
    fs::create_dir_all(out_dir)?;
    let out_path = out_dir.join("stage2_text.hwpx");
    fs::write(&out_path, &bytes)?;

    println!("Wrote {} ({} bytes)", out_path.display(), bytes.len());
    Ok(())
}
