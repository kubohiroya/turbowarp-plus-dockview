import React from 'react';
import {createPortal} from 'react-dom';
import {createDockview, themeLight} from 'dockview';
import type {IDockviewPanel} from 'dockview';

interface Target {
    id: string;
    isOriginal: boolean;
    isStage: boolean;
    getName(): string;
}

interface Project {
    editingTarget?: Target;
    runtime: {targets: Target[]};
    setEditingTarget(id: string): void;
    on(event: 'targetsUpdate', listener: () => void): void;
    removeListener(event: 'targetsUpdate', listener: () => void): void;
}

interface TabOptions {
    vm: Project;
    getSection(): number;
    activateSection(section: number): void;
    selectTarget(id: string): void;
    resize(): void;
    park?(): void;
    reopenLabel: string;
}

export function mountSpriteTabs(root: HTMLElement, content: HTMLElement, options: TabOptions) {
    const {vm} = options;
    const document = root.ownerDocument;
    const slots = new Map<string, HTMLElement>();
    const targets = new Map<string, Target>();
    const sections = new WeakMap<Target, number>();
    const closed = new WeakSet<Target>();
    let active: Target | undefined;
    let observed = vm.editingTarget;
    let syncing = false;

    const dockview = createDockview(root, {
        theme: themeLight,
        disableFloatingGroups: true,
        createComponent: () => {
            const element = document.createElement('div');
            element.className = 'tw-plus-sprite-tab-slot';
            return {element, init: ({api}) => { slots.set(api.id, element); }};
        },
        createWatermarkComponent: () => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = options.reopenLabel;
            button.addEventListener('click', () => {
                if (vm.editingTarget) select(vm.editingTarget.id);
            });
            return {element: button, init() {}};
        }
    });
    // The host has one editable surface. Keep reordering inside its tab group.
    const preventSplit = (event: {kind: string; position: string; preventDefault(): void}) => {
        if (event.kind === 'edge' || event.kind === 'content' && event.position !== 'center') event.preventDefault();
    };
    const overlay = dockview.onWillShowOverlay(preventSplit);
    const drop = dockview.onWillDrop(preventSplit);

    function show(panel: IDockviewPanel | undefined) {
        const next = targets.get(panel?.id);
        if (active === next) return;
        if (active) sections.set(active, options.getSection());
        const section = sections.get(next) ?? options.getSection();
        active = next;
        if (!next) {
            if (options.park) options.park();
            else content.remove();
            options.selectTarget('');
            return;
        }

        slots.get(next.id).appendChild(content);
        if (vm.editingTarget !== next) vm.setEditingTarget(next.id);
        observed = vm.editingTarget;
        options.activateSection(section);
        options.selectTarget(next.id);
        options.resize();
    }

    function add(target: Target) {
        targets.set(target.id, target);
        return dockview.addPanel({id: target.id, title: target.getName(), component: 'sprite', inactive: true});
    }

    function select(id: string) {
        const target = vm.runtime.targets.find(item => item.id === id && item.isOriginal);
        if (!target) return;
        closed.delete(target);
        (dockview.getPanel(id) ?? add(target)).api.setActive();
    }

    function refresh() {
        if (syncing) return;
        syncing = true;
        try {
            const available = new Set(vm.runtime.targets.filter(target => target.isOriginal));
            const editing = vm.editingTarget;
            for (const [id, target] of targets) {
                if (!available.has(target)) dockview.getPanel(id)?.api.close();
            }
            for (const target of available) {
                if (target.isStage && target !== editing && !targets.has(target.id)) continue;
                const panel = dockview.getPanel(target.id);
                if (panel) {
                    if (panel.title !== target.getName()) panel.api.setTitle(target.getName());
                } else if (!closed.has(target)) add(target);
            }
            if (editing && (observed !== editing || !active && !closed.has(editing))) {
                observed = editing;
                select(editing.id);
            }
            show(dockview.activePanel);
        } finally {
            syncing = false;
        }
    }

    const selection = dockview.onDidActivePanelChange(({panel}) => {
        if (syncing) return;
        syncing = true;
        try {
            show(panel);
        } finally {
            syncing = false;
        }
    });
    const removal = dockview.onDidRemovePanel(panel => {
        const target = targets.get(panel.id);
        if (target) closed.add(target);
        targets.delete(panel.id);
        slots.delete(panel.id);
    });
    vm.on('targetsUpdate', refresh);
    refresh();
    return {
        select,
        dispose() {
            vm.removeListener('targetsUpdate', refresh);
            selection.dispose();
            removal.dispose();
            overlay.dispose();
            drop.dispose();
            content.remove();
            dockview.dispose();
        }
    };
}

