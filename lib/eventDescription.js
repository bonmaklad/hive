import sanitizeHtml from 'sanitize-html';
import { decodeHTML } from 'entities';

export const EVENT_DESCRIPTION_LIMIT = 50000;

const color = /^(?:#[\da-f]{3,8}|[a-z]+|(?:rgb|hsl)a?\([\d\s.,%+-]+\))$/i;
const length = /^(?:0|\d+(?:\.\d+)?(?:px|em|rem|%|pt))$/;
const spacing = /^(?:0|auto|\d+(?:\.\d+)?(?:px|em|rem|%|pt))(?:\s+(?:0|auto|\d+(?:\.\d+)?(?:px|em|rem|%|pt))){0,3}$/;

// Shared by the editor, API and public/member rendering. Never allow page-level
// CSS, executable content, event handlers or URL-bearing style declarations.
const options = {
    allowedTags: [
        'p', 'br', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'sub', 'sup',
        'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'hr', 'a', 'img',
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col', 'caption'
    ],
    allowedAttributes: {
        '*': ['style'],
        a: ['href', 'title', 'target', 'rel'],
        img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
        ol: ['start'],
        td: ['colspan', 'rowspan', 'colwidth'],
        th: ['colspan', 'rowspan', 'colwidth', 'scope'],
        col: ['span', 'width']
    },
    allowedStyles: {
        '*': {
            color: [color],
            'background-color': [color],
            'font-family': [/^[\w\s,'"-]+$/],
            'font-size': [length],
            'font-weight': [/^(?:normal|bold|[1-9]00)$/],
            'font-style': [/^(?:normal|italic|oblique)$/],
            'text-decoration': [/^(?:none|underline|line-through)(?:\s+(?:underline|line-through))*$/],
            'text-align': [/^(?:left|center|right|justify)$/],
            'line-height': [length, /^\d+(?:\.\d+)?$/],
            'white-space': [/^(?:normal|pre|pre-wrap|pre-line)$/],
            width: [length, /^auto$/],
            height: [length, /^auto$/],
            'max-width': [length],
            margin: [spacing],
            padding: [spacing],
            'margin-left': [length, /^auto$/],
            'margin-right': [length, /^auto$/],
            'border-collapse': [/^(?:collapse|separate)$/],
            border: [/^\d+(?:\.\d+)?px\s+(?:solid|dashed|dotted)\s+(?:#[\da-f]{3,8}|[a-z]+)$/i],
            'border-radius': [length]
        }
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['https', 'http'] },
    allowProtocolRelative: false,
    transformTags: {
        a: (tagName, attribs) => ({
            tagName,
            attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' }
        }),
        img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, loading: 'lazy' } })
    }
};

export function eventDescriptionHtml(value) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) return '';
    const html = /<\/?[a-z][a-z0-9:-]*(?:\s|\/?>)/i.test(text)
        ? text
        : `<p>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r\n?|\n/g, '<br>')}</p>`;
    return sanitizeHtml(html, options);
}

export function eventDescriptionText(value) {
    const html = eventDescriptionHtml(value)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<li(?:\s[^>]*)?>/gi, '\n• ')
        .replace(/<\/(?:p|div|h[1-6]|li|blockquote|pre|tr|table)>/gi, '\n')
        .replace(/<\/(?:td|th)>/gi, '\t');
    return decodeHTML(sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }))
        .replace(/\u00a0/g, ' ')
        .replace(/[\t ]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export function hasEventDescription(value) {
    const text = decodeHTML(sanitizeHtml(eventDescriptionHtml(value), { allowedTags: [], allowedAttributes: {} }));
    return Boolean(text.replace(/[\s\u200b-\u200d\ufeff]/g, ''));
}

export function validateEventDescription(value) {
    if (typeof value === 'string' && value.length > EVENT_DESCRIPTION_LIMIT) {
        return `Description must be ${EVENT_DESCRIPTION_LIMIT.toLocaleString('en-NZ')} characters or fewer, including HTML.`;
    }
    if (!hasEventDescription(value)) return 'Description is required.';
    return '';
}

export function escapeCalendarText(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/\r\n?|\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}
