import React, {useCallback, useContext, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {
    DockWindowButton, MaximizeWindowButton, MinimizeWindowButton, OpenWindowButton, WindowTitleBar
} from './title-bar.js';

import {WindowLayoutMenu} from './layout-menu.js';

const DesktopContext = React.createContext(null);

const labelsFor = locale => /^ja(?:-|$)/i.test(locale) ? {
    list: 'ウィンドウ一覧', open: '別ウィンドウへ移す', minimize: '最小化', maximize: '最大化',
    restore: '元のサイズに戻す', dock: '閉じる（ドックに戻す）', move: 'ウィンドウを移動',
    resize: 'ウィンドウのサイズを変更', recover: '画面内に戻す'
} : {
    list: 'Windows', open: 'Move to browser window', minimize: 'Minimize', maximize: 'Maximize',
    restore: 'Restore size', dock: 'Close and dock', move: 'Move window',
    resize: 'Resize window', recover: 'Bring windows into view'
};

function fit(rect, area) {
    const width = Math.min(area.width, Math.max(240, rect.width));
    const height = Math.min(area.height, Math.max(152, rect.height));
    return {
        x: Math.min(Math.max(0, rect.x), area.width - width),
        y: Math.min(Math.max(0, rect.y), area.height - height),
        width, height
    };
}

function changeBy(rect, area, dx, dy, resize) {
    const next = resize ? {...rect,
        width: Math.min(area.width - rect.x, rect.width + dx),
        height: Math.min(area.height - rect.y, rect.height + dy)
    } : {...rect, x: rect.x + dx, y: rect.y + dy};
    return fit(next, area);
}

const vectors = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]};

function DesktopWindow({record, area, labels, locale, layoutMenu, raise, update}) {
    const {entry, mode, rect} = record;
    const drag = useRef(null);
    const normal = mode === 'normal';
    const geometry = mode === 'maximized' ? {x: 0, y: 0, ...area} : fit(rect, area);
    const position = {left: geometry.x, top: geometry.y, width: geometry.width, height: geometry.height,
        zIndex: record.order};

    function start(event, resize) {
        if (!normal || event.button !== 0 || (!resize && event.target.closest('button, input, select, a'))) return;
        drag.current = {id: event.pointerId, x: event.clientX, y: event.clientY, rect: geometry, resize};
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
        event.currentTarget.focus();
    }

    function move(event) {
        const gesture = drag.current;
        if (gesture?.id !== event.pointerId) return;
        update(entry, {rect: changeBy(gesture.rect, area,
            event.clientX - gesture.x, event.clientY - gesture.y, gesture.resize)});
    }

    function keys(event, resize) {
        const direction = vectors[event.key];
        if (!normal || event.target !== event.currentTarget || !direction) return;
        event.preventDefault();
        const step = event.shiftKey ? 40 : 10;
        update(entry, {rect: changeBy(geometry, area, direction[0] * step, direction[1] * step, resize)});
    }

    function gestureProps(resize) {
        return {
            onPointerDown: event => start(event, resize),
            onPointerMove: move,
            onLostPointerCapture: () => { drag.current = null; },
            onKeyDown: event => keys(event, resize)
        };
    }

    function minimize() {
        update(entry, {mode: 'minimized', restoreMode: mode});
        entry.onMinimize?.();
    }

    return (
        <section aria-label={entry.title} className="tw-desktop-window" hidden={mode === 'minimized'}
            onFocus={() => raise(entry)} onPointerDownCapture={() => raise(entry)}
            ref={node => {entry.frame = node;}} style={position} tabIndex={-1}>
            <div aria-label={labels.move} className="tw-desktop-window__handle" tabIndex={0} {...gestureProps(false)}>
                <WindowTitleBar title={entry.title} windowControls={!layoutMenu && <>
                    <MinimizeWindowButton label={labels.minimize}
                        onMinimize={minimize} />
                    <MaximizeWindowButton maximized={mode === 'maximized'} maximizeLabel={labels.maximize}
                        restoreLabel={labels.restore} onChange={maximized =>
                            update(entry, {mode: maximized ? 'maximized' : 'normal'})} />
                    <DockWindowButton label={entry.closeLabel ?? labels.dock} onDock={entry.disconnect} />
                </>}>
                    {layoutMenu ? <WindowLayoutMenu locale={locale} presentation="internal" mode={mode}
                        onOpenExternal={entry.openExternal} onDock={entry.disconnect} onDuplicate={entry.onDuplicate}
                        onMaximize={() => update(entry, {mode: 'maximized'})} onMinimize={minimize}
                        onRestore={() => update(entry, {mode: 'normal'})} /> :
                        entry.openExternal && <OpenWindowButton label={labels.open} onOpen={entry.openExternal} />}
                </WindowTitleBar>
            </div>
            <div className="tw-desktop-window__content" ref={entry.mount} />
            {normal && <div aria-label={labels.resize} className="tw-desktop-window__resize" role="separator"
                aria-orientation="horizontal" tabIndex={0} {...gestureProps(true)} />}
        </section>
    );
}

const nextOrder = records => Math.max(0, ...records.map(record => record.order)) + 1;

