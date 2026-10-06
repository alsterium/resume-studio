import Foundation
import PDFKit
import AppKit

guard CommandLine.arguments.count == 3,
      let document = PDFDocument(url: URL(fileURLWithPath: CommandLine.arguments[1])),
      document.pageCount > 0, document.pageCount <= 300 else {
    throw NSError(domain: "ResumeStudioPDFQA", code: 1,
                  userInfo: [NSLocalizedDescriptionKey: "1〜300ページのPDFが必要です。"])
}
let output = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
let tile = NSSize(width: 600, height: 860)
var overview: NSImage?
for index in 0..<document.pageCount {
    let page = document.page(at: index)!
    let size = page.bounds(for: .mediaBox).size
    let image = page.thumbnail(of: NSSize(width: size.width * 1.5, height: size.height * 1.5), for: .mediaBox)
    let bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!
    try bitmap.representation(using: .png, properties: [:])!.write(
        to: output.appendingPathComponent(String(format: "page-%03d.png", index + 1)))
    if index % 4 == 0 {
        overview = NSImage(size: NSSize(width: tile.width * 2, height: tile.height * 2))
        overview!.lockFocus()
        NSColor.white.setFill()
        NSRect(origin: .zero, size: overview!.size).fill()
        overview!.unlockFocus()
    }
    overview!.lockFocus()
    let origin = NSPoint(x: CGFloat(index % 2) * tile.width,
                         y: CGFloat(1 - (index % 4) / 2) * tile.height)
    image.draw(in: NSRect(x: origin.x + 5, y: origin.y + 25,
                         width: tile.width - 10, height: tile.height - 30))
    ("Page \(index + 1)" as NSString).draw(at: NSPoint(x: origin.x + 10, y: origin.y + 5),
        withAttributes: [.font: NSFont.systemFont(ofSize: 13), .foregroundColor: NSColor.black])
    overview!.unlockFocus()
    if index % 4 == 3 || index == document.pageCount - 1 {
        let sheet = NSBitmapImageRep(data: overview!.tiffRepresentation!)!
        try sheet.representation(using: .png, properties: [:])!.write(
            to: output.appendingPathComponent(String(format: "overview-%03d.png", index / 4 + 1)))
    }
}
print("Rendered \(document.pageCount) pages and \((document.pageCount + 3) / 4) overview sheets")
