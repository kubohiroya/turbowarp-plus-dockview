import {SpritePropertiesPanel, type SpritePropertiesPanelProps} from '@kubohiroya/turbowarp-plus-editor-layout/sprite-properties';

declare const React: typeof import('react');
declare const ReactDOM: typeof import('react-dom/client');

type SpriteId = 'Cat' | 'Dog';
type Target = SpriteId | 'Stage';
type SpritePatch = Parameters<SpritePropertiesPanelProps['onChange']>[1];

const panel = document.getElementById('panel')!;
const root = ReactDOM.createRoot(panel);
const sprites: Record<SpriteId, SpritePatch> = {
    Cat: {name: 'Cat', x: 0, y: 0, visible: true, size: 100, direction: 90, rotationStyle: 'all around'},
    Dog: {name: 'Dog', x: 12, y: -40, visible: true, size: 80, direction: 45, rotationStyle: 'left-right'}
};
const edits: {id: SpriteId; patch: SpritePatch}[] = [];
let target: Target = 'Cat';
let locale = 'en';

function render() {
    root.render(React.createElement(SpritePropertiesPanel, {
        targetId: target === 'Stage' ? null : target,
        values: target === 'Stage' ? undefined : sprites[target],
        locale,
        onChange: (id, patch) => {
            if (id !== 'Cat' && id !== 'Dog') return;
            edits.push({id, patch});
            update(id, patch);
        }
    }));
}

function update(id: SpriteId, patch: SpritePatch) {
    Object.assign(sprites[id], patch);
    render();
}

function resize(width: number | string, height: number | string) {
    panel.style.width = `${width}px`;
    panel.style.height = `${height}px`;
}

function changeLocale(language: string) {
    locale = language;
    render();
}

function select(id: Target) {
    target = id;
    render();
}

const width = document.querySelector<HTMLInputElement>('#width')!;
const height = document.querySelector<HTMLInputElement>('#height')!;
const language = document.querySelector<HTMLSelectElement>('#language')!;
const targetSelect = document.querySelector<HTMLSelectElement>('#target')!;
width.oninput = height.oninput = () => resize(width.value, height.value);
language.onchange = () => changeLocale(language.value);
targetSelect.onchange = () => {
    const id = targetSelect.value;
    if (id === 'Cat' || id === 'Dog' || id === 'Stage') select(id);
};

Object.assign(window, {spriteFixture: {resize, changeLocale, select, update, edits}});
render();
