//! PDF 렌더러 (Task #21)
//!
//! SVG 렌더러의 출력을 svg2pdf로 변환하여 PDF를 생성한다.
//! 네이티브 전용 (WASM 미지원).

/// 폰트 데이터베이스를 초기화 (시스템 폰트 + 프로젝트 폰트 로드)
#[cfg(not(target_arch = "wasm32"))]
fn create_fontdb() -> usvg::fontdb::Database {
    let mut fontdb = usvg::fontdb::Database::new();
    // 시스템 폰트 로드
    fontdb.load_system_fonts();
    // 프로젝트 폰트 디렉토리 로드
    for dir in &["ttfs", "ttfs/windows", "ttfs/hwp"] {
        if std::path::Path::new(dir).exists() {
            fontdb.load_fonts_dir(dir);
        }
    }
    // WSL 환경: Windows 폰트 디렉토리
    if std::path::Path::new("/mnt/c/Windows/Fonts").exists() {
        fontdb.load_fonts_dir("/mnt/c/Windows/Fonts");
    }
    // 한글 폰트 fallback 설정
    fontdb.set_serif_family("바탕");
    fontdb.set_sans_serif_family("맑은 고딕");
    fontdb.set_monospace_family("D2Coding");
    fontdb
}

/// SVG에서 없는 한글 폰트명에 fallback 추가
#[cfg(not(target_arch = "wasm32"))]
fn add_font_fallbacks(svg: &str) -> String {
    let svg = svg.replace("font-family=\"휴먼명조\"", "font-family=\"휴먼명조, 바탕, serif\"");
    let svg = svg.replace("font-family=\"HCI Poppy\"", "font-family=\"HCI Poppy, 맑은 고딕, sans-serif\"");
    svg
}

/// 단일 SVG를 PDF로 변환
#[cfg(not(target_arch = "wasm32"))]
pub fn svg_to_pdf(svg_content: &str) -> Result<Vec<u8>, String> {
    let fontdb = create_fontdb();
    let mut options = usvg::Options::default();
    options.fontdb = std::sync::Arc::new(fontdb);
    let svg_with_fallback = add_font_fallbacks(svg_content);
    let tree = usvg::Tree::from_str(&svg_with_fallback, &options)
        .map_err(|e| format!("SVG 파싱 실패: {}", e))?;
    let pdf = svg2pdf::to_pdf(&tree, svg2pdf::ConversionOptions::default(), svg2pdf::PageOptions::default())
        .map_err(|e| format!("PDF 변환 실패: {:?}", e))?;
    Ok(pdf)
}

/// 여러 SVG 페이지를 단일 PDF로 병합
#[cfg(not(target_arch = "wasm32"))]
pub fn svgs_to_pdf(svg_pages: &[String]) -> Result<Vec<u8>, String> {
    if svg_pages.is_empty() {
        return Err("페이지가 없습니다".to_string());
    }
    if svg_pages.len() == 1 {
        return svg_to_pdf(&svg_pages[0]);
    }

    // 각 SVG를 개별 PDF로 변환
    let fontdb = create_fontdb();
    let mut options = usvg::Options::default();
    options.fontdb = std::sync::Arc::new(fontdb);

    let mut page_pdfs: Vec<Vec<u8>> = Vec::new();
    for svg in svg_pages {
        let svg_with_fallback = add_font_fallbacks(svg);
        let tree = usvg::Tree::from_str(&svg_with_fallback, &options)
            .map_err(|e| format!("SVG 파싱 실패: {}", e))?;
        let pdf = svg2pdf::to_pdf(&tree, svg2pdf::ConversionOptions::default(), svg2pdf::PageOptions::default())
            .map_err(|e| format!("PDF 변환 실패: {:?}", e))?;
        page_pdfs.push(pdf);
    }

    // lopdf로 병합
    merge_pdfs(&page_pdfs)
}

/// 여러 단일 페이지 PDF를 하나로 병합 (pdf-writer 기반)
#[cfg(not(target_arch = "wasm32"))]
fn merge_pdfs(pdfs: &[Vec<u8>]) -> Result<Vec<u8>, String> {
    if pdfs.len() == 1 {
        return Ok(pdfs[0].clone());
    }

    let mut base = lopdf::Document::load_mem(&pdfs[0])
        .map_err(|e| format!("PDF 로드 실패: {}", e))?;

    for pdf_bytes in &pdfs[1..] {
        let src = lopdf::Document::load_mem(pdf_bytes)
            .map_err(|e| format!("PDF 로드 실패: {}", e))?;

        // 소스의 모든 객체를 base에 복사
        let mut id_map = std::collections::BTreeMap::new();
        for (&id, obj) in &src.objects {
            let new_id = base.add_object(obj.clone());
            id_map.insert(id, new_id);
        }

        // 복사된 객체 내부의 참조를 모두 재매핑
        let new_ids: Vec<lopdf::ObjectId> = id_map.values().copied().collect();
        for new_id in &new_ids {
            if let Ok(obj) = base.get_object_mut(*new_id) {
                remap_object(obj, &id_map);
            }
        }

        // Pages에 새 페이지 추가
        let src_pages = src.get_pages();
        for (_, &page_id) in src_pages.iter() {
            if let Some(&new_page_id) = id_map.get(&page_id) {
                let pages_id = base.catalog()
                    .ok()
                    .and_then(|c| c.get(b"Pages").ok())
                    .and_then(|p| p.as_reference().ok())
                    .ok_or_else(|| "Pages 참조 실패".to_string())?;

                // Parent 설정
                if let Ok(page_obj) = base.get_object_mut(new_page_id) {
                    if let lopdf::Object::Dictionary(ref mut page_dict) = page_obj {
                        page_dict.set("Parent", lopdf::Object::Reference(pages_id));
                    }
                }

                // Kids에 추가 + Count 증가
                if let Ok(pages_obj) = base.get_object_mut(pages_id) {
                    if let lopdf::Object::Dictionary(ref mut dict) = pages_obj {
                        if let Ok(kids) = dict.get_mut(b"Kids") {
                            if let lopdf::Object::Array(ref mut arr) = kids {
                                arr.push(lopdf::Object::Reference(new_page_id));
                            }
                        }
                        if let Ok(count) = dict.get_mut(b"Count") {
                            if let lopdf::Object::Integer(ref mut n) = count {
                                *n += 1;
                            }
                        }
                    }
                }
            }
        }
    }

    let mut output = Vec::new();
    base.save_to(&mut output)
        .map_err(|e| format!("PDF 저장 실패: {}", e))?;
    Ok(output)
}

/// 재귀적으로 객체 내부의 참조를 재매핑
#[cfg(not(target_arch = "wasm32"))]
fn remap_object(obj: &mut lopdf::Object, id_map: &std::collections::BTreeMap<lopdf::ObjectId, lopdf::ObjectId>) {
    match obj {
        lopdf::Object::Reference(ref mut id) => {
            if let Some(&new_id) = id_map.get(id) {
                *id = new_id;
            }
        }
        lopdf::Object::Array(ref mut arr) => {
            for item in arr.iter_mut() {
                remap_object(item, id_map);
            }
        }
        lopdf::Object::Dictionary(ref mut dict) => {
            for (_, value) in dict.iter_mut() {
                remap_object(value, id_map);
            }
        }
        lopdf::Object::Stream(ref mut stream) => {
            for (_, value) in stream.dict.iter_mut() {
                remap_object(value, id_map);
            }
        }
        _ => {}
    }
}
