import React, {useEffect, useState} from 'react';

export function EditorFullscreenButton({locale = 'en', className}) {
    const root = document.documentElement;
    const [active, setActive] = useState(() => document.fullscreenElement === root);
    const [pending, setPending] = useState(false);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        const sync = () => setActive(document.fullscreenElement === root);
        document.addEventListener('fullscreenchange', sync);
        return () => document.removeEventListener('fullscreenchange', sync);
    }, [root]);

    if (!document.fullscreenEnabled) return null;

    const japanese = /^ja(?:-|$)/i.test(locale);
    const label = japanese ? 'エディター全体を全画面表示' : 'Full-screen editor';
    const title = active ? (japanese ? 'エディター全体の全画面表示を終了' : 'Exit full-screen editor') : label;

    async function toggle() {
        setPending(true);
        setFailed(false);
        try {
            if (document.fullscreenElement === root) {
                await document.exitFullscreen();
            } else if (!document.fullscreenElement) {
                // Include the menu and dialogs rendered into body portals.
                await root.requestFullscreen();
            } else {
                setFailed(true);
            }
        } catch {
            setFailed(true);
        } finally {
            setPending(false);
        }
    }

    return <>
        <button aria-label={label} aria-pressed={active} className={className} disabled={pending}
            onClick={toggle} title={title} type="button"><span aria-hidden="true">⛶</span></button>
        <span className="tw-window-status" role="status">
            {failed && (japanese ? '全画面表示を切り替えられませんでした' : 'Could not change full-screen mode')}
        </span>
    </>;
}
