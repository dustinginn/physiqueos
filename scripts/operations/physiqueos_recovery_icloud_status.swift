#!/usr/bin/swift
import Foundation

struct Result: Codable {
    let state: String
    let fileCount: Int
    let uploadedCount: Int
    let uploadingCount: Int
    let errorCount: Int
    let unavailableMetadataCount: Int
}

guard CommandLine.arguments.count == 2 else { exit(2) }
let root = URL(fileURLWithPath: CommandLine.arguments[1])
let manager = FileManager.default
let keys: Set<URLResourceKey> = [
    .isRegularFileKey,
    .isUbiquitousItemKey,
    .ubiquitousItemIsUploadedKey,
    .ubiquitousItemIsUploadingKey,
    .ubiquitousItemUploadingErrorKey
]
guard let enumerator = manager.enumerator(at: root, includingPropertiesForKeys: Array(keys), options: [.skipsHiddenFiles]) else { exit(3) }
var files = 0
var uploaded = 0
var uploading = 0
var errors = 0
var unavailable = 0
for case let url as URL in enumerator {
    do {
        let values = try url.resourceValues(forKeys: keys)
        guard values.isRegularFile == true else { continue }
        files += 1
        guard values.isUbiquitousItem == true else { unavailable += 1; continue }
        if values.ubiquitousItemUploadingError != nil { errors += 1 }
        if values.ubiquitousItemIsUploading == true { uploading += 1 }
        if values.ubiquitousItemIsUploaded == true { uploaded += 1 }
        if values.ubiquitousItemIsUploaded == nil { unavailable += 1 }
    } catch {
        errors += 1
    }
}
let state: String
if files > 0 && errors == 0 && uploading == 0 && unavailable == 0 && uploaded == files {
    state = "ICLOUD_UPLOAD_REPORTED_COMPLETE"
} else if errors > 0 {
    state = "ICLOUD_UPLOAD_ERROR"
} else {
    state = "REMOTE_ICLOUD_SYNC_UNKNOWN"
}
let result = Result(state: state, fileCount: files, uploadedCount: uploaded, uploadingCount: uploading,
                    errorCount: errors, unavailableMetadataCount: unavailable)
let encoder = JSONEncoder()
encoder.outputFormatting = [.sortedKeys]
FileHandle.standardOutput.write(try encoder.encode(result))
FileHandle.standardOutput.write(Data("\n".utf8))
