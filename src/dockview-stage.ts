import React from 'react';

type StageCommands = {open(): void; close(): void};

export interface DockviewStagePane {
    title: string;
    attach(destination: HTMLElement | null): void;
    connect(commands: StageCommands | null): void;
}

export function useDockviewStage(enabled: boolean, locale: string) {
    const [surface] = React.useState(() => {
        if (!enabled) return null;
        const node = document.createElement('div');
        node.className = 'tw-plus-dockview-stage-surface';
        return node;
    });
    const inline = React.useRef<HTMLElement>(null);
    const dock = React.useRef<HTMLElement>(null);
    const suspended = React.useRef(false);
    const [docked, setDocked] = React.useState(false);
    const [commands, setCommands] = React.useState<StageCommands>(null);

    const move = React.useCallback(() => {
        const destination = suspended.current ? inline.current : dock.current ?? inline.current;
        if (surface && destination && surface.parentElement !== destination) destination.appendChild(surface);
    }, [surface]);
    const inlineRef = React.useCallback((element: HTMLElement | null) => {
        inline.current = element;
        if (surface && element) surface.dir = element.closest('[dir]')?.getAttribute('dir') ?? '';
        move();
    }, [move, surface]);
    const suspend = React.useCallback((value: boolean) => {
        suspended.current = value;
        move();
    }, [move]);

    const japanese = /^ja(?:-|$)/i.test(locale);
    const pane = React.useMemo<DockviewStagePane>(() => ({
        title: japanese ? 'ステージ' : 'Stage',
        attach(destination) {
            dock.current = destination;
            move();
            setDocked(Boolean(destination));
        },
        connect: setCommands
    }), [japanese, move]);
    return surface && {
        surface, pane, docked, commands, inlineRef, suspend,
        openLabel: japanese ? 'ステージをタブで開く' : 'Open stage in workspace',
        closeLabel: japanese ? 'ステージを元の位置に戻す' : 'Return stage from workspace'
    };
}