export function WindowDesktop({locale = 'en', layoutMenu = false, children}) {
    const [records, setRecords] = useState([]);
    const [area, setArea] = useState({width: 0, height: 0});
    const committed = useRef(records);
    const placements = useRef(new Map());
    const element = useRef(null);
    const entries = useRef(new Map());
    const live = useRef(false);
    const list = useRef(null);
    const labels = labelsFor(locale);

    useLayoutEffect(() => {
        live.current = true;
        const node = element.current;
        const measure = () => setArea({width: node.clientWidth, height: node.clientHeight});
        measure();
        const observer = new node.ownerDocument.defaultView.ResizeObserver(measure);
        observer.observe(node);
        return () => {
            live.current = false;
            observer.disconnect();
            for (const entry of entries.current.values()) entry.close();
        };
    }, []);

    useLayoutEffect(() => { committed.current = records; }, [records]);

    const host = useMemo(() => ({
        open({id, title, openExternal, rememberPlacement, onDuplicate, onActivate, onMinimize, closeLabel, layer}) {
            if (!live.current || entries.current.has(id)) return null;
            const controller = new AbortController();
            let resolve;
            let reject;
            const ready = new Promise((success, failure) => {resolve = success; reject = failure;});
            const entry = {
                id, title, openExternal, onDuplicate, onActivate, onMinimize, closeLabel, layer,
                mount(node) {
                    if (!node || controller.signal.aborted) return;
                    resolve({mount: node, presentation: 'internal'});
                    node.ownerDocument.defaultView.requestAnimationFrame(() => entry.frame?.focus());
                },
                disconnect() {controller.abort();},
                close() {
                    if (entries.current.get(id) !== entry) return;
                    entries.current.delete(id);
                    if (rememberPlacement) {
                        const record = committed.current.find(item => item.entry === entry);
                        if (record) placements.current.set(id, {
                            rect: record.rect,
                            mode: record.mode === 'minimized' ? record.restoreMode : record.mode
                        });
                    }
                    if (live.current) setRecords(items => items.filter(item => item.entry !== entry));
                    controller.abort();
                    reject(new Error('Window closed before mount'));
                }
            };
            entries.current.set(id, entry);
            const offset = (entries.current.size - 1) * 24;
            const placement = rememberPlacement && placements.current.get(id);
            const rect = placement ? placement.rect : {x: 56 + offset, y: 64 + offset, width: 540, height: 280};
            setRecords(items => [...items, {entry, mode: placement ? placement.mode : 'normal',
                order: nextOrder(items), rect}]);
            return {
                ready, disconnected: controller.signal, close: entry.close,
                activate() {
                    if (controller.signal.aborted) return;
                    setRecords(items => items.map(record => record.entry === entry && record.mode === 'minimized' ?
                        {...record, mode: record.restoreMode} : record));
                    raise(entry);
                    element.current.ownerDocument.defaultView.requestAnimationFrame(() => entry.frame?.focus());
                },
                setTitle(next) {
                    if (controller.signal.aborted || entry.title === next) return;
                    entry.title = next;
                    setRecords(items => [...items]);
                }
            };
        }
    }), []);

    const raise = useCallback(entry => {
        setRecords(items => {
            const record = items.find(item => item.entry === entry);
            const order = nextOrder(items);
            return !record || record.order === order - 1 ? items :
                items.map(item => item === record ? {...record, order} : item);
        });
        entry.onActivate?.();
    }, []);
    function update(entry, patch) {
        setRecords(items => items.map(item => item.entry === entry ? {...item, ...patch} : item));
        if (patch.mode === 'minimized') list.current?.focus();
    }
    function select(record) {
        if (record.mode === 'minimized') update(record.entry, {mode: record.restoreMode});
        raise(record.entry);
        element.current.ownerDocument.defaultView.requestAnimationFrame(() => record.entry.frame?.focus());
    }

    function recover() {
        setRecords(items => items.map(record => ({...record, rect: fit(record.rect, area)})));
        list.current?.focus();
    }

    return (
        <DesktopContext.Provider value={{host, records, select, recover, list, labels}}>
            <div className="tw-window-desktop" ref={element}>
                {children}
                {[undefined, 'utility'].map(layer => {
                    const windows = records.filter(record => record.entry.layer === layer);
                    return windows.length > 0 && <div key={layer ?? 'default'} className="tw-window-desktop__layer"
                        data-window-layer={layer}>
                        {windows.map(record => <DesktopWindow key={record.entry.id}
                            {...{record, area, labels, locale, layoutMenu, raise, update}} />)}
                    </div>;
                })}
            </div>
        </DesktopContext.Provider>
    );
}

export function useWindowHost() {
    return useContext(DesktopContext)?.host;
}

export function WindowList() {
    const desktop = useContext(DesktopContext);
    const [open, setOpen] = useState(false);
    if (!desktop?.records.length) return null;
    return (
        <div className="tw-window-list" onBlur={event => {
            if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
        }} onKeyDown={event => {
            if (event.key === 'Escape' && open) {
                setOpen(false);
                desktop.list.current?.focus();
            }
        }}>
            <button aria-expanded={open} onClick={() => setOpen(value => !value)}
                ref={desktop.list} type="button">{desktop.labels.list}</button>
            {open && <ul>
                {desktop.records.map(record => <li key={record.entry.id}><button onClick={() => {
                    setOpen(false);
                    desktop.select(record);
                }} type="button">{record.entry.title}</button></li>)}
                <li><button onClick={() => {
                    setOpen(false);
                    desktop.recover();
                }} type="button">{desktop.labels.recover}</button></li>
            </ul>}
        </div>
    );
}
