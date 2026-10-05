use std::{collections::VecDeque, sync::Mutex};

#[derive(Default)]
struct Results {
    next: u64,
    pdfs: VecDeque<(String, Vec<u8>)>,
}

#[derive(Default)]
pub struct PdfStore(Mutex<Results>);

impl PdfStore {
    pub fn insert(&self, bytes: Vec<u8>) -> Result<String, String> {
        let mut results = self
            .0
            .lock()
            .map_err(|_| "PDF結果を保持できませんでした。")?;
        results.next = results.next.checked_add(1).ok_or("PDF結果IDの上限です。")?;
        let id = results.next.to_string();
        results.pdfs.push_back((id.clone(), bytes));
        while results.pdfs.len() > 4 {
            results.pdfs.pop_front();
        }
        Ok(id)
    }

    pub fn read(&self, id: &str) -> Result<Vec<u8>, String> {
        let results = self
            .0
            .lock()
            .map_err(|_| "PDF結果を取得できませんでした。")?;
        results
            .pdfs
            .iter()
            .find(|(key, _)| key == id)
            .map(|(_, bytes)| bytes.clone())
            .ok_or_else(|| "PDF結果が見つかりません。もう一度生成してください。".into())
    }
}
