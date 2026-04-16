//! Stage 2 검증용 — 텍스트(+탭/줄바꿈)를 담은 Document를 HWPX로 직렬화.
//!
//! 실행:
//! ```
//! cargo run --example hwpx_dump_text --release
//! ```

use std::fs;
use std::path::Path;

use rhwp::model::document::{Document, Section};
use rhwp::model::paragraph::Paragraph;
use rhwp::serializer::serialize_hwpx;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Stage 2.1 — 순수 텍스트
    write_one(
        "output/stage2_text.hwpx",
        "안녕 Hello 123",
    )?;

    // Stage 2.2 — 탭/줄바꿈 포함
    write_one(
        "output/stage2_ctrl.hwpx",
        "첫째\t탭 뒤\n둘째 줄\tTab\n셋째",
    )?;

    Ok(())
}

fn write_one(path: &str, text: &str) -> Result<(), Box<dyn std::error::Error>> {
    let mut doc = Document::default();
    let mut section = Section::default();
    let mut para = Paragraph::default();
    para.text = text.to_string();
    section.paragraphs.push(para);
    doc.sections.push(section);

    let bytes = serialize_hwpx(&doc)?;
    let p = Path::new(path);
    if let Some(dir) = p.parent() {
        fs::create_dir_all(dir)?;
    }
    fs::write(p, &bytes)?;
    println!("Wrote {} ({} bytes)", p.display(), bytes.len());
    Ok(())
}
