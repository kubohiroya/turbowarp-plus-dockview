import React from 'react';
import {observeTileNameTitles} from './native-tile-title.ts';
import {SpritePropertiesPanel, type SpritePropertiesPanelProps} from './sprite-properties.tsx';
import type {SpriteAssetKind, SpriteAssetPreviewItem} from './sprite-tabs.ts';

interface NativeAssetPanelProps {
    children?: React.ReactNode;
    buttons: readonly {title: string; img: string; onClick(): void}[];
    items: readonly {dragPayload?: object; name: string; url?: string; details?: React.ReactNode}[];
    isRtl?: boolean;
    listActions?: React.ElementType;
    selectedItemIndex: number;
    onItemClick(index: number): void;
}

interface NativeSelectorProps extends NativeAssetPanelProps {
    wrapperAttributes?: Record<string, string>;
    listRef?(node: HTMLElement | null): void;
    onListScroll?(event: React.UIEvent<HTMLElement>): void;
    draggingType?: null;
    onAddSortable?(): void;
    onRemoveSortable?(): void;
}

export type NativeAssetSelector = React.ComponentType<NativeSelectorProps>;
export type NativeAssetPanelRenderer = (props: NativeAssetPanelProps, options: {
    panelAttributes: Record<string, string>;
    detailAttributes: Record<string, string>;
    renderSelector(Component: NativeAssetSelector, props: NativeSelectorProps): React.ReactNode;
}) => React.ReactNode;

export type SpriteAssetLayout = (items: readonly SpriteAssetPreviewItem[], index: number,
    detail: React.ReactNode, scrollTop: number) => React.ReactNode;

interface PanelState {
    rememberLayout(render: SpriteAssetLayout): void;
    getScrollTop(): number;
    rememberScrollTop(position: number): void;
}

const noop = () => {};

function NativeAssetPanelSurface({render, panel, kind, state, previewSelector, scrollTop}: {
    render: NativeAssetPanelRenderer;
    panel: NativeAssetPanelProps;
    kind?: SpriteAssetKind;
    state?: PanelState;
    previewSelector?: NativeAssetSelector;
    scrollTop?: number;
}) {
    const list = React.useRef<HTMLElement | null>(null);
    const stopObserving = React.useRef<() => void>();
    const setList = React.useCallback((node: HTMLElement | null) => {
        stopObserving.current?.();
        list.current = node;
        stopObserving.current = observeTileNameTitles(node);
    }, []);
    React.useLayoutEffect(() => {
        const position = state?.getScrollTop() ?? scrollTop;
        if (list.current && position !== undefined) list.current.scrollTop = position;
    }, [state, scrollTop]);
    return render(panel, {
        panelAttributes: {'data-layout-asset-panel': kind ?? ''},
        detailAttributes: {'data-layout-asset-detail': ''},
        renderSelector(Component, props) {
            const selectorProps = {...props, listRef: setList, wrapperAttributes: {'data-layout-asset-list': ''}};
            if (previewSelector) {
                return <div {...{inert: ''}} style={{display: 'contents'}}>
                    {React.createElement(previewSelector, {
                        ...selectorProps, draggingType: null, onAddSortable: noop, onRemoveSortable: noop
                    })}
                </div>;
            }
            return <Component {...selectorProps} onListScroll={event => {
                state?.rememberScrollTop(event.currentTarget.scrollTop);
            }} />;
        }
    });
}

export function NativeAssetPanel({render, previewSelector, panel, kind, locale = 'en', state}: {
    render: NativeAssetPanelRenderer;
    previewSelector: NativeAssetSelector;
    panel: NativeAssetPanelProps;
    kind?: SpriteAssetKind;
    locale?: string;
    state?: PanelState;
}) {
    const {items, buttons, isRtl, listActions} = panel;
    React.useLayoutEffect(() => {
        if (!state) return;
        const previousItems = new Map(items.map(item => [item.dragPayload, item]));
        const readOnlyButtons = buttons.map(({title, img}) => ({title, img, onClick: noop}));
        state.rememberLayout((previewItems, selectedItemIndex, detail, scrollTop) => <NativeAssetPanelSurface
            render={render} kind={kind} previewSelector={previewSelector} scrollTop={scrollTop} panel={{
                isRtl, listActions, selectedItemIndex, buttons: readOnlyButtons,
                onItemClick: noop, children: detail,
                items: previewItems.map(item => {
                    const previous = previousItems.get(item.asset);
                    return {name: item.name, url: item.imageUrl || previous?.url, details: previous?.details};
                })
            }} />);
    }, [state, render, previewSelector, items, buttons, isRtl, listActions, kind]);
    const activePanel = kind === 'sounds' ? {
        ...panel,
        children: <>
            {items.length === 0 && <p className="tw-sprite-media__empty">{labelsFor(locale).emptySounds}</p>}
            {panel.children}
        </>
    } : panel;
    return <NativeAssetPanelSurface render={render} panel={activePanel} kind={kind} state={state} />;
}

