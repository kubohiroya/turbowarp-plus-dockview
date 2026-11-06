import {SpritePropertiesPanel} from '../dist/sprite-properties.js';

const panel = document.getElementById('panel');
const root = ReactDOM.createRoot(panel);
const sprites = {
    Cat: {name: 'Cat', x: 0, y: 0, visible: true, size: 100, direction: 90, rotationStyle: 'all around'},
    Dog: {name: 'Dog', x: 12, y: -40, visible: true, size: 80, direction: 45, rotationStyle: 'left-right'}
};
const edits = [];
let target = 'Cat';
let locale = 'en';

function render() {
    root.render(React.createElement(SpritePropertiesPanel, {
        targetId: target === 'Stage' ? null : target,
        values: sprites[target],
        locale,
        onChange: (id, patch) => {
            edits.push({id, patch});
            update(id, patch);
        }
    }));
}

function update(id, patch) {
    Object.assign(sprites[id], patch);
    render();
}

function resize(width, height) {
    panel.style.width = `${width}px`;
    panel.style.height = `${height}px`;
}

function changeLocale(language) {
    locale = language;
    render();
}

function select(id) {
    target = id;
    render();
}

const width = document.getElementById('width');
const height = document.getElementById('height');
width.oninput = height.oninput = () => resize(width.value, height.value);
document.getElementById('language').onchange = event => changeLocale(event.target.value);
document.getElementById('target').onchange = event => select(event.target.value);

window.spriteFixture = {resize, changeLocale, select, update, edits};
render();
