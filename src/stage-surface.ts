import type {Context, ElementType} from 'react';
import {createPortal} from 'react-dom';
import type {useDockviewStage} from './dockview-stage.ts';
import {createDockview, themeLight} from 'dockview';

interface StageWindowConnection<Target> {
    ready: Promise<Target>;
    disconnected: AbortSignal;
    close(): void;
}

interface StageWindowHost<Request, Target> {
    open(request: Request): StageWindowConnection<Target> | null;
}

export function createStagePopoutHost<Request, Target extends {mount: HTMLElement}>(
    host: StageWindowHost<Request, Target>, title: string
): StageWindowHost<Request, Target> {
    return {
        open(request) {
            const connection = host.open(request);
            if (!connection) return null;

            const disconnected = new AbortController();
            const disconnect = () => disconnected.abort();
            connection.disconnected.addEventListener('abort', disconnect, {once: true});
            if (connection.disconnected.aborted) disconnect();

            let dockview: ReturnType<typeof createDockview> | undefined;
            let removed: {dispose(): void} | undefined;
            let closed = false;
            const ready = connection.ready.then(target => {
                if (closed || disconnected.signal.aborted) throw new Error('Stage window closed');
                const content = target.mount.ownerDocument.createElement('div');
                Object.assign(content.style, {width: '100%', height: '100%'});
                dockview = createDockview(target.mount, {
                    createComponent: () => ({element: content, init() {}}),
                    theme: themeLight,
                    disableDnd: true,
                    disableFloatingGroups: true
                });
                dockview.addPanel({id: 'stage', component: 'stage', title});
                removed = dockview.onDidRemovePanel(disconnect);
                return {...target, mount: content};
            });

            return {
                ready,
                disconnected: disconnected.signal,
                close() {
                    if (closed) return;
                    closed = true;
                    connection.disconnected.removeEventListener('abort', disconnect);
                    try {
                        removed?.dispose();
                        dockview?.dispose();
                    } finally {
                        connection.close();
                    }
                }
            };
        }
    };
}

const isJapanese = (locale: string) => /^ja(?:-|$)/i.test(locale);

export function stageDockActionLabel(locale: string, {drawer, detached, external}: {
    drawer?: boolean;
    detached: boolean;
    external?: boolean;
}) {
    const japanese = isJapanese(locale);
    if (detached) return japanese ? 'ドックに戻す' : 'Dock stage';
    if (external) return japanese ? (drawer ? '別窓で開く' : '別ウィンドウで開く') : 'Open in a separate window';
    return japanese ? 'アンドック' : 'Undock stage';
}

type StagePlacement = Pick<NonNullable<ReturnType<typeof useDockviewStage>>, 'surface' | 'inlineRef' | 'docked'>;

export function createStageSurface(React: typeof import('react'), {
    context, EdgeDrawer, Panel
}: {
    context: Context<{locale: string; stageDrawer?: boolean; setStageDrawerOpen?: (open: boolean) => void}>;
    EdgeDrawer: ElementType;
    Panel: ElementType;
}) {
    return function StageSurface({externalHost, onDockActionChange, placement, ...props}: {placement?: StagePlacement; [key: string]: any}) {
        const {locale, stageDrawer, setStageDrawerOpen} = React.useContext(context);
        const japanese = isJapanese(locale);
        const title = japanese ? 'ステージ' : 'Stage';
        const host = React.useMemo(() => stageDrawer && externalHost ?
            createStagePopoutHost(externalHost, title) : externalHost, [stageDrawer, externalHost, title]);
        const panel = React.createElement(Panel, {
            ...props,
            id: 'stage',
            title,
            externalHost: host,
            externalOnly: stageDrawer,
            onDockActionChange: stageDrawer && !host ? undefined : onDockActionChange
        });
        const inline = placement ? React.createElement('div', {
            ref: placement.inlineRef,
            'data-stage-in-workspace': placement.docked || undefined
        }) : panel;
        const dock = stageDrawer ? React.createElement(EdgeDrawer, {
            edge: 'right',
            label: japanese ? 'ステージを展開' : 'Reveal stage',
            onOpenChange: setStageDrawerOpen
        }, inline) : inline;
        return placement ? React.createElement(React.Fragment, null, dock, createPortal(panel, placement.surface)) : dock;
    };
}
