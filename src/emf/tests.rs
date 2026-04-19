//! 단계 10 단위 테스트 — EMR_HEADER 파싱 + 레코드 시퀀스 읽기.

use super::*;
use super::parser::records::Record;

/// 최소 88바이트 EMR_HEADER + EMR_EOF(0x14바이트) 조합. ext 없음.
fn fixture_minimal_header_eof() -> Vec<u8> {
    let mut b = Vec::with_capacity(88 + 20);

    // EMR_HEADER (88바이트)
    b.extend_from_slice(&1u32.to_le_bytes());             // Type=1
    b.extend_from_slice(&88u32.to_le_bytes());            // Size=88
    // Bounds RECTL (16B)
    b.extend_from_slice(&0i32.to_le_bytes());
    b.extend_from_slice(&0i32.to_le_bytes());
    b.extend_from_slice(&1000i32.to_le_bytes());
    b.extend_from_slice(&500i32.to_le_bytes());
    // Frame RECTL (16B) — 0.01mm 단위
    b.extend_from_slice(&0i32.to_le_bytes());
    b.extend_from_slice(&0i32.to_le_bytes());
    b.extend_from_slice(&10000i32.to_le_bytes());
    b.extend_from_slice(&5000i32.to_le_bytes());
    // Signature " EMF"
    b.extend_from_slice(&0x464D4520u32.to_le_bytes());
    // Version
    b.extend_from_slice(&0x00010000u32.to_le_bytes());
    // Bytes (전체 파일 크기) / Records / Handles / Reserved
    b.extend_from_slice(&108u32.to_le_bytes());           // 88 + 20 EOF
    b.extend_from_slice(&2u32.to_le_bytes());             // Records
    b.extend_from_slice(&1u16.to_le_bytes());             // Handles
    b.extend_from_slice(&0u16.to_le_bytes());             // Reserved
    // nDescription / offDescription / nPalEntries
    b.extend_from_slice(&0u32.to_le_bytes());
    b.extend_from_slice(&0u32.to_le_bytes());
    b.extend_from_slice(&0u32.to_le_bytes());
    // Device SIZEL (8B)
    b.extend_from_slice(&1920i32.to_le_bytes());
    b.extend_from_slice(&1080i32.to_le_bytes());
    // Millimeters SIZEL (8B)
    b.extend_from_slice(&508i32.to_le_bytes());
    b.extend_from_slice(&286i32.to_le_bytes());
    assert_eq!(b.len(), 88);

    // EMR_EOF (최소 20바이트: type+size + nPalEntries(4) + offPalEntries(4) + SizeLast(4))
    b.extend_from_slice(&14u32.to_le_bytes());            // Type=14
    b.extend_from_slice(&20u32.to_le_bytes());            // Size=20
    b.extend_from_slice(&0u32.to_le_bytes());             // nPalEntries
    b.extend_from_slice(&0u32.to_le_bytes());             // offPalEntries
    b.extend_from_slice(&20u32.to_le_bytes());            // SizeLast

    b
}

#[test]
fn parses_minimal_header_and_eof() {
    let bytes = fixture_minimal_header_eof();
    let records = parse_emf(&bytes).expect("parse");
    assert_eq!(records.len(), 2);

    match &records[0] {
        Record::Header(h) => {
            assert_eq!(h.signature, 0x464D4520);
            assert_eq!(h.bounds.right, 1000);
            assert_eq!(h.bounds.bottom, 500);
            assert_eq!(h.device.cx, 1920);
            assert_eq!(h.handles, 1);
            assert!(h.ext1.is_none());
            assert!(h.ext2.is_none());
        }
        other => panic!("first record not Header: {other:?}"),
    }
    matches!(records[1], Record::Eof);
}

#[test]
fn rejects_bad_signature() {
    let mut bytes = fixture_minimal_header_eof();
    // signature는 EMR_HEADER 시작 + 40 = offset 40에 위치. Type/Size 제외하면 [40..44].
    bytes[40] = 0xAA;
    bytes[41] = 0xBB;
    bytes[42] = 0xCC;
    bytes[43] = 0xDD;
    match parse_emf(&bytes) {
        Err(Error::InvalidSignature { got }) => {
            assert_eq!(got, 0xDDCCBBAA);
        }
        other => panic!("expected InvalidSignature, got {other:?}"),
    }
}

