'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect } from 'react';

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

type Level = 1 | 2 | 3;

function ToolbarBtn({
  active, onClick, title, children,
}: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      style={{
        width: 28, height: 28,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 6, border: 'none', cursor: 'pointer',
        background: active ? 'rgba(13,148,136,0.85)' : 'rgba(255,255,255,0.06)',
        color: active ? '#fff' : 'rgba(255,255,255,0.75)',
        fontSize: 12, fontWeight: 700, transition: 'background 0.15s, color 0.15s',
      }}
    >
      {children}
    </button>
  );
}

export default function RichTextEditor({ value, onChange, placeholder }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable built-in hard break so Shift+Enter is handled by our keymap below
        hardBreak: false,
      }),
      Placeholder.configure({ placeholder: placeholder || 'Write your answer…' }),
    ],
    content: value || '',
    onUpdate({ editor }) {
      // Send empty string if only empty paragraph
      const html = editor.isEmpty ? '' : editor.getHTML();
      onChange(html);
    },
    editorProps: {
      attributes: {
        class: 'rich-editor-body',
      },
      handleKeyDown(view, event) {
        // Shift+Enter → new paragraph (same as Enter), not a <br> within current block
        if (event.key === 'Enter' && event.shiftKey) {
          event.preventDefault();
          view.dispatch(
            view.state.tr
              .split(view.state.selection.$from.pos)
              .scrollIntoView()
          );
          return true;
        }
        return false;
      },
    },
    immediatelyRender: false,
  });

  // Sync external value resets (e.g. form clear)
  useEffect(() => {
    if (!editor) return;
    if (value === '' && !editor.isEmpty) {
      editor.commands.clearContent(true);
    }
  }, [value, editor]);

  if (!editor) return null;

  const DIVIDER = (
    <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />
  );

  return (
    <div
      style={{
        border: '1.5px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
        transition: 'border-color 0.2s',
        background: 'var(--card)',
      }}
      onFocus={() => {}}
      className="rich-editor-wrapper"
    >
      {/* Toolbar */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
          padding: '6px 10px',
          background: 'rgba(255,255,255,0.03)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {/* Paragraph */}
        <ToolbarBtn
          active={editor.isActive('paragraph')}
          onClick={() => editor.chain().focus().setParagraph().run()}
          title="Paragraph"
        >
          ¶
        </ToolbarBtn>

        {/* Blockquote */}
        <ToolbarBtn
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="Blockquote"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/>
            <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>
          </svg>
        </ToolbarBtn>

        {/* Code block */}
        <ToolbarBtn
          active={editor.isActive('codeBlock')}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          title="Code block"
        >
          {'</>'}
        </ToolbarBtn>

        {DIVIDER}

        {/* H1, H2, H3 */}
        {([1, 2, 3] as Level[]).map((level) => (
          <ToolbarBtn
            key={level}
            active={editor.isActive('heading', { level })}
            onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
            title={`Heading ${level}`}
          >
            H{level}
          </ToolbarBtn>
        ))}

        {DIVIDER}

        {/* Ordered list */}
        <ToolbarBtn
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Ordered list"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="10" y1="6" x2="21" y2="6"/>
            <line x1="10" y1="12" x2="21" y2="12"/>
            <line x1="10" y1="18" x2="21" y2="18"/>
            <path d="M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>
          </svg>
        </ToolbarBtn>

        {/* Bullet list */}
        <ToolbarBtn
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Bullet list"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="9" y1="6" x2="20" y2="6"/>
            <line x1="9" y1="12" x2="20" y2="12"/>
            <line x1="9" y1="18" x2="20" y2="18"/>
            <circle cx="4" cy="6" r="1" fill="currentColor"/>
            <circle cx="4" cy="12" r="1" fill="currentColor"/>
            <circle cx="4" cy="18" r="1" fill="currentColor"/>
          </svg>
        </ToolbarBtn>

        {DIVIDER}

        {/* Bold, Italic */}
        <ToolbarBtn
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold"
        >
          <strong>B</strong>
        </ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic"
        >
          <em style={{ fontStyle: 'italic' }}>I</em>
        </ToolbarBtn>
      </div>

      {/* Editor content area */}
      <EditorContent editor={editor} />

      <style>{`
        .rich-editor-body {
          min-height: 120px;
          padding: 12px 14px;
          color: var(--text-1);
          font-size: 14px;
          line-height: 1.75;
          outline: none;
        }
        .rich-editor-body p { margin: 0 0 8px; }
        .rich-editor-body p:last-child { margin-bottom: 0; }
        .rich-editor-body h1 { font-size: 22px; font-weight: 800; margin: 12px 0 6px; color: var(--text-1); }
        .rich-editor-body h2 { font-size: 18px; font-weight: 700; margin: 10px 0 6px; color: var(--text-1); }
        .rich-editor-body h3 { font-size: 15px; font-weight: 700; margin: 8px 0 4px; color: var(--text-1); }
        .rich-editor-body blockquote {
          border-left: 3px solid var(--accent);
          margin: 8px 0;
          padding: 4px 12px;
          color: var(--text-3);
          font-style: italic;
          background: rgba(13,148,136,0.05);
          border-radius: 0 8px 8px 0;
        }
        .rich-editor-body pre {
          background: rgba(0,0,0,0.35);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 10px 14px;
          font-family: var(--mono);
          font-size: 13px;
          color: #7dd3fc;
          overflow-x: auto;
          margin: 8px 0;
        }
        .rich-editor-body ul {
          list-style-type: disc;
          padding-left: 22px;
          margin: 6px 0;
          color: var(--text-2);
        }
        .rich-editor-body ol {
          list-style-type: decimal;
          padding-left: 22px;
          margin: 6px 0;
          color: var(--text-2);
        }
        .rich-editor-body li { margin: 3px 0; display: list-item; }
        .rich-editor-body .is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: var(--text-4, rgba(255,255,255,0.2));
          pointer-events: none;
          height: 0;
          font-size: 14px;
        }
        .rich-editor-wrapper:focus-within {
          border-color: var(--accent) !important;
          box-shadow: 0 0 0 3px rgba(13,148,136,0.12);
        }
      `}</style>
    </div>
  );
}
