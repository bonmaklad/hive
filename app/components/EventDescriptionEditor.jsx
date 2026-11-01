'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyleKit } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { EVENT_DESCRIPTION_LIMIT, eventDescriptionHtml } from '@/lib/eventDescription';
import EventDescription from './EventDescription';

// Retain layout containers and safe inline styling when editing pasted HTML.
const DescriptionBlock = Node.create({
    name: 'descriptionBlock',
    group: 'block',
    content: 'block+',
    parseHTML: () => [{ tag: 'div' }],
    renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes), 0]
});

const DescriptionStyles = Extension.create({
    name: 'descriptionStyles',
    addGlobalAttributes() {
        return [{
            types: ['descriptionBlock', 'paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'blockquote', 'table', 'tableRow', 'tableCell', 'tableHeader', 'image'],
            attributes: {
                descriptionStyle: {
                    default: null,
                    parseHTML: element => {
                        const style = element.style;
                        return Array.from(style)
                            .filter(property => !(/^P$|^H[1-6]$/.test(element.tagName) && property === 'text-align'))
                            .map(property => `${property}:${style.getPropertyValue(property)}`)
                            .join(';') || null;
                    },
                    renderHTML: attributes => attributes.descriptionStyle ? { style: attributes.descriptionStyle } : {}
                }
            }
        }];
    }
});

function ToolButton({ children, label, active, disabled, onClick }) {
    return (
        <button type="button" title={label} aria-label={label} aria-pressed={active} disabled={disabled}
            onMouseDown={event => event.preventDefault()} onClick={onClick}>
            {children}
        </button>
    );
}

export default function EventDescriptionEditor({ value, onChange }) {
    const id = useId();
    const [mode, setMode] = useState('design');
    const [insert, setInsert] = useState('');
    const [url, setUrl] = useState('');
    const [alt, setAlt] = useState('');
    const [urlError, setUrlError] = useState('');
    const lastValue = useRef(value);
    const editor = useEditor({
        immediatelyRender: false,
        shouldRerenderOnTransaction: true,
        extensions: [
            StarterKit.configure({ link: { openOnClick: false, protocols: ['http', 'https', 'mailto', 'tel'] } }),
            TextStyleKit,
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            Image.configure({ allowBase64: false }),
            TableKit,
            DescriptionBlock,
            DescriptionStyles
        ],
        content: eventDescriptionHtml(value),
        editorProps: {
            attributes: {
                class: 'event-rich-text event-description-canvas',
                role: 'textbox',
                'aria-label': 'Description',
                'aria-multiline': 'true',
                'aria-required': 'true',
                'aria-describedby': `${id}-help`
            },
            transformPastedHTML: html => eventDescriptionHtml(html)
        },
        onUpdate: ({ editor: current }) => {
            const html = eventDescriptionHtml(current.getHTML());
            lastValue.current = html;
            onChange(html);
        }
    });

    useEffect(() => {
        if (editor && value !== lastValue.current && mode === 'design') {
            editor.commands.setContent(eventDescriptionHtml(value), { emitUpdate: false });
            lastValue.current = value;
        }
    }, [editor, value, mode]);

    const changeMode = next => {
        if (next === 'design' && mode !== 'design' && editor) {
            editor.commands.setContent(eventDescriptionHtml(value), { emitUpdate: false });
            lastValue.current = value;
        }
        setInsert('');
        setMode(next);
    };

    const openInsert = type => {
        setInsert(current => current === type ? '' : type);
        setUrl(type === 'link' ? editor.getAttributes('link').href || '' : '');
        setAlt('');
        setUrlError('');
    };

    const applyInsert = () => {
        const href = url.trim();
        const permitted = insert === 'image' ? /^https?:\/\//i : /^(?:https?:\/\/|mailto:|tel:)/i;
        if (!permitted.test(href)) {
            setUrlError(insert === 'image' ? 'Enter an image URL starting with https:// or http://.' : 'Enter a URL starting with https://, http://, mailto: or tel:.');
            return;
        }
        if (insert === 'image') editor.chain().focus().setImage({ src: href, alt }).run();
        else if (editor.state.selection.empty && !editor.isActive('link')) {
            editor.chain().focus().insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).run();
        } else editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
        setInsert('');
    };

    return (
        <div className="event-description-field">
            <span className="event-field-label" id={`${id}-label`}>Description</span>
            <div className="event-description-editor">
                <div className="event-description-modes" role="group" aria-label="Description editing mode">
                    {['design', 'html', 'preview'].map(item => (
                        <button key={item} type="button" aria-pressed={mode === item} onClick={() => changeMode(item)}>
                            {item === 'html' ? 'HTML' : item === 'design' ? 'Design' : 'Preview'}
                        </button>
                    ))}
                </div>
                {mode === 'design' && editor ? (
                    <>
                        <div className="event-description-toolbar" role="group" aria-label="Description formatting">
                            <select aria-label="Text style" value={editor.isActive('heading') ? editor.getAttributes('heading').level : 'paragraph'}
                                onChange={event => event.target.value === 'paragraph' ? editor.chain().focus().setParagraph().run() : editor.chain().focus().setHeading({ level: Number(event.target.value) }).run()}>
                                <option value="paragraph">Paragraph</option>
                                {[1, 2, 3, 4].map(level => <option key={level} value={level}>Heading {level}</option>)}
                            </select>
                            <select aria-label="Font size" value={editor.getAttributes('textStyle').fontSize || ''}
                                onChange={event => event.target.value ? editor.chain().focus().setFontSize(event.target.value).run() : editor.chain().focus().unsetFontSize().run()}>
                                <option value="">Size</option>
                                {['12px', '14px', '16px', '18px', '24px', '32px', '48px'].map(size => <option key={size}>{size}</option>)}
                            </select>
                            <select aria-label="Font family" value={editor.getAttributes('textStyle').fontFamily || ''}
                                onChange={event => event.target.value ? editor.chain().focus().setFontFamily(event.target.value).run() : editor.chain().focus().unsetFontFamily().run()}>
                                <option value="">Font</option>
                                {['Arial', 'Georgia', 'Verdana', 'Courier New'].map(font => <option key={font}>{font}</option>)}
                            </select>
                            {[
                                ['Bold', 'bold', 'toggleBold', <b key="b">B</b>],
                                ['Italic', 'italic', 'toggleItalic', <i key="i">I</i>],
                                ['Underline', 'underline', 'toggleUnderline', <u key="u">U</u>],
                                ['Strikethrough', 'strike', 'toggleStrike', <s key="s">S</s>],
                                ['Bullet list', 'bulletList', 'toggleBulletList', '• List'],
                                ['Numbered list', 'orderedList', 'toggleOrderedList', '1. List'],
                                ['Quote', 'blockquote', 'toggleBlockquote', 'Quote']
                            ].map(([label, name, command, children]) => (
                                <ToolButton key={name} label={label} active={editor.isActive(name)} onClick={() => editor.chain().focus()[command]().run()}>{children}</ToolButton>
                            ))}
                            <select aria-label="Text alignment" value={editor.getAttributes('paragraph').textAlign || editor.getAttributes('heading').textAlign || 'left'}
                                onChange={event => editor.chain().focus().setTextAlign(event.target.value).run()}>
                                {['left', 'center', 'right', 'justify'].map(align => <option key={align} value={align}>{align[0].toUpperCase() + align.slice(1)}</option>)}
                            </select>
                            <label className="event-description-color">Text<input aria-label="Text colour" type="color" defaultValue="#6fffb6" onChange={event => editor.chain().focus().setColor(event.target.value).run()} /></label>
                            <label className="event-description-color">Highlight<input aria-label="Highlight colour" type="color" defaultValue="#4a7a48" onChange={event => editor.chain().focus().setBackgroundColor(event.target.value).run()} /></label>
                            <ToolButton label="Add or edit link" active={editor.isActive('link')} onClick={() => openInsert('link')}>Link</ToolButton>
                            <ToolButton label="Remove link" disabled={!editor.isActive('link')} onClick={() => editor.chain().focus().unsetLink().run()}>Unlink</ToolButton>
                            <ToolButton label="Insert image" onClick={() => openInsert('image')}>Image</ToolButton>
                            <ToolButton label="Insert table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run()}>Table</ToolButton>
                            <ToolButton label="Insert divider" onClick={() => editor.chain().focus().setHorizontalRule().run()}>Divider</ToolButton>
                            <ToolButton label="Clear formatting" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().resetAttributes(['paragraph', 'heading'], ['descriptionStyle', 'textAlign']).run()}>Clear</ToolButton>
                            <ToolButton label="Undo" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>Undo</ToolButton>
                            <ToolButton label="Redo" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>Redo</ToolButton>
                            {editor.isActive('table') ? <>
                                <ToolButton label="Add table row" onClick={() => editor.chain().focus().addRowAfter().run()}>+ Row</ToolButton>
                                <ToolButton label="Add table column" onClick={() => editor.chain().focus().addColumnAfter().run()}>+ Column</ToolButton>
                                <ToolButton label="Delete table row" onClick={() => editor.chain().focus().deleteRow().run()}>− Row</ToolButton>
                                <ToolButton label="Delete table column" onClick={() => editor.chain().focus().deleteColumn().run()}>− Column</ToolButton>
                                <ToolButton label="Delete table" onClick={() => editor.chain().focus().deleteTable().run()}>Delete table</ToolButton>
                            </> : null}
                        </div>
                        {insert ? (
                            <div className="event-description-insert" role="group" aria-label={insert === 'image' ? 'Insert image' : 'Edit link'}>
                                <label>{insert === 'image' ? 'Image URL' : 'Link URL'}<input type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://" onKeyDown={event => {
                                    if (event.key === 'Enter') { event.preventDefault(); applyInsert(); }
                                }} /></label>
                                {insert === 'image' ? <label>Image description<input value={alt} onChange={event => setAlt(event.target.value)} /></label> : null}
                                <button className="btn ghost" type="button" onClick={applyInsert}>Insert</button>
                                <button className="btn ghost" type="button" onClick={() => setInsert('')}>Cancel</button>
                                {urlError ? <p role="alert">{urlError}</p> : null}
                            </div>
                        ) : null}
                    </>
                ) : null}
                <div hidden={mode !== 'design'}><EditorContent editor={editor} /></div>
                {mode === 'html' ? <textarea className="event-description-source" aria-label="Description HTML" aria-describedby={`${id}-help`} value={value} spellCheck={false} onChange={event => onChange(event.target.value)} /> : null}
                {mode === 'preview' ? <div className="event-description-preview"><EventDescription value={value} /></div> : null}
            </div>
            <p className="event-description-help" id={`${id}-help`}>Paste formatted content or design it here. Use HTML to paste markup and Preview to check the result. Ctrl/Cmd+B, I and U format text.</p>
            {value.length > EVENT_DESCRIPTION_LIMIT ? <p className="event-description-help" role="alert">Description must be {EVENT_DESCRIPTION_LIMIT.toLocaleString('en-NZ')} characters or fewer, including HTML.</p> : null}
        </div>
    );
}