interface SpriteTabsProps {
    enabled: boolean;
    activeSection: number;
    vm: Project;
    className: string;
    slots: HTMLElement[];
    onAttach(): void;
    children: React.ReactNode;
    selectTarget(id: string): void;
    resize(): void;
    reopenLabel: string;
    connect(controller: ReturnType<typeof mountSpriteTabs> | null): void;
}

function SpriteTabs(props: SpriteTabsProps) {
    const root = React.useRef<HTMLDivElement>(null);
    const sections = React.useRef<HTMLDivElement>(null);
    const parking = React.useRef<HTMLDivElement>(null);
    const latest = React.useRef(props);
    latest.current = props;
    const [content] = React.useState(() => {
        const node = document.createElement('div');
        node.className = 'tw-plus-sprite-tab-editor';
        return node;
    });
    React.useLayoutEffect(() => {
        sections.current.append(...props.slots);
        parking.current.appendChild(content);
        latest.current.onAttach();
        const observer = new content.ownerDocument.defaultView.ResizeObserver(() => latest.current.resize());
        observer.observe(sections.current);
        return () => observer.disconnect();
    }, [content, props.slots]);
    React.useLayoutEffect(() => {
        if (!props.enabled) {
            root.current.appendChild(content);
            latest.current.resize();
            return () => content.remove();
        }
        const park = () => parking.current?.appendChild(content);
        park();
        const frame = content.ownerDocument.defaultView;
        let restoreFrame: number;
        const controller = mountSpriteTabs(root.current, content, {
            vm: props.vm,
            getSection: () => latest.current.activeSection,
            activateSection(section) {
                frame.cancelAnimationFrame(restoreFrame);
                // Dockview attaches the active panel after dispatching the selection event.
                restoreFrame = frame.requestAnimationFrame(() => {
                    if (content.isConnected && section !== latest.current.activeSection) {
                        content.querySelectorAll<HTMLElement>('[role="tablist"] [role="tab"]')[section]?.click();
                    }
                });
            },
            selectTarget: id => latest.current.selectTarget(id),
            resize: () => latest.current.resize(),
            park,
            reopenLabel: props.reopenLabel
        });
        latest.current.connect(controller);
        return () => {
            frame.cancelAnimationFrame(restoreFrame);
            latest.current.connect(null);
            controller.dispose();
        };
    }, [content, props.enabled, props.vm, props.reopenLabel]);
    // The native tab controller also reacts to bubbled events from elements with role="tab".
    const isolateDockviewTabs = (event: React.SyntheticEvent) => {
        if (!content.contains(event.target as Node)) event.stopPropagation();
    };
    return React.createElement('div', {className: props.className},
        React.createElement('div', {ref: root, onClick: isolateDockviewTabs, onKeyDown: isolateDockviewTabs}),
        React.createElement('div', {ref: parking, hidden: true}),
        createPortal(React.createElement(React.Fragment, null, props.children,
            React.createElement('div', {ref: sections, className: 'tw-plus-sprite-tab-sections'})), content));
}

interface SpriteTabSlots extends Pick<SpriteTabsProps, 'activeSection' | 'vm' | 'enabled' | 'className' | 'resize'> {
    available: boolean;
    locale: string;
}

export function useSpriteTabs({available, enabled, locale, ...props}: SpriteTabSlots) {
    const controller = React.useRef<ReturnType<typeof mountSpriteTabs>>(null);
    const [selectedId, setSelected] = React.useState('');
    const [ready, setReady] = React.useState(false);
    const [slots] = React.useState(() => available ? Array.from({length: 3}, () => {
        const slot = document.createElement('div');
        slot.className = 'tw-plus-sprite-tab-section';
        return slot;
    }) : []);
    const resize = React.useRef(props.resize);
    resize.current = props.resize;
    React.useLayoutEffect(() => {
        slots.forEach((slot, index) => { slot.hidden = index !== props.activeSection; });
        if (slots.length) resize.current();
    }, [slots, props.activeSection]);
    const japanese = /^ja(?:-|$)/i.test(locale);
    const select = (id: string) => controller.current?.select(id);
    return {
        context: enabled ? {selectedId, openLabel: japanese ? '開く' : 'Open', select, open: select} : null,
        renderEditorTabRow: available ? (children: React.ReactNode) => React.createElement(SpriteTabs, {
            ...props, enabled, slots, children, onAttach: () => setReady(true), selectTarget: setSelected,
            connect: next => { controller.current = next; },
            reopenLabel: japanese ? '編集中のスプライトを開く' : 'Open the editing sprite'
        }) : undefined,
        renderEditorPanel: available ? (index: number, children: React.ReactNode) =>
            ready ? createPortal(children, slots[index]) : null :
            undefined
    };
}
