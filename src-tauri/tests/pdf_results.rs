use resume_studio_lib::compiler::results::PdfStore;

#[test]
fn result_ids_resolve_to_their_bytes_and_old_results_are_bounded() {
    let store = PdfStore::default();
    let first = store.insert(vec![1]).unwrap();
    let second = store.insert(vec![2]).unwrap();
    assert_ne!(first, second);
    assert_eq!(store.read(&first).unwrap(), [1]);
    assert_eq!(store.read(&second).unwrap(), [2]);
    assert!(store.read("../../private").is_err());
    for value in 3..=5 {
        store.insert(vec![value]).unwrap();
    }
    assert!(store.read(&first).is_err());
    assert_eq!(store.read(&second).unwrap(), [2]);
}
