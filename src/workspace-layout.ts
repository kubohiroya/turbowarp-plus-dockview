import {Orientation} from 'dockview';
import type {SerializedDockview} from 'dockview';
import type {DocumentPanelRequest} from './document-workspace.ts';

type Grid = SerializedDockview['grid'];
type Node = Grid['root'];
export type PanelReference =
    | {kind: 'sprite'; name: string; stage: boolean; section: number}
    | {kind: 'stage'}
    | ({kind: 'document'} & DocumentPanelRequest['reference']);

export interface WorkspaceLayout {
    version: 1;
    project: string;
    grid: Grid;
    activeGroup: string;
    editingView?: string;
    panels: Record<string, PanelReference>;
}

const limit = 256;
const validId = (value: unknown): value is string =>
    typeof value === 'string' && value.length > 0 && value.length <= 1024;
const size = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100000;
const record = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

/** Rebuild only the supported docked grid and logical panel references from storage. */
export function readWorkspaceLayout(raw: string, project: string): WorkspaceLayout | undefined {
    if (raw.length > 1024 * 1024) return;
    let input: unknown;
    try { input = JSON.parse(raw); } catch { return; }
    if (!record(input) || input.version !== 1 || input.project !== project || !record(input.grid) ||
        !record(input.panels) || !validId(input.activeGroup)) return;
    const {width, height, orientation} = input.grid;
    if (!size(width) || !width || !size(height) || !height ||
        (orientation !== Orientation.HORIZONTAL && orientation !== Orientation.VERTICAL)) return;
    const groups = new Set<string>();
    const ids = new Set<string>();
    let nodes = 0;
    function readNode(node: unknown, depth: number): Node | undefined {
        if (depth > 32 || ++nodes > limit || !record(node) || !size(node.size)) return;
        if (node.type === 'branch' && Array.isArray(node.data) && node.data.length > 0 && node.data.length <= limit) {
            const data: Node[] = [];
            for (const child of node.data) {
                const next = readNode(child, depth + 1);
                if (!next) return;
                data.push(next);
            }
            return {type: 'branch', size: node.size, data};
        }
        if (node.type !== 'leaf' || !record(node.data)) return;
        const {id, views, activeView} = node.data;
        if (!validId(id) || groups.has(id) || !Array.isArray(views) || !views.length ||
            views.length > limit || !validId(activeView) || !views.includes(activeView)) return;
        groups.add(id);
        for (const panel of views) {
            if (!validId(panel) || ids.has(panel) || ids.size >= limit) return;
            ids.add(panel);
        }
        return {type: 'leaf', size: node.size, data: {id, views, activeView}};
    }
    const root = readNode(input.grid.root, 0);
    if (root?.type !== 'branch' || !groups.has(input.activeGroup) ||
        ids.size !== Object.keys(input.panels).length) return;
    const panels: WorkspaceLayout['panels'] = Object.create(null);
    const documents = new Set<string>();
    let hasStage = false;
    for (const id of ids) {
        const panel = input.panels[id];
        if (!Object.hasOwn(input.panels, id) || !record(panel)) return;
        if (panel.kind === 'sprite' && validId(panel.name) && typeof panel.stage === 'boolean' &&
            typeof panel.section === 'number' && Number.isInteger(panel.section) && panel.section >= 0 && panel.section <= 3) {
            panels[id] = {kind: 'sprite', name: panel.name, stage: panel.stage, section: panel.section};
        } else if (panel.kind === 'stage' && !hasStage) {
            hasStage = true;
            panels[id] = {kind: 'stage'};
        } else if (panel.kind === 'document' && validId(panel.providerId) && validId(panel.documentId)) {
            const key = JSON.stringify([panel.providerId, panel.documentId]);
            if (documents.has(key)) return;
            documents.add(key);
            panels[id] = {kind: 'document', providerId: panel.providerId, documentId: panel.documentId};
        } else return;
    }
    const editingView = input.editingView;
    if (editingView !== undefined && (!validId(editingView) || panels[editingView]?.kind !== 'sprite')) return;
    return {version: 1, project, grid: {root, width, height, orientation}, activeGroup: input.activeGroup,
        editingView: typeof editingView === 'string' ? editingView : undefined, panels};
}
