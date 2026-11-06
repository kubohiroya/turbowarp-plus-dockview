type Key = {key: string | number; keyCode: number};

interface StageInput {
    document: Document;
    canvas: HTMLCanvasElement;
    onMove: EventListener;
    onUp: EventListener;
    releasePointer(): boolean;
    postIO(device: 'keyboard' | 'mouse', data: ({isDown: boolean} & Key) |
        {isDown: false; button: number; wasDragged: boolean}): void;
}

/**
 * Connect a stage to the document hosting its canvas. The stage supplies its
 * pointer handlers and clears its own drag state when the document loses focus.
 */
export function attachStageInput({document, canvas, onMove, onUp, releasePointer, postIO}: StageInput) {
    const window = document.defaultView;
    const keys = new Map<string | number, Key>();

    function keyDown(event: KeyboardEvent) {
        if (event.target !== document && event.target !== document.body && event.target !== canvas) return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const {code, key, keyCode} = event;
        const id = code || keyCode;
        if (!keys.has(id)) {
            const data = {key: key && key !== 'Dead' ? key : keyCode, keyCode};
            keys.set(id, data);
            postIO('keyboard', {...data, isDown: true});
        }
        if ([8, 32, 37, 38, 39, 40].includes(keyCode)) event.preventDefault();
    }

    function keyUp(event: KeyboardEvent) {
        const id = event.code || event.keyCode;
        const data = keys.get(id);
        if (keys.delete(id)) postIO('keyboard', {...data, isDown: false});
    }

    function release() {
        const held = [...keys.values()];
        keys.clear();
        for (const data of held) postIO('keyboard', {...data, isDown: false});
        if (releasePointer()) postIO('mouse', {isDown: false, button: 0, wasDragged: true});
    }

    const listeners: [string, EventListener][] = [
        ['mousemove', onMove], ['mouseup', onUp], ['touchmove', onMove], ['touchend', onUp],
        ['keydown', keyDown], ['keyup', keyUp]
    ];
    for (const [name, callback] of listeners) document.addEventListener(name, callback);
    window?.addEventListener('blur', release);

    return () => {
        for (const [name, callback] of listeners) document.removeEventListener(name, callback);
        window?.removeEventListener('blur', release);
        release();
    };
}
