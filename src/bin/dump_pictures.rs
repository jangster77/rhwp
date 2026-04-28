use rhwp::model::control::Control;
use std::fs;

fn main() {
    let data = fs::read("samples/hwp3-sample.hwp").expect("Failed to read file");
    let doc = rhwp::parse_document(&data).expect("parse_document");
    for section in &doc.sections {
        for (para_idx, para) in section.paragraphs.iter().enumerate() {
            for (ctrl_idx, ctrl) in para.controls.iter().enumerate() {
                match ctrl {
                    Control::Picture(pic) => {
                        println!("Picture at Para {}, Ctrl {}:", para_idx, ctrl_idx);
                        println!("  treat_as_char: {}", pic.common.treat_as_char);
                        println!("  text_wrap: {:?}", pic.common.text_wrap);
                        if let Some(caption) = &pic.caption {
                            println!("  caption: yes");
                            for (c_p_idx, c_para) in caption.paragraphs.iter().enumerate() {
                                println!("    cap para {}: text: {:?}", c_p_idx, c_para.text);
                                for c_ctrl in &c_para.controls {
                                    println!("      ctrl: {:?}", c_ctrl);
                                }
                            }
                        } else {
                            println!("  caption: no");
                        }
                    }
                    _ => {}
                }
            }
        }
    }
}
