//! Task #317 진단 테스트: paragraph current_height 추적
//! 임시 진단. 작업 완료 후 제거.

use rhwp::document_core::DocumentCore;

fn load_sample(name: &str) -> Vec<u8> {
    let path = format!("samples/hwpx/{}", name);
    std::fs::read(&path).unwrap_or_else(|e| panic!("샘플 로드 실패 {}: {}", path, e))
}

#[test]
#[ignore = "diagnostic"]
fn diag_h_02_direct_paginate() {
    let bytes = load_sample("hwpx-h-02.hwpx");
    eprintln!("==== DIRECT (HWPX 직접) ====");
    let _ = DocumentCore::from_bytes(&bytes).expect("HWPX");
}

#[test]
#[ignore = "diagnostic"]
fn diag_h_02_reload_paginate() {
    let bytes = load_sample("hwpx-h-02.hwpx");
    let mut a = DocumentCore::from_bytes(&bytes).expect("HWPX");
    let hwp = a.export_hwp_with_adapter().expect("export");
    eprintln!("==== RELOADED (HWPX → 어댑터 → HWP → 재로드) ====");
    let _ = DocumentCore::from_bytes(&hwp).expect("reload");
}
