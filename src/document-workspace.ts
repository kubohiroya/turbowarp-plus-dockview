export interface DocumentPanelRequest {
    reference: {providerId: string; documentId: string};
    filename: string;
    mount(element: HTMLElement, close: () => void): {requestClose(): void; dispose(): void};
}

function createDocumentWorkspace() {
    let open: ((request: DocumentPanelRequest) => void) | undefined;
    return {
        open(request: DocumentPanelRequest) {
            if (!open) return false;
            open(request);
            return true;
        },
        connect(handler: NonNullable<typeof open>) {
            open = handler;
            return () => { if (open === handler) open = undefined; };
        }
    };
}

const workspaces = new WeakMap<object, ReturnType<typeof createDocumentWorkspace>>();

export function getDocumentWorkspace(vm: object) {
    let workspace = workspaces.get(vm);
    if (!workspace) {
        workspace = createDocumentWorkspace();
        workspaces.set(vm, workspace);
    }
    return workspace;
}
