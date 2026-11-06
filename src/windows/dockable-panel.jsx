import React, {useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';

// The portal container stays the same so a stateful editor keeps its DOM and history.
export function DockablePanel({children, mount, onDock, onResize, dockLabel = 'Return here'}) {
    const dock = useRef(null);
    const [content] = useState(() => document.createElement('div'));

    useLayoutEffect(() => {
        content.className = mount ? 'tw-dockable-panel tw-dockable-panel--floating' : 'tw-dockable-panel';
        (mount || dock.current).appendChild(content);
        return () => content.remove();
    }, [content, mount]);

    useLayoutEffect(() => {
        if (!onResize) return;
        const frame = requestAnimationFrame(onResize);
        if (!mount) return () => cancelAnimationFrame(frame);
        const observer = new ResizeObserver(onResize);
        observer.observe(content);
        return () => {
            observer.disconnect();
            cancelAnimationFrame(frame);
        };
    }, [content, mount, onResize]);

    return <>
        <div className="tw-dockable-panel" ref={dock} />
        {mount && <div className="tw-dockable-panel__placeholder">
            <button type="button" onClick={onDock}>{dockLabel}</button>
        </div>}
        {createPortal(children, content)}
    </>;
}
