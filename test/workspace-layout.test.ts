import assert from 'node:assert/strict';
import test from 'node:test';
import {Orientation, type SerializedDockview} from 'dockview';
import {readWorkspaceLayout, workspaceWithoutTransientPanels} from '../dist/workspace-layout.js';

test('transient files are removed from the saved layout without removing the other splits', () => {
    const grid: SerializedDockview['grid'] = {
        width: 1000, height: 700, orientation: Orientation.HORIZONTAL,
        root: {type: 'branch', size: 1000, data: [
            {type: 'leaf', size: 350, data: {id: 'left', views: ['code', 'file1', 'yaml'], activeView: 'file1'}},
            {type: 'leaf', size: 500, data: {id: 'right', views: ['stage'], activeView: 'stage'}},
            {type: 'leaf', size: 150, data: {id: 'file-only', views: ['file2'], activeView: 'file2'}}
        ]}
    };
    const result = workspaceWithoutTransientPanels(grid, 'file-only', new Set(['file1', 'file2']), 'code');
    assert.equal(result?.activeGroup, 'left');
    const layout = readWorkspaceLayout(JSON.stringify({...result, version: 1, project: 'A', editingView: 'code',
        panels: {code: {kind: 'sprite', name: 'Sprite', stage: false, section: 0}, stage: {kind: 'stage'},
            yaml: {kind: 'document', providerId: 'provider', documentId: 'example'}}}), 'A');
    assert.deepEqual(layout?.grid.root, {type: 'branch', size: 1000, data: [
        {type: 'leaf', size: 350, data: {id: 'left', views: ['code', 'yaml'], activeView: 'code'}},
        {type: 'leaf', size: 500, data: {id: 'right', views: ['stage'], activeView: 'stage'}}
    ]});
    assert.equal(grid.root.type === 'branch' && grid.root.data.length, 3);
});
