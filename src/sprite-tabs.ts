import React from 'react';
import {createPortal} from 'react-dom';
import {createDockview, DefaultTab, themeLight} from 'dockview';
import type {DockviewGroupPanel, GroupPanelPartInitParameters, IDockviewPanel} from 'dockview';
import {createSpriteLayoutMenu} from './sprite-layout-menu.ts';
import {SpriteAssetPane} from './sprite-asset-pane.tsx';
import type {SpriteVariable} from './sprite-asset-pane.tsx';
import {SpriteEditorToolbar, spriteEditorSections} from './sprite-editor-toolbar.tsx';
import type {SpriteSearchResult} from './sprite-editor-toolbar.tsx';
import type {DockviewStagePane} from './dockview-stage.ts';

export {useDockviewStage} from './dockview-stage.ts';

interface CostumeAsset {
    encodeDataURI(): string;
}

interface Target {
    id: string;
    isOriginal: boolean;
    isStage: boolean;
    getName(): string;
    getCurrentCostume?(): {asset?: CostumeAsset} | undefined;
}

interface Project {
    editingTarget?: Target;
    runtime: {targets: Target[]};
    setEditingTarget(id: string): void;
    renameSprite?(id: string, name: string): void;
    on(event: 'targetsUpdate', listener: () => void): void;
    removeListener(event: 'targetsUpdate', listener: () => void): void;
}

export interface SpriteTabView {
    readonly id: string;
    readonly targetId: string;
    readonly isStage: boolean;
    readonly section: number;
    readonly groupId: string;
    readonly active: boolean;
    readonly groupActive: boolean;
}

export interface SpriteTabAdapter<Snapshot = unknown> {
    /** Read the state of the mounted surface; the host's selected target may have changed already. */
    capture(view: SpriteTabView): Snapshot;
    renderInactive(container: HTMLElement, view: SpriteTabView, snapshot: Snapshot | undefined): void | (() => void);
    restore(view: SpriteTabView, snapshot: Snapshot | undefined): void;
    dispose?(view: SpriteTabView, snapshot: Snapshot): void;
}

/** Optional bridge used by a native asset editor to restore and report its selection. */
export interface SpriteAssetSelection {
    restore(target: object, assets: readonly object[]): number | undefined;
    remember(target: object, asset: object | undefined, select?: (index: number) => void): void;
    rememberLayout?(render: SpriteAssetLayout): void;
    getScrollTop?(): number;
    rememberScrollTop?(position: number): void;
}

export type SpriteAssetKind = 'costumes' | 'sounds';
type AssetKind = SpriteAssetKind;

export interface SpriteAssetPreviewItem {
    asset: object;
    name: string;
    imageUrl?: string;
    buffer?: AudioBuffer;
    duration?: number;
}

type SpriteAssetLayout = (items: readonly SpriteAssetPreviewItem[], index: number, detail: React.ReactNode, scrollTop: number) => React.ReactNode;
const variableSection = spriteEditorSections.indexOf('variables');

export interface SpriteAssetPreviewData {
    items: readonly SpriteAssetPreviewItem[];
    defaultAsset?: object;
}
type AssetSelections = Readonly<Record<AssetKind, SpriteAssetSelection>>;

function createAssetSelections(target: Target, source?: {
    selected: Map<AssetKind, object>;
    layouts: Map<AssetKind, SpriteAssetLayout>;
    scroll: Map<AssetKind, number>;
}) {
    const selected = new Map(source?.selected);
    const layouts = new Map(source?.layouts);
    const scroll = new Map(source?.scroll);
    const selectors = new Map<AssetKind, (index: number) => void>();
    const forKind = (kind: AssetKind): SpriteAssetSelection => ({
        restore(current, assets) {
            if (current !== target) return;
            const index = assets.indexOf(selected.get(kind));
            if (index >= 0) return index;
        },
        remember(current, asset, select) {
            if (current !== target) return;
            if (asset) selected.set(kind, asset);
            else selected.delete(kind);
            if (select) selectors.set(kind, select);
        },
        rememberLayout(render) {
            layouts.set(kind, render);
        },
        getScrollTop: () => scroll.get(kind) ?? 0,
        rememberScrollTop(position) {
            scroll.set(kind, position);
        }
    });
    const ports: AssetSelections = {costumes: forKind('costumes'), sounds: forKind('sounds')};
    return {selected, ports, layouts, selectors, scroll};
}

