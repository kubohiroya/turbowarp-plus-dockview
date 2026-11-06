import React, {useRef, useState} from 'react';

const labels = {
    ja: ['レイアウト変更', '別窓で開く（アンドック）', '元の画面に戻す（ドックする）',
        'この編集画面をもう一枚開く（別のビューを開く）', 'この画面を最大化する',
        'この画面を最小化する', '通常のウィンドウに戻す'],
    en: ['Window layout', 'Open in a separate window (undock)', 'Return to the editor (dock)',
        'Open another view of this editor', 'Maximize this window', 'Minimize this window', 'Restore normal window']
};

interface WindowLayoutMenuProps {
    locale?: string;
    presentation: 'internal' | 'external';
    mode?: 'normal' | 'minimized' | 'maximized';
    onOpenExternal?: () => void;
    onDock?: () => void;
    onDuplicate?: () => void;
    onMaximize?: () => void;
    onMinimize?: () => void;
    onRestore?: () => void;
}

export function WindowLayoutMenu({locale = 'en', presentation, mode = 'normal',
    onOpenExternal, onDock, onDuplicate, onMaximize, onMinimize, onRestore}: WindowLayoutMenuProps): React.ReactElement {
    const [open, setOpen] = useState(false);
    const trigger = useRef<HTMLButtonElement>(null);
    const [title, ...actions] = /^ja(?:-|$)/i.test(locale) ? labels.ja : labels.en;
    const items: [action: (() => void) | undefined, current: boolean][] = [
        [onOpenExternal, presentation === 'external'], [onDock, false], [onDuplicate, false],
        [onMaximize, mode === 'maximized'], [onMinimize, mode === 'minimized'], [onRestore, mode === 'normal']
    ];
    function close() {
        setOpen(false);
        trigger.current?.focus();
    }
    return <div className="tw-window-layout-menu" onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }} onKeyDown={event => {
        if (event.key === 'Escape' && open) {
            event.stopPropagation();
            close();
        }
    }}>
        <button ref={trigger} type="button" className="tw-window-titlebar__button"
            aria-label={title} aria-expanded={open} title={title} onClick={() => setOpen(value => !value)}>
            <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4">
                <rect x="2" y="3" width="12" height="10" rx="1.5" />
                <path d="M2 6h12M7 6v7" />
            </svg>
        </button>
        {open && <ul aria-label={title}>
            {items.map(([action, current], index) => <li key={actions[index]}>
                <button type="button" disabled={!action || current} aria-current={current || undefined}
                    onClick={() => {close(); action?.();}}>{actions[index]}</button>
            </li>)}
        </ul>}
    </div>;
}