#[test]
fn rejects_non_header_first_record() {
    // type=14(EOF)를 선두에 둔 손상된 EMF.
    let mut b = Vec::new();
    b.extend_from_slice(&14u32.to_le_bytes());
    b.extend_from_slice(&20u32.to_le_bytes());
    b.extend_from_slice(&[0u8; 12]);
    match parse_emf(&b) {
        Err(Error::InvalidFirstRecord { got }) => assert_eq!(got, 14),
        other => panic!("expected InvalidFirstRecord, got {other:?}"),
    }
}

#[test]
fn rejects_misaligned_record() {
    let mut b = Vec::new();
    b.extend_from_slice(&1u32.to_le_bytes());
    b.extend_from_slice(&87u32.to_le_bytes()); // size not multiple of 4
    b.extend_from_slice(&[0u8; 79]);
    match parse_emf(&b) {
        Err(Error::MisalignedRecord { size, .. }) => assert_eq!(size, 87),
        other => panic!("expected MisalignedRecord, got {other:?}"),
    }
}

#[test]
fn parses_header_with_extensions() {
    // Size=108 (ext1+ext2 포함)로 빌드.
    let mut b = Vec::new();
    b.extend_from_slice(&1u32.to_le_bytes());
    b.extend_from_slice(&108u32.to_le_bytes()); // Size=108
    // 80B 본체
    for _ in 0..20 {
        b.extend_from_slice(&0u32.to_le_bytes());
    }
    // signature는 offset 40에 있어야 함 → b[40..44]. 지금까지 8(type/size)+80 = 88.
    // 이미 0으로 채워져 있으니 offset 40의 4바이트를 signature로 교체.
    b[40..44].copy_from_slice(&0x464D4520u32.to_le_bytes());

    // ext1 (12B): cbPixelFormat, offPixelFormat, bOpenGL
    b.extend_from_slice(&0u32.to_le_bytes());
    b.extend_from_slice(&0u32.to_le_bytes());
    b.extend_from_slice(&1u32.to_le_bytes());
    // ext2 (8B)
    b.extend_from_slice(&12345u32.to_le_bytes());
    b.extend_from_slice(&6789u32.to_le_bytes());
    assert_eq!(b.len(), 108);

    // EOF
    b.extend_from_slice(&14u32.to_le_bytes());
    b.extend_from_slice(&20u32.to_le_bytes());
    b.extend_from_slice(&[0u8; 12]);

    let records = parse_emf(&b).expect("parse");
    let Record::Header(h) = &records[0] else { panic!() };
    assert_eq!(h.ext1.unwrap().b_open_gl, 1);
    assert_eq!(h.ext2.unwrap().micrometers_x, 12345);
    assert_eq!(h.ext2.unwrap().micrometers_y, 6789);
}

#[test]
fn preserves_unknown_records_as_payload() {
    // Header + Unknown(type=0x00000054 = ExtTextOutW, 단계 13에서 분기) + EOF
    let mut b = fixture_minimal_header_eof();
    // Insert unknown BEFORE eof. fixture_minimal_header_eof는 88 + 20 = 108 바이트.
    // EOF 구간(마지막 20바이트)을 잘라내고, Unknown(16B) + EOF(20B) 재조립.
    let eof = b.split_off(88);
    b.extend_from_slice(&0x00000054u32.to_le_bytes());    // Type=ExtTextOutW
    b.extend_from_slice(&16u32.to_le_bytes());            // Size=16
    b.extend_from_slice(&0xDEADBEEFu32.to_le_bytes());    // 페이로드
    b.extend_from_slice(&0xCAFEBABEu32.to_le_bytes());
    b.extend_from_slice(&eof);

    let records = parse_emf(&b).expect("parse");
    assert_eq!(records.len(), 3);
    match &records[1] {
        Record::Unknown { record_type, payload } => {
            assert_eq!(*record_type, 0x00000054);
            assert_eq!(payload.len(), 8);
        }
        other => panic!("expected Unknown, got {other:?}"),
    }
}