export interface SpriteMediaAsset {
    /** Host identity for this item within its target, independent of the list order. */
    id: string;
    name: string;
    imageUrl?: string;
    duration?: number;
    /** Downsampled waveform magnitudes in the range from zero to one. */
    peaks?: readonly number[];
}

export interface SpriteVariable {
    id: string;
    name: string;
    value: string | number;
    scope?: 'local' | 'global';
}

interface PaneProps {
    locale: string;
    editable: boolean;
}

export interface SpriteMediaPaneProps extends PaneProps {
    kind: 'costumes' | 'sounds';
    items: readonly SpriteMediaAsset[];
    selectedId: string | null;
    detailOnly?: boolean;
    onSelect(id: string): void;
    /** Optional host surface. It must honor editable without unmounting its layout. */
    renderEditor?(selected: SpriteMediaAsset, editable: boolean): React.ReactNode;
}

export interface SpriteVariablePaneProps extends PaneProps {
    kind: 'variables';
    variables: readonly SpriteVariable[];
    properties?: SpritePropertiesPanelProps['values'];
    targetId?: string;
    onWriteProperties?: SpritePropertiesPanelProps['onChange'];
    onWrite(id: string, value: SpriteVariable['value']): void;
}

export type SpriteAssetPaneProps = SpriteMediaPaneProps | SpriteVariablePaneProps;

const english = {
    costumes: 'Costumes', sounds: 'Sounds', variables: 'Variables', name: 'Name', value: 'Value',
    local: 'Sprite', global: 'Project', emptyCostumes: 'No costumes', emptySounds: 'No sounds',
    emptyVariables: 'No variables', selectCostume: 'Select a costume', selectSound: 'Select a sound',
    imageUnavailable: 'Image unavailable', waveformUnavailable: 'Waveform unavailable', waveform: 'Waveform',
    seconds: 's'
};
const japanese: typeof english = {
    costumes: 'コスチューム', sounds: '音', variables: '変数', name: '名前', value: '値',
    local: 'スプライト', global: '作品', emptyCostumes: 'コスチュームがありません', emptySounds: '音がありません',
    emptyVariables: '変数がありません', selectCostume: 'コスチュームを選択してください', selectSound: '音を選択してください',
    imageUnavailable: '画像を表示できません', waveformUnavailable: '波形を表示できません', waveform: '波形',
    seconds: '秒'
};
const labelsFor = (locale: string) => /^ja(?:-|$)/i.test(locale) ? japanese : english;

function Waveform({name, peaks, label}: {name: string; peaks: readonly number[]; label: string}) {
    const path = peaks.map((sample, index) => {
        const x = (index + 0.5) * 100 / peaks.length;
        const magnitude = Number.isFinite(sample) ? Math.max(0, Math.min(sample, 1)) : 0;
        const y = magnitude * 49;
        return 'M' + x + ' ' + (50 - y) + 'V' + (50 + y);
    }).join(' ');
    return <svg className="tw-sprite-media__waveform" viewBox="0 0 100 100" preserveAspectRatio="none"
        role="img" aria-label={label + ': ' + name}>
        <path d="M0 50H100" vectorEffect="non-scaling-stroke" className="tw-sprite-media__axis" />
        <path d={path} vectorEffect="non-scaling-stroke" className="tw-sprite-media__peaks" />
    </svg>;
}