export type SpriteSplitDirection = 'right' | 'below';

const stagePanelId = 'tw-plus-stage-display';

interface TabOptions<Snapshot = unknown> {
    vm: Project;
    getSection(): number;
    activateSection(section: number): void;
    selectTarget(id: string, assetSelections?: AssetSelections): void;
    resize(): void;
    reopenLabel: string;
    multiView?: boolean;
    stagePane?: DockviewStagePane;
    variables?: boolean;
    locale?: string;
    viewAdapter?: SpriteTabAdapter<Snapshot>;
    park?(): void;
    renameLabels?: RenameLabels;
    onToolbarSlots?(slots: readonly ToolbarSlot[]): void;
    onAssetPreviewSlots?(slots: readonly AssetPreviewSlot[]): void;
}

interface ToolbarActions {
    activate(): void;
    setSection(section: number): void;
}

interface ToolbarSlot {
    view: SpriteTabView;
    element: HTMLElement;
}

interface AssetPreviewSlot {
    id: string;
    targetId: string;
    kind: AssetKind | 'variables';
    editable: boolean;
    selected?: object;
    renderLayout?: SpriteAssetLayout;
    scrollTop?: number;
    element: HTMLElement;
}

interface TabSlot {
    body: HTMLElement;
    toolbar?: HTMLElement;
    assetPreview?: HTMLElement;
    clearInactive?: () => void;
    inactiveSection?: number;
}

interface View<Snapshot> {
    id: string;
    target: Target;
    section: number;
    assets: ReturnType<typeof createAssetSelections>;
    snapshots?: Map<number, {snapshot: Snapshot; view: SpriteTabView}>;
}

const renameLabels = {
    en: {title: 'Rename sprite', name: 'Sprite name', cancel: 'Cancel', save: 'Rename'},
    ja: {title: 'スプライト名の変更', name: 'スプライト名', cancel: 'キャンセル', save: '変更'}
};
type RenameLabels = typeof renameLabels.en;

class SpriteTab extends DefaultTab {
    private readonly icon: HTMLImageElement;

    constructor(document: Document) {
        super();
        this.icon = document.createElement('img');
        this.icon.className = 'tw-plus-sprite-tab-icon';
        this.icon.alt = '';
        this.icon.draggable = false;
        this.element.prepend(this.icon);
    }

    init(options: GroupPanelPartInitParameters) {
        super.init(options);
        this.update(options);
    }

    update({params}: {params: {icon?: string}}) {
        this.icon.hidden = !params.icon;
        if (params.icon) this.icon.src = params.icon;
        else this.icon.removeAttribute('src');
    }
}

