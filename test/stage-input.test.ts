import assert from 'node:assert/strict';
import {test} from 'node:test';
import {JSDOM} from 'jsdom';
import {attachStageInput} from '../src/stage-input.ts';

test('external input routes pointer events and releases held input on blur and detach', () => {
    const {window} = new JSDOM('<canvas></canvas><input>');
    const {document} = window;
    const canvas = document.querySelector('canvas');
    const messages = [];
    let pointerHeld = true;
    let moves = 0;
    let ups = 0;
    const detach = attachStageInput({
        document, canvas,
        onMove: () => { moves++; },
        onUp: () => { ups++; },
        releasePointer: () => {
            const held = pointerHeld;
            pointerHeld = false;
            return held;
        },
        postIO: (device, data) => messages.push([device, data])
    });
    const press = (element, options = {}) => element.dispatchEvent(new window.KeyboardEvent('keydown', {
        key: ' ', code: 'Space', keyCode: 32, bubbles: true, cancelable: true, ...options
    }));
    assert.equal(press(document.querySelector('input')), true);
    assert.equal(press(canvas, {ctrlKey: true}), true);
    assert.equal(press(canvas), false);
    assert.equal(press(canvas, {repeat: true}), false);
    document.dispatchEvent(new window.Event('mousemove'));
    document.dispatchEvent(new window.Event('touchend'));
    window.dispatchEvent(new window.Event('blur'));
    assert.deepEqual(messages, [
        ['keyboard', {key: ' ', keyCode: 32, isDown: true}],
        ['keyboard', {key: ' ', keyCode: 32, isDown: false}],
        ['mouse', {button: 0, wasDragged: true, isDown: false}]
    ]);
    assert.deepEqual([moves, ups], [1, 1]);

    press(canvas, {key: 'Dead', code: 'Quote', keyCode: 222});
    detach();
    assert.deepEqual(messages.slice(3), [
        ['keyboard', {key: 222, keyCode: 222, isDown: true}],
        ['keyboard', {key: 222, keyCode: 222, isDown: false}]
    ]);
    document.dispatchEvent(new window.Event('mousemove'));
    document.dispatchEvent(new window.Event('mouseup'));
    press(canvas);
    assert.deepEqual([moves, ups, messages.length], [1, 1, 5]);
    window.close();
});
