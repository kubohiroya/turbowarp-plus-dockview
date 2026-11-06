import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createSpriteInfoAdapter} from '../dist/sprite-properties.js';

test('sprite properties update only the active sprite and retain the native fallback', () => {
    const Fallback = () => null;
    const Panel = () => null;
    const adapt = createSpriteInfoAdapter(Fallback, Panel);
    const original = {id: 'sprite-a', isStage: false};
    const other = {id: 'sprite-b', isStage: false};
    const values = {name: 'A', x: 0, visible: true};
    const updates = [];
    const vm = {
        editingTarget: original,
        _dragTarget: null,
        renameSprite: (id, name) => updates.push([id, name]),
        postSpriteInfo: patch => updates.push(patch)
    };
    const {props} = adapt({targetId: original.id, values, vm, locale: 'ja'});
    assert.equal(props.fallback.type, Fallback);
    assert.equal(props.targetId, original.id);
    assert.equal(props.values, values);
    assert.equal(props.locale, 'ja');
    props.onChange(original.id, {name: 'Renamed'});
    props.onChange(original.id, {x: 15, visible: false});
    vm._dragTarget = other;
    props.onChange(original.id, {x: 20});
    vm._dragTarget = null;
    vm.editingTarget = {...original};
    props.onChange(original.id, {name: 'Old project'});
    vm.editingTarget = other;
    props.onChange(original.id, {x: 20});
    assert.deepEqual(updates, [[original.id, 'Renamed'], {x: 15, visible: false}]);

    vm.editingTarget = {id: 'stage', isStage: true};
    const stage = adapt({targetId: 'stage', vm}).props;
    assert.equal(stage.disabled, true);
    stage.onChange('stage', {x: 10});
    assert.equal(updates.length, 2);
});