export function mountSpriteTabs<Snapshot>(root: HTMLElement, content: HTMLElement, options: TabOptions<Snapshot>) {
    const {vm, multiView = false, locale = 'en'} = options;
    const viewAdapter = multiView ? options.viewAdapter : undefined;
    const stagePane = multiView ? options.stagePane : undefined;
    const usesNativeSection = (section: number) => section !== variableSection || !options.variables;
    const document = root.ownerDocument;
    const editLabel = /^ja(?:-|$)/i.test(locale) ? 'クリックしてこのビューで編集' : 'Activate this view to edit';
    const slots = new Map<string, TabSlot>();
    const views = new Map<string, View<Snapshot>>();
    const costumeIcons = new WeakMap<CostumeAsset, string>();
    const remembered = new WeakMap<Target, number>();
    const lastUsed = new WeakMap<Target, View<Snapshot>>();
    const closed = new WeakSet<Target>();
    let active: View<Snapshot> | undefined;
    let observed = vm.editingTarget;
    let syncing = false;
    let nextView = 0;
    let renameDialog: HTMLDialogElement | undefined;
    const text = options.renameLabels ?? renameLabels.en;

    const dockview = createDockview(root, {
        theme: themeLight,
        disableFloatingGroups: true,
        ...(multiView && {createRightHeaderActionComponent: createLayoutMenu}),
        defaultTabComponent: 'sprite',
        createTabComponent: () => new SpriteTab(document),
        getTabContextMenuItems: ({panel}) => {
            const target = views.get(panel.id)?.target;
            if (!target || target.isStage || !vm.renameSprite) return [];
            return [{label: text.title, action: () => openRenameDialog(target)}];
        },
        createComponent: ({name}) => {
            const element = document.createElement('div');
            if (name === stagePanelId) {
                element.className = 'tw-plus-dockview-stage-slot';
                return {element, init() { stagePane.attach(element); }};
            }
            element.className = 'tw-plus-sprite-tab-slot';
            const body = multiView ? document.createElement('div') : element;
            const toolbar = multiView && options.onToolbarSlots ? document.createElement('div') : undefined;
            const assetPreview = multiView && options.onAssetPreviewSlots ? document.createElement('div') : undefined;
            let id: string;
            let dimensions: {dispose(): void} | undefined;
            if (multiView) {
                element.classList.add('tw-plus-sprite-tab-slot--split');
                body.className = 'tw-plus-sprite-tab-body';
                if (toolbar) body.setAttribute('role', 'tabpanel');
                if (toolbar) element.append(toolbar);
                if (assetPreview) {
                    assetPreview.className = 'tw-plus-sprite-tab-asset-preview';
                    assetPreview.hidden = true;
                    assetPreview.tabIndex = 0;
                    assetPreview.setAttribute('role', 'group');
                    assetPreview.setAttribute('aria-label', editLabel);
                    assetPreview.addEventListener('keydown', event => {
                        if (event.target !== assetPreview || (event.key !== 'Enter' && event.key !== ' ')) return;
                        event.preventDefault();
                        event.stopPropagation();
                        activateView(id);
                    });
                    body.append(assetPreview);
                }
                element.append(body);
                body.addEventListener('click', event => {
                    if (active?.id === id) return;
                    event.preventDefault();
                    event.stopPropagation();
                    activateView(id);
                }, {capture: true});
            }
            const slot: TabSlot = {body, toolbar, assetPreview};
            return {
                element,
                init(params) {
                    id = params.api.id;
                    slots.set(id, slot);
                    if (toolbar) body.id = id + '-content';
                    if (multiView) {
                        dimensions = params.api.onDidDimensionsChange(() => {
                            if (active?.id === id && body.contains(content)) options.resize();
                        });
                    }
                },
                dispose() {
                    dimensions?.dispose();
                    clearInactive(slot);
                    if (slots.get(id) === slot) slots.delete(id);
                }
            };
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
    const preventSplit = (event: {kind: string; position: string; preventDefault(): void}) => {
        if (event.kind === 'edge' || event.kind === 'content' && event.position !== 'center') event.preventDefault();
    };
    const overlay = !multiView && dockview.onWillShowOverlay(preventSplit);
    const drop = !multiView && dockview.onWillDrop(preventSplit);

    function createLayoutMenu(group: DockviewGroupPanel) {
        const menu = createSpriteLayoutMenu(document, locale, {
            splitRight: () => { if (group.activePanel) split('right', group.activePanel.id); },
            splitBelow: () => { if (group.activePanel) split('below', group.activePanel.id); },
            close: () => { if (group.activePanel) closeSplit(group.activePanel.id); },
            canClose: () => dockview.groups.length > 1,
            canSplit: () => views.has(group.activePanel?.id)
        });
        return {...menu, init() {}};
    }

    function isOpen(target: Target) {
        return [...views.values()].some(view => view.target === target) && vm.runtime.targets.includes(target);
    }

    function openRenameDialog(target: Target) {
        if (renameDialog || !isOpen(target)) return;
        const dialog = document.createElement('dialog');
        dialog.className = 'tw-plus-sprite-rename';
        dialog.setAttribute('aria-label', text.title);
        const form = document.createElement('form');
        form.method = 'dialog';
        const title = document.createElement('strong');
        title.textContent = text.title;
        const input = document.createElement('input');
        input.type = 'text';
        input.setAttribute('aria-label', text.name);
        input.value = target.getName();
        const save = document.createElement('button');
        save.value = 'save';
        save.textContent = text.save;
        const cancel = document.createElement('button');
        cancel.value = 'cancel';
        cancel.textContent = text.cancel;
        const actions = document.createElement('div');
        actions.append(save, cancel);
        form.append(title, input, actions);
        dialog.append(form);
        dialog.addEventListener('close', () => {
            dialog.remove();
            if (renameDialog !== dialog) return;
            renameDialog = undefined;
            if (dialog.returnValue === 'save' && input.value.trim() && isOpen(target) &&
                input.value !== target.getName()) vm.renameSprite?.(target.id, input.value);
        }, {once: true});
        renameDialog = dialog;
        root.append(dialog);
        dialog.showModal();
        input.select();
    }

    function getIcon(target: Target) {
        const asset = target.getCurrentCostume?.()?.asset;
        if (!asset) return '';
        if (!costumeIcons.has(asset)) costumeIcons.set(asset, asset.encodeDataURI());
        return costumeIcons.get(asset);
    }

    function describe(view: View<Snapshot>, panel = dockview.getPanel(view.id)): SpriteTabView {
        return {
            id: view.id, targetId: view.target.id, isStage: view.target.isStage,
            section: view.section, groupId: panel?.api.group.id ?? '',
            active: active === view, groupActive: panel?.api.isGroupActive ?? false
        };
    }

    function clearInactive(slot: TabSlot) {
        if (slot.assetPreview) slot.assetPreview.hidden = true;
        if (slot.inactiveSection === undefined) return;
        slot.clearInactive?.();
        slot.clearInactive = undefined;
        slot.inactiveSection = undefined;
        // Keep the React portal host mounted while its children reconcile.
        slot.body.replaceChildren(...(slot.assetPreview ? [slot.assetPreview] : []));
    }

    function refreshSurfaces() {
        if (!multiView) return;
        const toolbars: ToolbarSlot[] = [];
        const assetPreviews: AssetPreviewSlot[] = [];
        for (const [id, slot] of slots) {
            const view = views.get(id);
            const panel = dockview.getPanel(id);
            if (!view || !panel || panel.api.group.activePanel !== panel) {
                clearInactive(slot);
                continue;
            }
            const descriptor = describe(view, panel);
            if (slot.toolbar) {
                toolbars.push({view: descriptor, element: slot.toolbar});
                slot.body.setAttribute('aria-labelledby', id + '-section-' + (spriteEditorSections[view.section] ?? 'code'));
            }
            if (view.section === variableSection && options.variables && slot.assetPreview) {
                slot.assetPreview.hidden = false;
                assetPreviews.push({id, targetId: descriptor.targetId, kind: 'variables', editable: active === view,
                    element: slot.assetPreview});
                continue;
            }
            if (active === view) continue;
            const kind = view.section === 1 ? 'costumes' : view.section === 2 ? 'sounds' : undefined;
            if (kind && slot.assetPreview) {
                clearInactive(slot);
                slot.assetPreview.hidden = false;
                assetPreviews.push({id, targetId: descriptor.targetId, kind, element: slot.assetPreview,
                    selected: view.assets.selected.get(kind), editable: false, renderLayout: view.assets.layouts.get(kind), scrollTop: view.assets.scroll.get(kind)});
                continue;
            }
            if (slot.inactiveSection === view.section) continue;
            clearInactive(slot);
            slot.inactiveSection = view.section;
            if (viewAdapter) {
                const cleanup = viewAdapter.renderInactive(slot.body, descriptor, view.snapshots?.get(view.section)?.snapshot);
                if (cleanup) slot.clearInactive = cleanup;
            } else {
                const button = slot.body.ownerDocument.createElement('button');
                button.type = 'button';
                button.textContent = editLabel;
                slot.body.append(button);
            }
        }
        options.onToolbarSlots?.(toolbars);
        options.onAssetPreviewSlots?.(assetPreviews);
    }

    function remember(view: View<Snapshot>) {
        if (usesNativeSection(view.section)) view.section = options.getSection();
        remembered.set(view.target, view.section);
        if (!viewAdapter || !usesNativeSection(view.section) || !slots.get(view.id)?.body.contains(content)) return;
        const descriptor = describe(view);
        const snapshot = viewAdapter.capture(descriptor);
        view.snapshots ??= new Map();
        const previous = view.snapshots.get(view.section);
        if (previous && snapshot !== previous.snapshot) viewAdapter.dispose?.(previous.view, previous.snapshot);
        view.snapshots.set(view.section, {snapshot, view: descriptor});
    }

    function show(panel: IDockviewPanel | undefined) {
        if (panel?.id === stagePanelId) {
            // Displaying the Stage does not select the Stage target or interrupt the sprite editor.
            refreshSurfaces();
            return;
        }
        const next = views.get(panel?.id);
        if (active === next) {
            refreshSurfaces();
            return;
        }
        if (active && views.get(active.id) === active) remember(active);
        active = next;
        if (!next) {
            if (options.park) options.park();
            else content.remove();
            options.selectTarget('');
        } else {
            if (!multiView) next.section = remembered.get(next.target) ?? options.getSection();
            const slot = slots.get(next.id);
            clearInactive(slot);
            slot.body.appendChild(content);
            if (vm.editingTarget !== next.target) vm.setEditingTarget(next.target.id);
            observed = vm.editingTarget;
            options.selectTarget(next.target.id, multiView ? next.assets.ports : undefined);
            content.hidden = !usesNativeSection(next.section);
            if (usesNativeSection(next.section)) options.activateSection(next.section);
            viewAdapter?.restore(describe(next, panel), next.snapshots?.get(next.section)?.snapshot);
            options.resize();
        }
        refreshSurfaces();
    }

    function add(target: Target, splitPosition?: {referencePanel: string; direction: SpriteSplitDirection}, section?: number) {
        let id = target.id;
        if (splitPosition || views.has(id) || id === stagePanelId) {
            do {
                id = 'sprite-view-' + ++nextView;
            } while (views.has(id) || vm.runtime.targets.some(item => item.id === id));
        }
        const source = splitPosition && views.get(splitPosition.referencePanel);
        views.set(id, {id, target, section: section ?? remembered.get(target) ?? options.getSection(),
            assets: createAssetSelections(target, source?.assets)});
        try {
            return dockview.addPanel({id, title: target.getName(), component: 'sprite', inactive: !splitPosition,
                position: splitPosition, params: {icon: getIcon(target)}});
        } catch (error) {
            views.delete(id);
            throw error;
        }
    }

    function activateView(id: string) {
        const view = views.get(id);
        if (!view) return false;
        lastUsed.set(view.target, view);
        dockview.getPanel(id)?.api.setActive();
        return true;
    }

    function select(id: string) {
        const target = vm.runtime.targets.find(item => item.id === id && item.isOriginal);
        if (!target) return;
        closed.delete(target);
        if (active?.target === target && views.get(active.id) === active) {
            activateView(active.id);
            return;
        }
        const recent = lastUsed.get(target);
        const view = recent && views.get(recent.id) === recent ? recent :
            [...views.values()].find(item => item.target === target);
        activateView(view?.id ?? add(target).id);
    }

    function openStage() {
        if (!stagePane) return;
        const existing = dockview.getPanel(stagePanelId);
        if (existing) {
            existing.api.setActive();
            return;
        }
        const reference = dockview.activePanel;
        dockview.addPanel({id: stagePanelId, title: stagePane.title, component: stagePanelId, renderer: 'always',
            position: reference ? {referencePanel: reference.id, direction: 'right'} : undefined});
    }

    function closeStage() {
        dockview.getPanel(stagePanelId)?.api.close();
    }

    function split(direction: SpriteSplitDirection, id = active?.id) {
        const reference = views.get(id);
        if (!multiView || !reference) return;
        const section = reference === active && usesNativeSection(reference.section) ? options.getSection() : reference.section;
        const panel = add(reference.target, {referencePanel: id, direction}, section);
        activateView(panel.id);
        return panel.id;
    }

    function closeSplit(id = active?.id) {
        const panel = dockview.getPanel(id);
        if (!multiView || !panel || dockview.groups.length <= 1) return false;
        syncing = true;
        try {
            dockview.removeGroup(panel.api.group);
            show(dockview.activePanel);
        } finally {
            syncing = false;
        }
        return true;
    }

    function setViewSection(id: string, section: number) {
        const view = views.get(id);
        if (!view || !Number.isInteger(section) || section < 0 || section > (options.variables ? variableSection : 2) || view.section === section) return false;
        if (view === active && viewAdapter) remember(view);
        view.section = section;
        if (view === active) {
            content.hidden = !usesNativeSection(section);
            if (usesNativeSection(section)) {
                options.activateSection(section);
                options.resize();
            }
            viewAdapter?.restore(describe(view), view.snapshots?.get(section)?.snapshot);
        }
        refreshSurfaces();
        return true;
    }

    function syncActiveSection(section: number) {
        if (!active || !usesNativeSection(active.section) || active.section === section) return;
        active.section = section;
        refreshSurfaces();
    }

    function refresh() {
        if (syncing) return;
        syncing = true;
        try {
            const available = new Set(vm.runtime.targets.filter(target => target.isOriginal));
            const editing = vm.editingTarget;
            for (const [id, view] of views) {
                if (!available.has(view.target)) dockview.getPanel(id)?.api.close();
            }
            const represented = new Set<Target>();
            for (const [id, view] of views) {
                represented.add(view.target);
                const panel = dockview.getPanel(id);
                if (panel && panel.title !== view.target.getName()) panel.api.setTitle(view.target.getName());
                const icon = getIcon(view.target);
                if (panel && panel.api.getParameters().icon !== icon) panel.api.updateParameters({icon});
            }
            for (const target of available) {
                if (!represented.has(target) && (!target.isStage || target === editing) && !closed.has(target)) {
                    add(target);
                }
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

    function disposeView(view: View<Snapshot>) {
        for (const stored of view.snapshots?.values() ?? []) viewAdapter?.dispose?.(stored.view, stored.snapshot);
        const slot = slots.get(view.id);
        if (slot) clearInactive(slot);
        slots.delete(view.id);
        views.delete(view.id);
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
        if (panel.id === stagePanelId) {
            stagePane?.attach(null);
            return;
        }
        const view = views.get(panel.id);
        if (!view) return;
        if (view === active) remembered.set(view.target, usesNativeSection(view.section) ? options.getSection() : view.section);
        disposeView(view);
        if (![...views.values()].some(item => item.target === view.target)) closed.add(view.target);
    });
    const layout = multiView && dockview.onDidLayoutChange(refreshSurfaces);
    vm.on('targetsUpdate', refresh);
    refresh();
    return {
        select, openStage, closeStage, split, closeSplit, activateView, setViewSection, syncActiveSection, refreshSurfaces,
        selectAsset(id: string, kind: AssetKind, index: number) {
            if (active?.id === id && active.section === (kind === 'costumes' ? 1 : 2)) {
                active.assets.selectors.get(kind)?.(index);
            }
        },
        currentView: () => active && describe(active),
        views: () => [...views.values()].map(view => describe(view)),
        dispose() {
            stagePane?.attach(null);
            renameDialog?.remove();
            renameDialog = undefined;
            vm.removeListener('targetsUpdate', refresh);
            selection.dispose();
            removal.dispose();
            if (overlay) overlay.dispose();
            if (drop) drop.dispose();
            if (layout) layout.dispose();
            for (const view of views.values()) disposeView(view);
            content.remove();
            dockview.dispose();
        }
    };
}

type SpriteTabsController<Snapshot> = ReturnType<typeof mountSpriteTabs<Snapshot>>;

type SpriteTabsProps<Snapshot> = Omit<TabOptions<Snapshot>, 'activateSection' | 'getSection' | 'park' | 'onToolbarSlots' | 'onAssetPreviewSlots'> & {
    children: React.ReactNode;
    activateSection?(section: number): void;
    slots: HTMLElement[];
    onAttach(): void;
    enabled: boolean;
    activeSection: number;
    className: string;
    connect(controller: SpriteTabsController<Snapshot> | null): void;
    activeTools?: React.ReactNode;
    renderToolbar?(view: SpriteTabView, actions: ToolbarActions): React.ReactNode;
    getAssetPreview?(targetId: string, kind: SpriteAssetKind): SpriteAssetPreviewData;
    getVariables?(targetId: string): readonly SpriteVariable[];
    writeVariable?(targetId: string, id: string, value: SpriteVariable['value']): void;
    getCodeSearchItems?(targetId: string): readonly SpriteSearchResult[];
    openCodeSearchResult?(targetId: string, id: string): void;
};

function AssetPreview({locale, data, kind, selected, renderLayout, scrollTop}: {
    locale: string;
    data: SpriteAssetPreviewData;
    kind: SpriteAssetKind;
    selected?: object;
    renderLayout?: SpriteAssetLayout;
    scrollTop?: number;
}) {
    const chosen = data.items.find(item => item.asset === selected) ??
        data.items.find(item => item.asset === data.defaultAsset) ?? data.items[0];
    const peaks = React.useMemo(() => {
        if (!chosen?.buffer?.length) return undefined;
        const samples = chosen.buffer.getChannelData(0);
        const chunk = Math.ceil(samples.length / 192);
        const levels: number[] = [];
        for (let offset = 0; offset < samples.length; offset += chunk) {
            let peak = 0;
            for (let i = offset; i < Math.min(offset + chunk, samples.length); i++) {
                peak = Math.max(peak, Math.abs(samples[i]));
            }
            levels.push(peak);
        }
        return levels;
    }, [chosen?.buffer]);
    const index = chosen ? data.items.indexOf(chosen) : -1;
    const pane = React.createElement(SpriteAssetPane, {
        locale, kind, editable: false, onSelect() {},
        detailOnly: Boolean(renderLayout),
        selectedId: chosen ? String(index) : null,
        items: data.items.map((item, position) => ({
            id: String(position), name: item.name, imageUrl: item.imageUrl,
            duration: item.duration ?? item.buffer?.duration, peaks: item === chosen ? peaks : undefined
        }))
    });
    return renderLayout ? renderLayout(data.items, index, pane, scrollTop ?? 0) : pane;
}

function SpriteTabs<Snapshot>(props: SpriteTabsProps<Snapshot>) {
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
    const [toolbarSlots, setToolbarSlots] = React.useState<readonly ToolbarSlot[]>([]);
    const [assetPreviewSlots, setAssetPreviewSlots] = React.useState<readonly AssetPreviewSlot[]>([]);
    const controller = React.useRef<SpriteTabsController<Snapshot>>(null);
    const hasVariables = Boolean(props.getVariables);
    const hasToolbar = Boolean(props.renderToolbar) || hasVariables;
    const hasAssetPreview = Boolean(props.getAssetPreview) || hasVariables;
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
            setToolbarSlots([]);
            setAssetPreviewSlots([]);
            content.hidden = false;
            root.current.appendChild(content);
            latest.current.resize();
            return () => content.remove();
        }
        const frame = content.ownerDocument.defaultView;
        let restoreFrame: number;
        const park = () => parking.current?.appendChild(content);
        park();
        const instance = mountSpriteTabs(root.current, content, {
            vm: props.vm,
            getSection: () => latest.current.activeSection,
            activateSection(section) {
                frame.cancelAnimationFrame(restoreFrame);
                if (latest.current.activateSection) {
                    latest.current.activateSection(section);
                    return;
                }
                // Dockview attaches the active panel after dispatching the selection event.
                restoreFrame = frame.requestAnimationFrame(() => {
                    if (content.isConnected && section !== latest.current.activeSection) {
                        content.querySelectorAll<HTMLElement>('[role="tablist"] [role="tab"]')[section]?.click();
                    }
                });
            },
            park,
            renameLabels: props.renameLabels,
            selectTarget: (id, assets) => latest.current.selectTarget(id, assets),
            resize: () => latest.current.resize(),
            reopenLabel: props.reopenLabel,
            multiView: props.multiView,
            stagePane: props.stagePane,
            variables: hasVariables,
            locale: props.locale,
            viewAdapter: props.viewAdapter,
            onToolbarSlots: hasToolbar ? setToolbarSlots : undefined,
            onAssetPreviewSlots: hasAssetPreview ? setAssetPreviewSlots : undefined
        });
        controller.current = instance;
        latest.current.connect(instance);
        if (props.multiView) props.stagePane?.connect({open: instance.openStage, close: instance.closeStage});
        return () => {
            frame.cancelAnimationFrame(restoreFrame);
            controller.current = null;
            latest.current.connect(null);
            props.stagePane?.connect(null);
            instance.dispose();
        };
    }, [content, props.enabled, props.vm, props.reopenLabel, props.multiView, props.locale,
        props.viewAdapter, props.stagePane, props.renameLabels, hasVariables, hasToolbar, hasAssetPreview]);
    React.useLayoutEffect(() => {
        controller.current?.syncActiveSection(props.activeSection);
    }, [props.activeSection]);
    const workspace = controller.current;
    // The native tab controller also reacts to bubbled events from elements with role="tab".
    const isolateDockviewTabs = (event: React.SyntheticEvent) => {
        if (!content.contains(event.target as Node)) event.stopPropagation();
    };
    return React.createElement('div', {className: props.className,
        'data-multi-view': props.enabled && props.multiView || undefined},
        React.createElement('div', {ref: root, onClick: isolateDockviewTabs, onKeyDown: isolateDockviewTabs}),
        React.createElement('div', {ref: parking, hidden: true}),
        createPortal(React.createElement(React.Fragment, null,
            props.multiView && props.getVariables ? React.createElement('div', {hidden: true}, props.children) : props.children,
            React.createElement('div', {ref: sections, className: 'tw-plus-sprite-tab-sections'})), content), toolbarSlots.map(({view, element}) => {
            const actions = {
                activate: () => { workspace?.activateView(view.id); },
                setSection: (section: number) => {
                    workspace?.setViewSection(view.id, section);
                    workspace?.activateView(view.id);
                }
            };
            const currentSection = spriteEditorSections[view.section] ?? 'code';
            const toolbar = props.renderToolbar?.(view, actions) ?? (props.getVariables &&
                React.createElement(SpriteEditorToolbar, {
                    viewId: view.id, locale: props.locale, section: currentSection, isStage: view.isStage,
                    activeGroup: view.groupActive,
                    actions: view.active && currentSection !== 'variables' ? props.activeTools : undefined,
                    onSectionChange: section => actions.setSection(spriteEditorSections.indexOf(section)),
                    search: {
                        onFocus: actions.activate,
                        find(query, section) {
                            let items: readonly SpriteSearchResult[] = [];
                            if (section === 'code') items = props.getCodeSearchItems?.(view.targetId) ?? [];
                            else if (section === 'variables') {
                                items = props.getVariables(view.targetId).map(variable => ({id: variable.id, label: variable.name}));
                            } else {
                                items = props.getAssetPreview?.(view.targetId, section).items.map((item, index) =>
                                    ({id: String(index), label: item.name})) ?? [];
                            }
                            const text = query.toLocaleLowerCase();
                            return items.filter(item => item.label.toLocaleLowerCase().includes(text));
                        },
                        select(result, section) {
                            actions.activate();
                            if (section === 'code') props.openCodeSearchResult?.(view.targetId, result.id);
                            else if (section === 'variables') {
                                const field = assetPreviewSlots.find(slot => slot.id === view.id)?.element;
                                [...(field?.querySelectorAll<HTMLInputElement>('input[data-variable-id]') ?? [])]
                                    .find(input => input.dataset.variableId === result.id)?.focus();
                            } else workspace?.selectAsset(view.id, section, Number(result.id));
                        }
                    }
                }));
            return createPortal(toolbar, element, view.id);
        }), assetPreviewSlots.map(({id, targetId, kind, element, editable, selected, renderLayout, scrollTop}) =>
            createPortal(kind === 'variables' ? React.createElement(SpriteAssetPane, {
                kind, locale: props.locale, editable, variables: props.getVariables?.(targetId) ?? [],
                onWrite(variableId, value) {
                    props.writeVariable?.(targetId, variableId, value);
                    workspace?.refreshSurfaces();
                }
            }) : props.getAssetPreview && React.createElement(AssetPreview, {
                locale: props.locale, kind, selected, renderLayout, scrollTop, data: props.getAssetPreview(targetId, kind)
            }), element, id)));
}

export function useSpriteTabs<Snapshot>({available, enabled, locale, ...props}:
    Omit<SpriteTabsProps<Snapshot>, 'children' | 'connect' | 'selectTarget' | 'reopenLabel' | 'renameLabels' |
        'slots' | 'onAttach' | 'activateSection'> & {
        available: boolean;
        locale: string;
        activateSection?(section: number): void;
    }) {
    const controller = React.useRef<SpriteTabsController<Snapshot>>(null);
    const [selection, setSelection] = React.useState<{id: string; assets?: AssetSelections}>({id: ''});
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
        controller,
        assetSelections: enabled ? selection.assets : undefined,
        context: enabled ? {selectedId: selection.id, openLabel: japanese ? '開く' : 'Open', select, open: select} : null,
        renderEditorTabRow: available ? (children: React.ReactNode) => React.createElement(SpriteTabs<Snapshot>, {
            ...props, enabled, locale, children, slots, onAttach: () => setReady(true),
            selectTarget: (id, assets) => setSelection({id, assets}),
            connect: next => { controller.current = next; },
            reopenLabel: japanese ? '編集中のスプライトを開く' : 'Open the editing sprite',
            renameLabels: japanese ? renameLabels.ja : renameLabels.en
        }) : undefined,
        renderEditorPanel: available ? (index: number, children: React.ReactNode) =>
            ready ? createPortal(children, slots[index]) : null :
            undefined
    };
}
