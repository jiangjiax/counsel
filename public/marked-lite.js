/**
 * Tiny local markdown renderer for Counsel.
 *
 * The previous page loaded marked from jsDelivr in the blocking <head>. On
 * mobile networks without VPN that CDN can be slow or unreachable, delaying the
 * entire app. This implements the small markdown subset the UI needs locally.
 */
(function () {
  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function inline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  }

  function flushParagraph(out, paragraph) {
    if (!paragraph.length) return;
    out.push('<p>' + inline(paragraph.join('\n')).replace(/\n/g, '<br>') + '</p>');
    paragraph.length = 0;
  }

  function parse(md) {
    var lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
    var out = [];
    var paragraph = [];
    var inList = false;

    function closeList() {
      if (inList) {
        out.push('</ul>');
        inList = false;
      }
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var trimmed = line.trim();

      if (!trimmed) {
        flushParagraph(out, paragraph);
        closeList();
        continue;
      }

      var heading = /^(#{1,4})\s+(.+)$/.exec(trimmed);
      if (heading) {
        flushParagraph(out, paragraph);
        closeList();
        var level = heading[1].length;
        out.push('<h' + level + '>' + inline(heading[2]) + '</h' + level + '>');
        continue;
      }

      var bullet = /^[-*]\s+(.+)$/.exec(trimmed);
      if (bullet) {
        flushParagraph(out, paragraph);
        if (!inList) {
          out.push('<ul>');
          inList = true;
        }
        out.push('<li>' + inline(bullet[1]) + '</li>');
        continue;
      }

      var ordered = /^\d+\.\s+(.+)$/.exec(trimmed);
      if (ordered) {
        flushParagraph(out, paragraph);
        if (!inList) {
          out.push('<ul>');
          inList = true;
        }
        out.push('<li>' + inline(ordered[1]) + '</li>');
        continue;
      }

      closeList();
      paragraph.push(line);
    }

    flushParagraph(out, paragraph);
    closeList();
    return out.join('\n');
  }

  window.marked = window.marked || { parse: parse };
})();
