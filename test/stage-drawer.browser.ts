import assert from 'node:assert/strict';
import {test} from 'node:test';
import {chromium, expect} from '@playwright/test';
import type {Page} from '@playwright/test';

const preview = process.env.TW_PLUS_LAYOUT_EDITOR_URL;
const displayMenu = (page: Page) => page.getByRole('button', {name: 'ステージの表示', exact: true});
const frame = (page: Page) => page.locator('[data-plus-stage-frame]');
const canvas = (page: Page) => frame(page).locator('[data-gui-stage] canvas').first();

test('the default stage opens from the right edge and docks back from a real Dockview popup',
    {skip: !preview, timeout: 45_000}, async t => {
        const browser = await chromium.launch({args: ['--enable-unsafe-swiftshader']});
        t.after(() => browser.close());
        const page = await browser.newPage({viewport: {width: 1360, height: 900}});
        const url = new URL(preview);
        url.searchParams.set('lang', 'ja');
        await page.goto(url.href);

        const drawer = page.getByRole('button', {name: 'ステージを展開', exact: true});
        await expect(drawer).toHaveAttribute('aria-expanded', 'false');
        await expect(canvas(page)).toBeHidden();
        const rightEdge = await drawer.boundingBox();
        assert.ok(rightEdge && rightEdge.x + rightEdge.width >= 1358);
        await drawer.hover();
        await expect(canvas(page)).toBeVisible();
        await canvas(page).hover();
        await expect(drawer).toHaveAttribute('aria-expanded', 'true');
        await page.mouse.move(500, 400);
        await expect(drawer).toHaveAttribute('aria-expanded', 'false');
        await drawer.press('Enter');
        await expect(canvas(page)).toBeVisible();
        await canvas(page).evaluate(node => {
            window.initialStageCanvas = node;
            window.stageControls = [];
            for (const method of ['greenFlag', 'stopAll']) {
                const original = window.vm[method];
                window.vm[method] = function (...args) {
                    window.stageControls.push(method);
                    return original.apply(this, args);
                };
            }
        });

        const openItem = page.getByRole('menuitem', {name: '別窓で開く', exact: true});
        await page.evaluate(() => {
            const original = window.open;
            window.open = () => {
                window.open = original;
                return null;
            };
        });
        await displayMenu(page).click();
        await openItem.click();
        await expect(canvas(page)).toBeVisible();
        await expect(page.getByRole('region', {name: 'ステージ', exact: true})).toHaveCount(0);

        const openStage = async () => {
            await displayMenu(page).click();
            const [popup] = await Promise.all([page.waitForEvent('popup'), openItem.click()]);
            await expect(popup).toHaveURL(/stage-popout\.html#/);
            await expect(popup.getByRole('tab', {name: 'ステージ', exact: true})).toBeVisible();
            await expect(canvas(popup)).toBeVisible();
            await expect(page.getByRole('region', {name: 'ステージ', exact: true})).toHaveCount(0);
            assert.ok(await page.evaluate(() => window.initialStageCanvas.ownerDocument !== document));
            return popup;
        };

        const expectDocked = async () => {
            await drawer.click();
            await expect(canvas(page)).toBeVisible();
            assert.ok(await canvas(page).evaluate(node => node === window.initialStageCanvas));
        };

        const popup = await openStage();
        await frame(popup).locator('[class*="green-flag_green-flag_"]').click();
        await frame(popup).locator('[class*="stop-all_stop-all_"]').click();
        await expect.poll(() => page.evaluate(() => window.stageControls)).toEqual(['greenFlag', 'stopAll']);
        await displayMenu(popup).click();
        await Promise.all([
            popup.waitForEvent('close'),
            popup.getByRole('menuitem', {name: 'ドックに戻す', exact: true}).click()
        ]);
        await expectDocked();

        const reopened = await openStage();
        await Promise.all([
            reopened.waitForEvent('close'),
            reopened.getByRole('button', {name: 'Close ステージ', exact: true}).click()
        ]);
        await expectDocked();

        const last = await openStage();
        await last.close();
        await expectDocked();
    });

test('the drawer trigger stays on the physical right edge in a right-to-left locale',
    {skip: !preview, timeout: 20_000}, async t => {
        const browser = await chromium.launch({args: ['--enable-unsafe-swiftshader']});
        t.after(() => browser.close());
        const page = await browser.newPage({viewport: {width: 1360, height: 900}});
        const url = new URL(preview);
        url.searchParams.set('lang', 'ar');
        await page.goto(url.href);

        const drawer = page.getByRole('button', {name: 'Reveal stage', exact: true});
        await expect(drawer).toHaveCSS('direction', 'rtl');
        const closedBounds = await drawer.boundingBox();
        await drawer.hover();
        await expect(canvas(page)).toBeVisible();
        const openBounds = await drawer.boundingBox();
        assert.equal(openBounds.x, closedBounds.x);
        await canvas(page).hover();
        await expect(drawer).toHaveAttribute('aria-expanded', 'true');
    });

test('the startup option restores the previous stage layout',
    {skip: !preview, timeout: 20_000}, async t => {
        const browser = await chromium.launch({args: ['--enable-unsafe-swiftshader']});
        t.after(() => browser.close());
        const page = await browser.newPage({viewport: {width: 1360, height: 900}});
        const url = new URL(preview);
        url.searchParams.set('lang', 'ja');
        url.searchParams.set('twPlusStageDrawer', '0');
        await page.goto(url.href);

        await expect(canvas(page)).toBeVisible();
        await expect(page.getByRole('button', {name: 'ステージを展開', exact: true})).toHaveCount(0);
        await displayMenu(page).click();
        await expect(page.getByRole('menuitem', {name: 'アンドック', exact: true})).toBeEnabled();
    });
