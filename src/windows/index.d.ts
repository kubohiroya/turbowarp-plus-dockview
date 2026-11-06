import type {ReactElement, ReactNode} from 'react';

export interface WindowTitleBarProps {
    title: string;
    target?: ReactNode;
    titleContent?: ReactNode;
    children?: ReactNode;
    windowControls?: ReactNode;
    presentation?: 'internal' | 'external';
}

interface ButtonOptions {
    disabled?: boolean;
    label?: string;
}

export function WindowTitleBar(props: WindowTitleBarProps): ReactElement;
export function OpenWindowButton(props: ButtonOptions & {onOpen: () => void}): ReactElement;
export function MinimizeWindowButton(props: ButtonOptions & {onMinimize: () => void}): ReactElement;
export function MaximizeWindowButton(props: {
    maximized?: boolean;
    onChange: (maximized: boolean) => void;
    disabled?: boolean;
    maximizeLabel?: string;
    restoreLabel?: string;
}): ReactElement;
export function DockWindowButton(props: ButtonOptions & {onDock: () => void}): ReactElement;

export interface InternalWindowRequest {
    id: string;
    title: string;
    openExternal?: () => void;
    onDuplicate?: () => void;
    rememberPlacement?: boolean;
    layer?: 'utility';
    closeLabel?: string;
    onActivate?: () => void;
    onMinimize?: () => void;
}

interface InternalWindowConnection {
    ready: Promise<{mount: HTMLElement; presentation: 'internal'}>;
    disconnected: AbortSignal;
    close(): void;
    activate(): void;
    setTitle(title: string): void;
}

export function WindowDesktop(props: {locale?: string; layoutMenu?: boolean; children?: ReactNode}): ReactElement;
export function WindowLayoutMenu(props: {
    locale?: string;
    presentation: 'internal' | 'external';
    mode?: 'normal' | 'minimized' | 'maximized';
    onOpenExternal?: () => void;
    onDock?: () => void;
    onDuplicate?: () => void;
    onMaximize?: () => void;
    onMinimize?: () => void;
    onRestore?: () => void;
}): ReactElement;
export function WindowList(): ReactElement | null;
export function useWindowHost(): {open(request: InternalWindowRequest): InternalWindowConnection | null} | undefined;

export function DockablePanel(props: {
    children?: ReactNode;
    mount?: HTMLElement;
    onDock: () => void;
    onResize?: () => void;
    dockLabel?: string;
}): ReactElement;

export function EditorFullscreenButton(props: {locale?: string; className?: string}): ReactElement | null;
