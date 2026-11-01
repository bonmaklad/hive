import { EVENT_DESCRIPTION_LIMIT, escapeCalendarText, eventDescriptionHtml, eventDescriptionText, validateEventDescription } from '@/lib/eventDescription';

test('preserves legacy newlines and escapes literal text', () => {
    expect(eventDescriptionHtml('Meet & greet\r\n2 < 3\nNext line')).toBe('<p>Meet &amp; greet<br />2 &lt; 3<br />Next line</p>');
});

test('repeated rendering does not double-escape an unformatted description', () => {
    const html = eventDescriptionHtml('Meet & greet');
    expect(eventDescriptionHtml(html)).toBe(html);
    expect(eventDescriptionText(html)).toBe('Meet & greet');
});

test('retains designed descriptions, inline styles, tables, images and links', () => {
    const result = eventDescriptionHtml('<div style="padding:16px;background-color:#123456"><h2>Agenda</h2><p style="text-align:center"><span style="color:rgb(255, 0, 0);font-size:24px">Hello</span><br><strong>Members</strong></p><ul><li>Networking</li></ul><table><tr><td colspan="2">Details</td></tr></table><img src="https://example.com/event.png" alt="Event"><a href="https://example.com">Register</a></div>');
    expect(result).toContain('padding:16px;background-color:#123456');
    expect(result).toContain('color:rgb(255, 0, 0);font-size:24px');
    expect(result).toContain('<td colspan="2">Details</td>');
    expect(result).toContain('src="https://example.com/event.png"');
    expect(result).toContain('rel="noopener noreferrer"');
    expect(eventDescriptionHtml(result)).toBe(result);
});

test('strips scripts, handlers, embedded pages, unsafe URLs and page-level CSS', () => {
    const result = eventDescriptionHtml('<style>body{display:none}</style><script>alert(1)</script><iframe src="https://example.com"></iframe><svg onload="alert(1)"></svg><p onclick="alert(1)" style="position:fixed;z-index:999;background-image:url(https://example.com/track);color:red">Safe</p><a href="jav&#x61;script:alert(1)">Bad link</a><img src="data:image/svg+xml,bad" onerror="alert(1)">');
    expect(result).toContain('<p style="color:red">Safe</p>');
    expect(result).not.toMatch(/script|iframe|svg|onload|onclick|onerror|javascript|data:|position|z-index|url\(/i);
});

test.each(['', '<p><br></p>', '<div>&nbsp; </div>', '<script>bad</script>', '<p>\u200b</p>', '<ul><li><p><br></p></li></ul>'])('rejects visually empty description %s', value => {
    expect(validateEventDescription(value)).toBe('Description is required.');
});

test('allows substantial HTML without the old silent 3000 character truncation', () => {
    const value = `<p>${'Event details. '.repeat(500)}</p>`;
    expect(validateEventDescription(value)).toBe('');
    expect(eventDescriptionHtml(value)).toBe(value);
    expect(validateEventDescription('x'.repeat(EVENT_DESCRIPTION_LIMIT + 1))).toContain('50,000');
});

test('calendar export decodes entities, removes tags and retains useful line breaks', () => {
    const text = eventDescriptionText('<h2>Meet &amp; greet</h2><p>First<br>Second</p><ul><li>Bring notes</li></ul>');
    expect(text).toBe('Meet & greet\nFirst\nSecond\n\n• Bring notes');
    expect(escapeCalendarText('A; B, C\\D\r\nNext')).toBe('A\\; B\\, C\\\\D\\nNext');
});
