//! SSE / NDJSON line decoding utilities.
//!
//! HTTP byte streams arrive in arbitrary chunks — a TCP packet can cut a line
//! in half, including through the middle of a multi-byte UTF-8 sequence (common
//! with CJK output). Providers previously used `String::from_utf8_lossy(&bytes).lines()`
//! on each chunk, which silently dropped any trailing partial line. `LineDecoder`
//! buffers bytes across chunks and only emits lines once a `\n` is seen.
//!
//! Used by all 7 model providers. SSE providers strip the `data: ` prefix after
//! line assembly; Ollama uses `LineDecoder` directly since NDJSON is newline-delimited.

/// Buffers incoming bytes and yields complete lines (without trailing `\n` or `\r\n`).
///
/// Partial lines remain in the buffer until more bytes arrive or `flush()` is called.
#[derive(Debug, Default)]
pub struct LineDecoder {
    buffer: Vec<u8>,
}

impl LineDecoder {
    pub fn new() -> Self {
        Self { buffer: Vec::with_capacity(4096) }
    }

    /// Append bytes and return any newly-completed lines.
    ///
    /// Lines are returned as owned `String`s via `from_utf8_lossy`, so invalid
    /// UTF-8 becomes `U+FFFD` but never panics.
    pub fn feed(&mut self, bytes: &[u8]) -> Vec<String> {
        self.buffer.extend_from_slice(bytes);
        let mut lines = Vec::new();
        let mut start = 0;
        let mut i = 0;
        while i < self.buffer.len() {
            if self.buffer[i] == b'\n' {
                let mut end = i;
                if end > start && self.buffer[end - 1] == b'\r' {
                    end -= 1;
                }
                lines.push(String::from_utf8_lossy(&self.buffer[start..end]).into_owned());
                start = i + 1;
            }
            i += 1;
        }
        if start > 0 {
            self.buffer.drain(..start);
        }
        lines
    }

    /// Flush any remaining buffered content (a final line without trailing `\n`).
    ///
    /// Returns `None` if the buffer is empty. Call at end-of-stream to capture
    /// providers that don't send a terminating newline.
    pub fn flush(&mut self) -> Option<String> {
        if self.buffer.is_empty() {
            return None;
        }
        let mut end = self.buffer.len();
        if end > 0 && self.buffer[end - 1] == b'\r' {
            end -= 1;
        }
        let line = String::from_utf8_lossy(&self.buffer[..end]).into_owned();
        self.buffer.clear();
        Some(line)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn emits_complete_lines() {
        let mut d = LineDecoder::new();
        let lines = d.feed(b"hello\nworld\n");
        assert_eq!(lines, vec!["hello", "world"]);
        assert!(d.flush().is_none());
    }

    #[test]
    fn buffers_partial_line() {
        let mut d = LineDecoder::new();
        assert!(d.feed(b"partial").is_empty());
        let lines = d.feed(b" line\ncomplete\n");
        assert_eq!(lines, vec!["partial line", "complete"]);
    }

    #[test]
    fn split_across_chunks_preserves_cjk() {
        let mut d = LineDecoder::new();
        // UTF-8 encoding of "立场：正方" split mid-character
        let full = "data: 立场：正方\n".as_bytes();
        let cut_at = 12;
        assert!(d.feed(&full[..cut_at]).is_empty());
        let lines = d.feed(&full[cut_at..]);
        assert_eq!(lines, vec!["data: 立场：正方"]);
    }

    #[test]
    fn handles_crlf() {
        let mut d = LineDecoder::new();
        let lines = d.feed(b"a\r\nb\r\n");
        assert_eq!(lines, vec!["a", "b"]);
    }

    #[test]
    fn flush_returns_trailing_partial() {
        let mut d = LineDecoder::new();
        assert!(d.feed(b"trailing").is_empty());
        assert_eq!(d.flush().as_deref(), Some("trailing"));
        assert!(d.flush().is_none());
    }

    #[test]
    fn many_lines_one_chunk() {
        let mut d = LineDecoder::new();
        let lines = d.feed(b"a\nb\nc\nd\n");
        assert_eq!(lines, vec!["a", "b", "c", "d"]);
    }

    #[test]
    fn empty_lines_preserved() {
        let mut d = LineDecoder::new();
        let lines = d.feed(b"a\n\nb\n");
        assert_eq!(lines, vec!["a", "", "b"]);
    }

    #[test]
    fn split_mid_utf8_byte() {
        let mut d = LineDecoder::new();
        // "测" is 3 bytes: E6 B5 8B. Feed one byte at a time.
        let full = "测试\n".as_bytes();
        let mut all_lines = Vec::new();
        for b in full {
            all_lines.extend(d.feed(&[*b]));
        }
        assert_eq!(all_lines, vec!["测试"]);
    }

    #[test]
    fn sse_data_lines_assembled_across_chunks() {
        let mut d = LineDecoder::new();
        // Simulate real SSE: `data: {...}\n\n`, arriving in 3 chunks
        let mut lines = Vec::new();
        lines.extend(d.feed(b"data: {\"choices\":[{\"delta\":{\"con"));
        lines.extend(d.feed(b"tent\":\"hi\"}}]}\n"));
        lines.extend(d.feed(b"\n"));
        assert_eq!(lines, vec!["data: {\"choices\":[{\"delta\":{\"content\":\"hi\"}}]}", ""]);
    }
}
