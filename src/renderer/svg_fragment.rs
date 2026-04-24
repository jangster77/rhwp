//! SVG 조각 파서 유틸리티 (Task #275)
//!
//! RenderNodeType::RawSvg 에 담긴 SVG 조각 (shape_layout.rs 가 생성) 을
//! 파싱·디코드하기 위한 문자열 유틸. 네이티브/WASM 양쪽에서 사용 가능.

/// SVG 조각에서 `attr="..."` 값을 추출한다.
///
/// 간단한 속성 추출기 — 따옴표 이스케이프는 지원하지 않으나,
/// rhwp 가 만드는 OLE/EMF/OOXML SVG 조각은 모두 단순 따옴표 속성만 사용한다.
///
/// 단어 경계 보장: 속성명 앞에 공백/탭/개행이 있거나 문자열 선두에 위치할 때만 매칭.
/// (예: `href` 검색 시 `xlink:href` 를 잘못 매칭하지 않도록)
pub(crate) fn find_svg_attr_value<'a>(s: &'a str, attr: &str) -> Option<&'a str> {
    let needle = format!("{}=\"", attr);
    let mut search_from = 0;
    while let Some(idx) = s[search_from..].find(&needle) {
        let pos = search_from + idx;
        let is_boundary = if pos == 0 {
            false
        } else {
            let prev = s.as_bytes()[pos - 1];
            prev == b' ' || prev == b'\t' || prev == b'\n' || prev == b'\r'
        };
        if !is_boundary {
            search_from = pos + needle.len();
            continue;
        }
        let value_start = pos + needle.len();
        let end = s[value_start..].find('"')?;
        return Some(&s[value_start..value_start + end]);
    }
    None
}

/// `<image ... href="data:..." .../>` 단일 요소 조각에서 data URL 추출.
///
/// 조건:
/// - 조각이 `<image` 로 시작하고 `/>` 로 끝남 (trim 후)
/// - 여는 태그 개수 (`<`) 가 정확히 1 (복합 SVG 차단)
/// - `xlink:href` 또는 `href` 속성이 `data:` 스킴
///
/// `xlink:href` 우선 (OLE native_image 경로는 둘 다 동일 값을 넣으므로 무관).
pub(crate) fn try_parse_single_image_data_url(svg: &str) -> Option<&str> {
    let s = svg.trim();
    if !s.starts_with("<image") || !s.ends_with("/>") {
        return None;
    }
    if s.matches('<').count() != 1 {
        return None;
    }
    let href = find_svg_attr_value(s, "xlink:href")
        .or_else(|| find_svg_attr_value(s, "href"))?;
    if !href.starts_with("data:") {
        return None;
    }
    Some(href)
}

/// `data:MIME;base64,BASE64` 형식 data URL 을 디코드하여 (mime, bytes) 반환.
///
/// 비-base64 data URL (text/plain 등 percent-encoded) 은 지원하지 않고 None 반환.
pub(crate) fn decode_base64_data_url(data_url: &str) -> Option<(String, Vec<u8>)> {
    use base64::Engine;
    let rest = data_url.strip_prefix("data:")?;
    let comma = rest.find(',')?;
    let header = &rest[..comma];
    let payload = &rest[comma + 1..];
    let (mime, is_base64) = if let Some(m) = header.strip_suffix(";base64") {
        (m, true)
    } else {
        (header, false)
    };
    if !is_base64 {
        return None;
    }
    let bytes = base64::engine::general_purpose::STANDARD.decode(payload).ok()?;
    Some((mime.to_string(), bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn find_attr_basic() {
        let s = r#"<image x="1.0" y="2.0" width="3.0" href="data:foo" />"#;
        assert_eq!(find_svg_attr_value(s, "x"), Some("1.0"));
        assert_eq!(find_svg_attr_value(s, "y"), Some("2.0"));
        assert_eq!(find_svg_attr_value(s, "width"), Some("3.0"));
        assert_eq!(find_svg_attr_value(s, "href"), Some("data:foo"));
    }

    #[test]
    fn find_attr_word_boundary() {
        // `href` 검색이 `xlink:href` 를 잘못 매칭하지 않아야 함
        let s = r#"<image xlink:href="data:A" href="data:B"/>"#;
        assert_eq!(find_svg_attr_value(s, "href"), Some("data:B"));
        assert_eq!(find_svg_attr_value(s, "xlink:href"), Some("data:A"));
    }

    #[test]
    fn find_attr_missing() {
        let s = r#"<image x="1"/>"#;
        assert_eq!(find_svg_attr_value(s, "nope"), None);
    }

    #[test]
    fn parse_single_image_xlink_href() {
        // shape_layout.rs:1059-1062 가 만드는 실제 형식
        let frag = r#"<image x="10.50" y="20.75" width="100.00" height="50.00" preserveAspectRatio="xMidYMid meet" xlink:href="data:image/png;base64,AAAA" href="data:image/png;base64,AAAA"/>"#;
        assert_eq!(
            try_parse_single_image_data_url(frag),
            Some("data:image/png;base64,AAAA")
        );
    }

    #[test]
    fn parse_single_image_href_only() {
        let frag = r#"<image x="0" y="0" width="10" height="10" href="data:image/jpeg;base64,ZZZ"/>"#;
        assert_eq!(
            try_parse_single_image_data_url(frag),
            Some("data:image/jpeg;base64,ZZZ")
        );
    }

    #[test]
    fn parse_single_image_leading_whitespace() {
        let frag = "\n  <image href=\"data:x\"/>\n  ";
        assert_eq!(try_parse_single_image_data_url(frag), Some("data:x"));
    }

    #[test]
    fn parse_single_image_rejects_group() {
        // EMF/OOXML 복합 SVG 는 A 경로로 빠지지 않아야 함
        let g_emf = r#"<g transform="matrix(1,0,0,1,0,0)"><rect x="0" y="0" width="10" height="10"/></g>"#;
        assert_eq!(try_parse_single_image_data_url(g_emf), None);

        let g_chart = r#"<g class="hwp-ooxml-chart"><rect/><text>..</text></g>"#;
        assert_eq!(try_parse_single_image_data_url(g_chart), None);
    }

    #[test]
    fn parse_single_image_rejects_non_data_href() {
        let frag = r#"<image href="http://example.com/a.png"/>"#;
        assert_eq!(try_parse_single_image_data_url(frag), None);
    }

    #[test]
    fn parse_single_image_rejects_missing_href() {
        let frag = r#"<image x="0" y="0" width="10" height="10"/>"#;
        assert_eq!(try_parse_single_image_data_url(frag), None);
    }

    #[test]
    fn decode_data_url_png() {
        // PNG 매직 8바이트
        let url = "data:image/png;base64,iVBORw0KGgo=";
        let (mime, bytes) = decode_base64_data_url(url).expect("decode");
        assert_eq!(mime, "image/png");
        assert_eq!(bytes, vec![0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    }

    #[test]
    fn decode_data_url_rejects_non_base64() {
        let url = "data:text/plain,hello";
        assert_eq!(decode_base64_data_url(url), None);
    }

    #[test]
    fn decode_data_url_rejects_malformed() {
        assert_eq!(decode_base64_data_url("not a data url"), None);
        assert_eq!(decode_base64_data_url("data:image/png;base64"), None); // 콤마 없음
        assert_eq!(
            decode_base64_data_url("data:image/png;base64,!!!invalid!!!"),
            None
        );
    }
}
