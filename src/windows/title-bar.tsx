import React, {type ReactNode} from 'react';

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

export function WindowTitleBar({title, target, titleContent, children, windowControls, presentation = 'internal'}: WindowTitleBarProps): React.ReactElement {
    const actions = <>{children}{presentation === 'internal' && windowControls}</>;
    return (
        <header aria-label={title} className="tw-window-titlebar">
            <div className="tw-window-titlebar__heading">
                {target}
                {titleContent ?? <strong className="tw-window-titlebar__title">{title}</strong>}
            </div>
            <div className="tw-window-titlebar__actions">{actions}</div>
        </header>
    );
}

const icons = {
    open: <><path d="M8 3h5v5M13 3 7 9"/><path d="M6 4H3v9h9v-3"/></>,
    minimize: <path d="M3 8h10"/>,
    maximize: <rect x="3.5" y="3.5" width="9" height="9" rx="1"/>,
    restore: <><path d="M6.5 5V3.5h6v6H11"/><rect x="3.5" y="6" width="7" height="7" rx="1"/></>,
    dock: <path d="m4 4 8 8m0-8-8 8"/>
};

interface WindowButtonProps {
    icon: keyof typeof icons;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    showLabel?: boolean;
}

function WindowButton({icon, label, onClick, disabled, showLabel = false}: WindowButtonProps) {
    return (
        <button aria-label={label} className="tw-window-titlebar__button" disabled={disabled}
            onClick={onClick} title={label} type="button">
            <svg aria-hidden="true" focusable="false" viewBox="0 0 16 16" fill="none"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                {icons[icon]}
            </svg>
            {showLabel && <span>{label}</span>}
        </button>
    );
}

export function OpenWindowButton({onOpen, disabled = false, label = 'Open in another window'}: ButtonOptions & {onOpen: () => void}): React.ReactElement {
    return <WindowButton icon="open" label={label} onClick={onOpen} disabled={disabled} showLabel />;
}

export function MinimizeWindowButton({onMinimize, disabled = false, label = 'Minimize window'}: ButtonOptions & {onMinimize: () => void}): React.ReactElement {
    return <WindowButton icon="minimize" label={label} onClick={onMinimize} disabled={disabled} />;
}

export function MaximizeWindowButton({maximized = false, onChange, disabled = false,
    maximizeLabel = 'Maximize window', restoreLabel = 'Restore window'}: {
    maximized?: boolean;
    onChange: (maximized: boolean) => void;
    disabled?: boolean;
    maximizeLabel?: string;
    restoreLabel?: string;
}): React.ReactElement {
    return <WindowButton icon={maximized ? 'restore' : 'maximize'}
        label={maximized ? restoreLabel : maximizeLabel}
        onClick={() => onChange(!maximized)} disabled={disabled} />;
}

export function DockWindowButton({onDock, disabled = false, label = 'Close and dock'}: ButtonOptions & {onDock: () => void}): React.ReactElement {
    return <WindowButton icon="dock" label={label} onClick={onDock} disabled={disabled} />;
}
