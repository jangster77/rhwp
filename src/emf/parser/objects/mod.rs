//! EMF 공통 구조체 — RECTL/POINTL/SIZEL, Header 등. 단계 10은 헤더에 필요한 것만.

pub mod header;
pub mod rectl;

pub use header::Header;
pub use rectl::{PointL, RectL, SizeL};
