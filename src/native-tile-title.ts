export function observeTileNameTitles(list: HTMLElement | null) {
    if (!list) return;
    const update = () => {
        for (const tile of list.querySelectorAll<HTMLElement>('[class*="sprite-selector-item_sprite-selector-item_"]')) {
            const name = tile.querySelector('[class*="sprite-selector-item_sprite-name_"]')?.textContent ?? '';
            if (tile.title !== name) tile.title = name;
        }
    };
    // The native sortable list can mount or replace its tiles after the host renders.
    const observer = new list.ownerDocument.defaultView.MutationObserver(update);
    observer.observe(list, {subtree: true, childList: true, characterData: true});
    update();
    return () => observer.disconnect();
}
