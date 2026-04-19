//! EMF 레코드 enum. 단계 10에서는 Header / Eof / Unknown만.
//! 후속 단계에서 variant 확장.

pub mod header;

use super::objects::Header;

/// 파싱된 EMF 레코드. 단계 10에서는 Header와 Eof 외 모든 레코드를 Unknown으로 보존한다.
#[derive(Debug, Clone)]
pub enum Record {
    Header(Header),
    Eof,
    /// 미분기 레코드. `payload`는 type/size 8바이트를 **제외**한 나머지.
    Unknown { record_type: u32, payload: Vec<u8> },
}