function MediaPane({kind, items, selectedId, onSelect, renderEditor, editable, locale, detailOnly}: SpriteMediaPaneProps) {
    const labels = labelsFor(locale);
    const isSound = kind === 'sounds';
    const selected = items.find(asset => asset.id === selectedId);
    const duration = selected?.duration;
    return <section className={detailOnly ? 'tw-sprite-media tw-sprite-media--detail' : 'tw-sprite-media'} aria-label={labels[kind]}>
        {!detailOnly && <ul className="tw-sprite-media__list" aria-label={labels[kind]}>
            {items.map(asset => <li key={asset.id}>
                <button type="button" className="tw-sprite-media__item" title={asset.name} aria-current={asset.id === selectedId || undefined}
                    aria-disabled={!editable || undefined} tabIndex={editable ? 0 : -1} onClick={() => {
                        if (editable) onSelect(asset.id);
                    }}>
                    {asset.imageUrl ? <img src={asset.imageUrl} alt="" className="tw-sprite-media__thumbnail" /> :
                        <span className="tw-sprite-media__symbol" aria-hidden="true">{isSound ? '♪' : '◫'}</span>}
                    <span className="tw-sprite-media__name">{asset.name}</span>
                </button>
            </li>)}
        </ul>}
        <div className="tw-sprite-media__detail">
            {selected ? <>
                <h3 className="tw-sprite-media__title">{selected.name}</h3>
                <div className="tw-sprite-media__surface">
                    {renderEditor?.(selected, editable) ?? (isSound ?
                        (selected.peaks?.length ? <Waveform peaks={selected.peaks} name={selected.name} label={labels.waveform} /> :
                            <p>{labels.waveformUnavailable}</p>) :
                        (selected.imageUrl ? <img src={selected.imageUrl} alt={selected.name} className="tw-sprite-media__preview" /> :
                            <p>{labels.imageUnavailable}</p>))}
                </div>
                {isSound && Number.isFinite(duration) && duration >= 0 &&
                    <p className="tw-sprite-media__duration">{new Intl.NumberFormat(locale, {maximumFractionDigits: 2}).format(duration)} {labels.seconds}</p>}
            </> : <p>{items.length ? (isSound ? labels.selectSound : labels.selectCostume) :
                (isSound ? labels.emptySounds : labels.emptyCostumes)}</p>}
        </div>
    </section>;
}

function VariableField({variable, editable, onWrite}: {
    variable: SpriteVariable;
    editable: boolean;
    onWrite: SpriteVariablePaneProps['onWrite'];
}) {
    const [text, setText] = React.useState<string | null>(null);
    const pending = React.useRef<{text: string; variable: SpriteVariable; write: typeof onWrite} | null>(null);
    const finish = (save: boolean) => {
        const draft = pending.current;
        if (!draft) return;
        pending.current = null;
        setText(null);
        if (!save || draft.text === String(variable.value)) return;
        const number = Number(draft.text);
        const value = typeof draft.variable.value === 'number' && draft.text.trim() && Number.isFinite(number) ?
            number : draft.text;
        draft.write(draft.variable.id, value);
    };

    React.useLayoutEffect(() => {
        // A click can change the active pane before the old input receives blur.
        if (!editable) finish(true);
    }, [editable]);

    return <input className="tw-sprite-variables__input" aria-label={variable.name} data-variable-id={variable.id} readOnly={!editable}
        tabIndex={editable ? 0 : -1} value={text ?? String(variable.value)}
        onChange={event => {
            if (!editable) return;
            const next = event.currentTarget.value;
            pending.current = {text: next, variable, write: onWrite};
            setText(next);
        }}
        onBlur={() => finish(true)}
        onKeyDown={event => {
            if (!editable || event.nativeEvent.isComposing) return;
            if (event.key !== 'Enter' && event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            finish(event.key === 'Enter');
        }} />;
}

function VariablePane({variables, editable, onWrite, locale, properties, targetId, onWriteProperties}: SpriteVariablePaneProps) {
    const labels = labelsFor(locale);
    return <section className="tw-sprite-variables" aria-label={labels.variables}>
        {properties && targetId && onWriteProperties &&
            <SpritePropertiesPanel targetId={targetId} values={properties} locale={locale}
                disabled={!editable} onChange={onWriteProperties} />}
        {variables.length ? <table className="tw-sprite-variables__table">
            <thead><tr><th scope="col">{labels.name}</th><th scope="col">{labels.value}</th></tr></thead>
            <tbody>{variables.map(variable => <tr key={variable.id}>
                <th scope="row">{variable.name}
                    {variable.scope && <span className="tw-sprite-variables__scope">{labels[variable.scope]}</span>}
                </th>
                <td><VariableField variable={variable} editable={editable} onWrite={onWrite} /></td>
            </tr>)}</tbody>
        </table> : <p>{labels.emptyVariables}</p>}
    </section>;
}

export function SpriteAssetPane(props: SpriteAssetPaneProps) {
    return props.kind === 'variables' ? <VariablePane {...props} /> : <MediaPane {...props} />;
}
