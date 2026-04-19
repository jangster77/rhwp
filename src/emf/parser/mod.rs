//! EMF 파서 루트 — 스트림 reader + 레코드 디스패처.

pub mod constants;
pub mod objects;
pub mod records;

pub use objects::header::Header;

use super::Error;
use records::Record;

/// EMR_HEADER의 RecordType 값.
const RT_HEADER: u32 = 1;
/// EMR_EOF의 RecordType 값.
const RT_EOF: u32 = 14;

/// EMF 바이트를 레코드 시퀀스로 파싱.
pub fn parse(bytes: &[u8]) -> Result<Vec<Record>, Error> {
    let mut cursor = Cursor::new(bytes);
    let mut out = Vec::new();

    // 첫 레코드: EMR_HEADER (필수).
    let first = cursor.peek_record_header()?;
    if first.record_type != RT_HEADER {
        return Err(Error::InvalidFirstRecord { got: first.record_type });
    }
    let header_record = records::header::parse(&mut cursor)?;
    out.push(Record::Header(header_record));

    // 나머지 레코드: 현재 단계(10)는 Unknown으로 보존만, EOF에서 종료.
    while !cursor.is_empty() {
        let rh = cursor.peek_record_header()?;
        let offset = cursor.position();
        let payload_len = (rh.size as usize)
            .checked_sub(8)
            .ok_or(Error::RecordTooSmall { offset, size: rh.size })?;
        let _ = cursor.take(8)?;                   // type+size
        let payload = cursor.take(payload_len)?;

        if rh.record_type == RT_EOF {
            out.push(Record::Eof);
            break;
        }
        out.push(Record::Unknown {
            record_type: rh.record_type,
            payload: payload.to_vec(),
        });
    }

    Ok(out)
}

/// 레코드 공통 헤더(8바이트).
#[derive(Debug, Clone, Copy)]
pub struct RecordHeader {
    pub record_type: u32,
    pub size: u32,
}

/// 리틀엔디언 스트림 리더. EMF 전역에서 재사용.
pub struct Cursor<'a> {
    buf: &'a [u8],
    pos: usize,
}

impl<'a> Cursor<'a> {
    #[inline]
    pub fn new(buf: &'a [u8]) -> Self { Self { buf, pos: 0 } }
    #[inline]
    pub fn position(&self) -> usize { self.pos }
    #[inline]
    pub fn remaining(&self) -> usize { self.buf.len() - self.pos }
    #[inline]
    pub fn is_empty(&self) -> bool { self.pos >= self.buf.len() }

    pub fn take(&mut self, n: usize) -> Result<&'a [u8], Error> {
        if self.remaining() < n {
            return Err(Error::UnexpectedEof { at: self.pos, need: n });
        }
        let s = &self.buf[self.pos..self.pos + n];
        self.pos += n;
        Ok(s)
    }

    pub fn peek(&self, n: usize) -> Result<&'a [u8], Error> {
        if self.remaining() < n {
            return Err(Error::UnexpectedEof { at: self.pos, need: n });
        }
        Ok(&self.buf[self.pos..self.pos + n])
    }

    pub fn u32(&mut self) -> Result<u32, Error> {
        let b = self.take(4)?;
        Ok(u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    }
    pub fn i32(&mut self) -> Result<i32, Error> {
        Ok(self.u32()? as i32)
    }
    pub fn u16(&mut self) -> Result<u16, Error> {
        let b = self.take(2)?;
        Ok(u16::from_le_bytes([b[0], b[1]]))
    }

    pub fn peek_record_header(&self) -> Result<RecordHeader, Error> {
        let b = self.peek(8)?;
        let record_type = u32::from_le_bytes([b[0], b[1], b[2], b[3]]);
        let size = u32::from_le_bytes([b[4], b[5], b[6], b[7]]);
        if size < 8 {
            return Err(Error::RecordTooSmall { offset: self.pos, size });
        }
        if size % 4 != 0 {
            return Err(Error::MisalignedRecord { offset: self.pos, size });
        }
        Ok(RecordHeader { record_type, size })
    }
}
